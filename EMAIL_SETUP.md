# Email System Setup Guide

This app sends four kinds of email, all via [Resend](https://resend.com)
(Supabase's own email sending only covers auth emails — signup
confirmation, password reset — not arbitrary app emails):

1. **Event created** — sent when a free-tier event finishes creating.
   Paid-tier events get email #2 instead once payment confirms (not both).
2. **Payment confirmed** — a receipt, sent after the Paystack webhook marks
   an event paid.
3. **Archive ready** — sent ~30 days after an event's `expiry_date` (itself
   already 30 days after the event's own end date, so ~60 days after the
   event actually ended). A daily cron job zips the event's photos, uploads
   the zip to a private bucket, emails the organizer a signed download link
   valid for 7 days, then deletes the photos (storage + DB rows) to free up
   storage. The event record itself is kept. The zip archive is then
   permanently deleted 90 days later (see
   `pro-tier-cap-and-retention-limit.sql`), so storage doesn't grow
   forever with all-time event volume.
4. **Welcome** — sent the moment a new user's email gets confirmed, via a
   DB trigger (not client code, so it fires regardless of which client
   completed the confirmation).

## 1. Create a Resend Account

1. Go to [resend.com](https://resend.com) and sign up
2. **Domains → Add Domain**, add the domain you want to send from (e.g.
   `yourdomain.com`) and add the SPF/DKIM DNS records it gives you at your
   domain registrar. Verification usually takes a few minutes, sometimes
   longer depending on DNS propagation.
   - Until a domain is verified, Resend only lets you send to the email
     address on your own Resend account — real users won't receive
     anything. Verify a domain before relying on this for real events.
3. **API Keys → Create API Key** — copy it, you won't see it again

## 2. Deploy the Edge Functions

Four functions are involved — three new, one existing function extended
with an email send:

```bash
supabase functions deploy send-event-created-email --project-ref <ref>
supabase functions deploy send-welcome-email --project-ref <ref>
supabase functions deploy purge-expired-events --project-ref <ref>
supabase functions deploy paystack-webhook --project-ref <ref>
```

(`paystack-webhook`'s code changed to add the payment-receipt email — if
you deployed it before from `PAYMENT_SETUP.md`, redeploy it now.)

## 3. Set Secrets

**Settings → Edge Functions → Secrets** (these are project-level — shared
by every function, same as `PAYSTACK_SECRET_KEY`):

- `RESEND_API_KEY` — from step 1
- `RESEND_FROM_EMAIL` — e.g. `Valere <notifications@yourdomain.com>`,
  must be on the domain you verified in step 1
- `EMAIL_TRIGGER_SECRET` — only needed for `send-welcome-email`; a random
  string of your choice (e.g. `openssl rand -hex 32`) that the welcome-email
  DB trigger sends back to prove the call really came from Postgres, not an
  arbitrary request — see step 4

`ALLOWED_ORIGIN` should already be set from `PAYMENT_SETUP.md` — reused
here for the event-created and welcome email dashboard links.

## 4. Run the Database Migrations

Run `event-archive-and-emails.sql` in the Supabase SQL Editor, in order
after `security-hardening.sql` and `paystack-migration.sql`. It:

- Adds `events.photos_purged_at` (tracks which events are already archived)
- Creates a private `event-archives` storage bucket
- Enables `pg_cron`/`pg_net` and schedules a daily job that calls
  `purge-expired-events`

**Before running the `cron.schedule` part of that file**, fill in and run
the two `vault.create_secret(...)` calls it documents inline (your real
service role key, from **Settings → API**, and your real function URL) —
the cron job reads them from Vault rather than having the key pasted in
plaintext in a file that's likely committed to source control.

Then run `welcome-email-trigger-migration.sql`, in order after
`google-oauth-profile-trigger.sql`. Same pattern: fill in and run the two
`vault.create_secret(...)` calls it documents inline (your real
`send-welcome-email` function URL, and the same random secret you set as
`EMAIL_TRIGGER_SECRET` in step 3) before the `CREATE TRIGGER` at the
bottom.

The trigger fires in the same transaction Supabase Auth uses to actually
confirm a user's email — and, on every later sign-in, to stamp
`last_sign_in_at` — so its welcome-email HTTP call is wrapped in its own
exception handler on purpose: an unguarded failure there (a missing Vault
secret is the easy way to hit this) would otherwise silently roll back
that confirmation, or block sign-in entirely, even though the page looks
successful. If an earlier version of this file was applied on a live
project without that handling, anyone who tried to confirm in that window
may be stuck unconfirmed — either have them use "Resend confirmation" on
the login page now that the trigger is fixed, or confirm them directly:
```sql
UPDATE auth.users SET email_confirmed_at = NOW()
WHERE email = 'their-email@example.com' AND email_confirmed_at IS NULL;
```

## 5. Testing

### Event-created / payment-receipt emails
Just create a free event, or complete a test payment (see
`PAYMENT_SETUP.md` for test cards) — the email should arrive within a few
seconds. Check `error_logs` (see `SUPABASE_SETUP.md`'s query) if it
doesn't; both sends are fire-and-forget and log failures there rather than
blocking the user-facing flow.

### Welcome email
Sign up a new test account and confirm the email — the welcome email
should arrive within a few seconds of clicking the confirmation link. If it
doesn't:
- `select id, email, email_confirmed_at from auth.users order by created_at desc limit 5;`
  — confirms `email_confirmed_at` actually got set
- Check the `send-welcome-email` function's logs in the Supabase dashboard
  for a 401 (means the Vault `email_trigger_secret` doesn't match the
  function's `EMAIL_TRIGGER_SECRET`) or 502 (Resend send failed — same
  causes as below)

### Archive/purge job
Don't wait for the real 30-day window — invoke the function directly with
your service role key to test it against an event you've manually
backdated:

```sql
-- Make a test event look old enough to be picked up:
update events set expiry_date = now() - interval '31 days' where id = '<test-event-id>';
```

```bash
curl -X POST "https://<your-project-ref>.supabase.co/functions/v1/purge-expired-events" \
  -H "Authorization: Bearer <your-service-role-key>"
```

Check the response JSON, the organizer's inbox for the archive-ready
email, and that the event's `photos` rows / storage objects are gone
afterward (`select photos_purged_at from events where id = '<test-event-id>'`
should now be non-null).

To confirm the cron job itself is wired up (rather than testing the
function directly):

```sql
select jobid, jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
```

## Wedding HQ email reminders

Separate from the Capture by Val emails above. `send-wedding-reminders` sends
each Wedding HQ member **one digest email per day** (never one per item)
listing, grouped as Today / Tomorrow / In N days: events starting that day
(Johannesburg time shown for timed events), open tasks due that day (the
member's own plus "both"), and unpaid invoice balances due that day (amount
shown as `R 15 000,00`). Subject: `Wedding HQ: N things coming up`. Emails
contain only titles, times and payment amounts; never guest details, document
info, notes or bank details. The button opens `<ALLOWED_ORIGIN>/hq/calendar`.

- **Schedule:** pg_cron job `send-wedding-reminders-daily`, 05:00 UTC = 07:00
  Africa/Johannesburg. "Today" is the Johannesburg date.
- **Per-member settings:** `wedding_reminder_settings` (enabled, lead days
  0..30 up to 6, include events/tasks/payments). A member with no row gets the
  defaults: enabled, today + tomorrow, everything included.
- **No repeats:** each sent item is recorded in `wedding_reminder_log`
  (service role only) after the email succeeds; a failed send is retried on
  the next run.
- **Secrets:** none new. Reuses `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
  `ALLOWED_ORIGIN`.

Setup:

1. Apply `wedding-hq-2026-10d-reminders.sql` (batches marked inside the file).
   Before its cron batch, run the one `vault.create_secret(...)` call it
   documents for `wedding_reminders_function_url` (the `service_role_key`
   Vault secret already exists from `event-archive-and-emails.sql`).
2. Deploy: `supabase functions deploy send-wedding-reminders --project-ref <ref>`

Manual run (same auth as the archive job; anything else gets 401):

```bash
curl -X POST "https://<your-project-ref>.supabase.co/functions/v1/send-wedding-reminders" \
  -H "Authorization: Bearer <your-service-role-key>"
```

The response is a count-only summary: `{weddings, members, emailsSent, skipped, errors}`.
To re-test the same day, clear the log: `delete from wedding_reminder_log where wedding_id = '<id>';`
(run as project owner). Failures are written to `error_logs`
(`source like 'send-wedding-reminders%'`) without email addresses.

**Disable:** one member can turn reminders off in their settings row
(`enabled = false`); to stop all of them, `select cron.unschedule('send-wedding-reminders-daily');`.

Logic tests (no Deno needed):

```bash
npx esbuild supabase/functions/_shared/weddingReminders.test.ts --bundle --platform=node --format=esm --outfile=/tmp/weddingReminders.test.mjs && node --test /tmp/weddingReminders.test.mjs
```

## Wedding Planner emails (invites and receipt)

Sent through Resend with the shared Valere template; no new secrets (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ALLOWED_ORIGIN` first https value for links, fallback `https://valere.co.za`).

- **Invitation** (`wedding-invite`, actions create/resend). Subject: `You've been invited to a wedding planner on Valere`. Names the inviter's display name, explains the role in plain words (helper: sees only tasks assigned to them; partner: full access), shows a button to `<origin>/hq/join#token=<token>` and the expiry date (14 days). The token is in the URL fragment so it never reaches server logs or Referer headers; only its sha256 is stored, and it is never returned by the API or logged. Contains no other person's data. If Resend fails, the function returns an error and revokes the just-created invite (a failed resend restores the previous link).
- **Purchase receipt** (`paystack-webhook` / `wedding-planner-verify`, via `applyPlannerPayment`). Subject: `Wedding Planner purchase confirmed`; amount, Paystack reference, button to `<origin>/hq/`. Sent once, by the call that first records the purchase; a send failure never fails the payment and is written to `error_logs` (`wedding-planner:sendReceipt`, email addresses redacted).
- Deploy: `supabase functions deploy wedding-invite --project-ref <ref>` (and the payment functions per `PAYMENT_SETUP.md`).

## Known limitation

`purge-expired-events` zips every due event's photos inside a single Edge
Function invocation, which has finite memory and wall-time budgets. This
is fine at the scale this app currently runs at, but an event with a very
large number of (or very large) photos, or many events becoming due on the
same day, could hit those limits. If that happens in practice, the fix is
to split this into one invocation per event rather than looping over all
due events in one call — see the comment at the top of
`supabase/functions/purge-expired-events/index.ts`.

## Troubleshooting

**No emails sending at all?**
- Confirm the Resend domain is verified (Resend dashboard shows a green
  check) — unverified domains silently only deliver to your own account
- Check `RESEND_API_KEY` / `RESEND_FROM_EMAIL` are set and the from-address
  domain matches the verified domain exactly

**Archive job not running?**
- `select jobid, active from cron.job where jobname = 'purge-expired-events-daily';`
  — if this returns nothing, the `cron.schedule(...)` call in
  `event-archive-and-emails.sql` wasn't run (or failed)
- `select * from cron.job_run_details order by start_time desc limit 5;` —
  check `status`/`return_message` for the last attempt
- A 403 response means the Vault secret for the service role key doesn't
  match the project's actual current key (e.g. it was rotated after the
  secret was created) — update it with `vault.update_secret`

**Organizer never got the archive email but photos are gone?**
- Shouldn't happen — the function only deletes photos after `sendEmail`
  resolves successfully. If you see this, check `error_logs` for the event
  (`source = 'purge-expired-events'`) for what actually happened.
