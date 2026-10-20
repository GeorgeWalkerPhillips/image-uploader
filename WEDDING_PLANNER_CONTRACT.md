# Wedding planner product: database contract

Source of truth: `wedding-hq-2026-10e-planner-product.sql`. All RPCs are called with
the signed-in user's JWT (`supabase.rpc(name, args)`); anonymous guest sessions are
always rejected. Errors arrive as `error.message`; the strings below are safe to show.

## Who writes what

| Data | Written by | Read by |
|---|---|---|
| `wedding_planner_entitlements` | service role only (Paystack function), or SQL | user: own row |
| `wedding_invites` (insert, expiry, stale-revoke) | invite Edge Function (service role) | couple, non-secret columns only |
| `wedding_invites.revoked_at` | `revoke_wedding_invite` RPC | couple |
| `wedding_invites.accepted_*` | `accept_wedding_invite` RPC | couple |
| `wedding_collaborators` insert | `accept_wedding_invite` only | couple (their wedding); collaborator (own row) |
| `wedding_collaborators` delete | `remove_collaborator` / `leave_wedding` (or direct delete by couple) | |
| `wedding_members`, `wedding_weddings` insert | `create_my_wedding` / `accept_wedding_invite` only | existing policies |
| `wedding_tasks.assigned_to` | couple (normal task update/insert) | |
| task `status`/`completed_at`/`completed_by` | couple, or the assigned collaborator | |

## Tables

- `wedding_planner_entitlements(user_id pk, payment_reference unique, amount_cents, source 'paystack'|'grandfathered'|'admin', paid_at, created_at)`.
  Service role: insert with a unique `payment_reference` (idempotency key), `on conflict (payment_reference) do nothing`.
  Existing members were grandfathered (`grandfathered-<user_id>`, 0).
- `wedding_collaborators(wedding_id, user_id, display_name, added_by, created_at)`; max 10 per wedding, one wedding per user.
- `wedding_invites(id, wedding_id, email, kind 'partner'|'collaborator', display_name, token_hash, invited_by, expires_at default now()+14d, accepted_at, accepted_by, revoked_at, created_at)`.
  - Client SELECT must list columns: `id, wedding_id, email, kind, display_name, expires_at, accepted_at, revoked_at, created_at`. `select('*')` fails with permission denied by design (`token_hash`).
  - Edge Function insert: `email = lower(btrim(email))`, `token_hash = sha256 hex (64 lowercase chars) of the UTF-8 token string`, token at least 16 and at most 200 chars (use 32+ random bytes, base64url/hex). Never store the token.
  - One OPEN (not accepted, not revoked) invite per `(wedding_id, lower(email))`. Revoke stale/expired rows (`revoked_at = now()`) before re-inviting.
  - The function should itself check: inviter is a couple member, partner invite only if the wedding has fewer than 2 members, collaborator cap, and email not already in the wedding. The RPC re-enforces caps at accept time.
  - NOT in the realtime publication (refetch instead).
- `wedding_tasks.assigned_to uuid null` (a couple member or collaborator of the same wedding; auto-cleared when that collaborator leaves).

## RPCs (all `authenticated` only)

| Call | Returns |
|---|---|
| `my_wedding_planner_status()` | `{ entitled: boolean, wedding_id: uuid\|null, access: 'partner'\|'collaborator'\|null, role: 'groom'\|'bride'\|null }`. `entitled` = has paid/grandfathered (a partner who joined by invite has `entitled:false` but `access:'partner'`). |
| `create_my_wedding(p_name text, p_wedding_date date, p_my_role 'groom'\|'bride', p_my_display_name text)` | new wedding `uuid`. Seeds generic categories, zero-amount lines, packing, travel docs, purchase checklist. Wedding currency/timezone use table defaults (ZAR, Africa/Johannesburg); the couple can edit them. |
| `accept_wedding_invite(p_token text, p_display_name text default null)` | `{ wedding_id, kind }`. Name fallback: `p_display_name`, invite's `display_name`, else the email local part. Caller's confirmed auth email must equal the invite email. |
| `wedding_people(p_wedding uuid)` | rows `{ user_id, display_name, kind 'partner'\|'collaborator', role 'groom'\|'bride'\|null }`. Couple: everyone. Collaborator: self plus the couple. Others: no rows. |
| `my_collab_wedding()` | rows `{ id, name, wedding_date }` (zero or one) for a collaborator; their only view of the wedding. |
| `remove_collaborator(p_wedding uuid, p_user uuid)` | void; couple only. |
| `revoke_wedding_invite(p_invite uuid)` | void; couple only; only open invites. |
| `leave_wedding()` | void; collaborator leaves. |
| `wedding_has_access(uuid)`, `wedding_is_collaborator(uuid)` | boolean helpers. |

## Error messages

- `Please sign in with a full account.` anonymous / signed out
- `Please confirm your email address first.` accept with unconfirmed email
- `This invite is not valid or has expired.` any token/email/expiry/revoked/used problem (deliberately identical)
- `You already belong to a wedding.` caller is already a partner or collaborator (also race losers)
- `This wedding cannot accept more people.` partner slots (2) or collaborator cap (10) full
- `This wedding has reached its limit of 10 collaborators.` direct-insert cap trigger (service role path)
- `Purchase the planner to create a wedding.` no entitlement
- `Wedding name must be 1 to 120 characters.` / `Please choose the wedding date.` / `Role must be groom or bride.` / `Your name must be 1 to 80 characters.`
- `Not allowed.` / `Collaborator not found.` / `Invite not found.` / `You are not a collaborator on any wedding.`
- `Collaborators can only change a task's status.` collaborator edited another column
- `Tasks can only be assigned to people in this wedding.`

## Collaborator access (RLS)

A collaborator is not in `wedding_members`, so every existing policy (all `wedding_*` tables, `wedding-files` storage) denies them. They get exactly: SELECT/UPDATE on `wedding_tasks` rows where `assigned_to` is them (UPDATE limited by trigger to status, completed_at, completed_by = self), their own `wedding_collaborators` row, and the RPCs above. No reads of `wedding_weddings`, members, budget, files, activity or reminders.
