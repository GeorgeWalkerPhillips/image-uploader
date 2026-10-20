# Wedding HQ

A private two-person wedding and honeymoon planner that lives inside this app at
`/hq`. It is **unrelated to Capture by Val** (the event photo product) and shares
only the Supabase project, the auth session and the glass design tokens. Code is
strict TypeScript under `src/wedding/`.

## Privacy and security model

- **RLS is the lock, the route is only a door.** Every `wedding_*` table and the
  private `wedding-files` storage bucket are readable and writable only by the
  accounts in `wedding_members` (`wedding_is_member()`). Anonymous guest sessions
  are rejected. Nothing in the client is a security boundary.
- **Hidden, not secret-by-obscurity.** `/hq` is lazy-loaded, unlinked, absent from
  `sitemap.xml` and `robots.txt`, sets `<meta name="robots" content="noindex,nofollow">`
  and (in production on Vercel) an `X-Robots-Tag: noindex, nofollow` header. What a
  visitor sees depends on who they are: signed out or anonymous goes to login (with
  `next`); signed in without the planner sees "Get the Wedding Planner"; entitled
  without a wedding sees setup; a partner or helper sees the app. `/hq/join` sits
  outside this gate.
- **No personal data in this repository** (it is public). Names, budgets, dates,
  guests and files are seeded straight into the database, never committed. Tests
  and screenshots use fictional data only.
- **Membership is by auth user id, never by a bare email match** (sign-up is open
  and unconfirmed, so an email match could be spoofed). Invites are accepted only by
  a signed-in account with a confirmed email equal to the invited address.
- Files are only ever opened through 5 minute signed URLs. Those URLs are never
  cached by the app, the offline cache or the service worker.
- Realtime does not widen access: Supabase Realtime applies the same RLS to what a
  subscriber is sent.

## Setup

Apply the SQL files by hand in the Supabase SQL Editor, in this order:

1. `wedding-hq-2026-10.sql` creates the tables, the `wedding-files` bucket, RLS and the
   realtime publication entries.
2. `wedding-hq-2026-10b-constraints.sql` adds CHECK constraints (colour format, file
   paths inside the wedding's own folder).
3. `wedding-hq-2026-10c-guests-activity.sql` adds `wedding_guests` and the append-only
   `wedding_activity` feed (already applied in production).

4. `wedding-hq-2026-10e-planner-product.sql` makes HQ multi-tenant (see "Planner product"
   below). Apply in its labelled batches, in order.
5. `wedding-hq-2026-10f-invite-sends.sql` (invite send tracking) and
   `wedding-hq-2026-10g-planner-bundle-backfill.sql` (grants the planner free to owners
   of paid `unlimited` events: `bundle-<event id>` payment references, source `admin`).

The `wedding-files` bucket is created by file 1 and must stay **private**.
No new env vars are needed; HQ uses the same `REACT_APP_SUPABASE_URL` and
`REACT_APP_SUPABASE_ANON_KEY` as the rest of the app. `vercel.json` (repo root)
holds the headers for the HQ service worker and manifest.

### Adding a member

Partners and helpers are normally added through invites (see "Planner product"). The
manual route below remains for the project owner only: in the SQL Editor, using the `id` of the account that
person actually logs in with (Dashboard, Authentication, Users), after the
`wedding_weddings` row exists:

```sql
insert into public.wedding_members (wedding_id, user_id, role, display_name)
values ('<wedding id>', '<that person''s auth user id>', 'groom', 'Their name');
-- role is 'groom' or 'bride'; a role and a user can each appear only once.
```

To remove access, delete the member row.

## Planner product (multi-tenant, `wedding-hq-2026-10e-planner-product.sql`)

Any signed-in, non-anonymous user with a `wedding_planner_entitlements` row (paid via
Paystack, written by the service role; existing members are grandfathered) can call
`create_my_wedding(...)` to get their own wedding, seeded with generic template data
(no names, vendors or amounts). Each wedding is still isolated by `wedding_is_member()`.
One wedding per user in v1.

- **Partner**: invited by email (`wedding_invites`, kind `partner`); takes the free
  groom/bride slot. The couple's membership cannot be changed from the client.
- **Collaborators** (max 10): kind `collaborator`. They are not in `wedding_members`, so
  every existing policy denies them. They can only see and update the status of tasks
  assigned to them (`wedding_tasks.assigned_to`; trigger-enforced), and read
  `my_collab_wedding()` / `wedding_people()`. Couple can remove them; they can leave.
- **Invites**: only the sha256 of the secret token is stored; the token is emailed by an
  Edge Function. Accepting requires a confirmed email equal to the invited address.
  `token_hash` is never granted to clients and the table is not in realtime.

RPC names, shapes and error strings: `WEDDING_PLANNER_CONTRACT.md`.

## Features by phase

1. **Foundation**: gate, Home dashboard, countdowns, budget rings, targets, settings.
2. **Money**: budget categories and lines, quotes (accept to create a line), invoices and
   payments with proof files, savings, "Money spent so far".
3. **Time**: tasks (list, board, subtasks, recurrence) and calendar (month, week, agenda,
   ICS export).
4. **Honeymoon and purchases**: itinerary, bookings, packing list, travel documents,
   currency, purchase checklist with receipts.
5. **Always up to date**: realtime sync, offline read cache, installable PWA, polish.
6. **Email reminders**: a daily 07:00 (Johannesburg) digest email per member of events, tasks
   and payments coming up; per-member settings. Backend only so far; see `EMAIL_SETUP.md`.

## Realtime, offline and install

### Realtime (`lib/realtime.ts`, `useRealtimeSync.ts`)

While HQ is open, one Supabase channel listens (`postgres_changes`, filtered to
`wedding_id=eq.<id>`) to all 17 data tables, including `wedding_guests` and
`wedding_activity`, plus the wedding row itself (`id=eq.<id>`). A change invalidates
the matching React Query key (`[table, weddingId]`), batched over 300 ms. After a
dropped connection comes back, everything is refetched to catch missed changes. The
header badge shows **Live**, **Reconnecting...**, **Connecting...** or **Offline**. The
channel is removed when HQ unmounts (including sign-out). Failures only change the
badge; they never throw into the UI.

Limits: events are a "something changed, refetch" signal, not a data feed; a very
short blip can be missed and is only fixed by the catch-up refetch on reconnect.

### Offline read cache (`lib/persist.ts`, `Persistence.tsx`)

The query cache is saved to `localStorage` under `wedding-hq:cache:<user id>`
(debounced, and on page hide). Only an allowlist of keys is saved (data rows,
membership, member names); signed URLs, storage and auth data are never included.
It expires after 7 days. It is kept only while the user is a couple member or the
planner status says `partner` or `collaborator`. When access is removed (a helper is
removed or leaves) the saved copy is wiped and the matching queries are dropped from
memory so they cannot be saved again. It is also wiped on sign-out, when the user
changes, and caches belonging to other users are removed on load. Offline, HQ shows the last saved data under the banner
"You're offline - showing last saved data". **Writes are never queued**: while offline
they fail immediately with "You're offline. Changes can't be saved until you're back
online." and file links say files need a connection.

Limits: it holds personal data in the browser's storage, so use it only on your own
phone. Signing out through the main app (outside HQ) does not clear it until HQ is
opened next (it is still per-user and expires after 7 days). A screen you never opened
online has nothing saved and shows its normal "could not load" state. If the Supabase
session token expires while you are offline, the app may sign you out on reconnect.

### Installable PWA (`public/hq/`, `pwa.ts`)

Scoped to `/hq/` only. The service worker (`public/hq/sw.js`) and manifest
(`public/hq/manifest.webmanifest`) are registered/injected only from inside HQ after
the membership check, and the main app's manifest link is restored when you leave.
The worker caches only same-origin `/static/*` build assets, a few fixed icons and the
HQ HTML shell. It never touches Supabase, storage, signed URLs or anything cross-origin.
HQ always lives at `/hq/` (with the trailing slash) because the worker's scope is
`/hq/`. When a new version is deployed you get an "Update available" toast with a
Reload button. The worker is registered in production builds only.

### Install button and Save for offline (`useInstallApp.ts`, `components/InstallAppCard.tsx`, `OfflineSaveCard.tsx`)

**Install.** `installStore.ts` listens for `beforeinstallprompt` from the moment the HQ
chunk loads (before the manifest is injected and before the gate resolves; `usePwa`
also calls it, idempotently), calls `preventDefault()` and keeps the event, because
the browser fires it once per page load. `useInstallApp()` returns the platform
(`lib/installPlatform.ts`, pure and unit-tested over a table of user agents), whether a
prompt is ready, and whether the app is already installed (`display-mode: standalone`,
iOS `navigator.standalone` or the `appinstalled` event). Installed means no install UI
at all. `InstallAppCard` shows: a dismissible banner at the top of Home (couple only), a
permanent "Get the app" section in More, and the same section in the helper app. If the
user dismisses the browser's prompt or the banner, that is remembered for 7 days under
`wedding-hq:install-dismissed` (cleared on sign-out with the other `wedding-hq:` keys);
the banner stays away and the More card softens but keeps an install route.

**Save for offline.** The "Save everything for offline" button (More; helpers get
"Save my tasks for offline") fetches, three at a time, every query in the persisted
allowlist (`lib/offlineSave.ts`: the `REALTIME_TABLES`, membership, member names, team
and planner status for a couple member; only status, wedding header, team names and
assigned tasks for a helper) using the same keys and sort order as the screens
(`lib/rowOrder.ts`), shows "Saving 7 of 21...", tolerates single failures ("Saved 20 of
21 - couldn't save Guest list, try again"), then writes the offline copy immediately
(`persist.flushNow`, instead of waiting for the debounced save), stores the time under
`wedding-hq:last-offline-save:<user id>` and asks the worker to cache the app files
(the existing `CACHE_URLS` message; `sw.js` is unchanged and still never caches API
responses). It is disabled while offline. Attachments (receipts, PDFs) are never saved.
The copy is the same 7 day localStorage copy as above: opening the app online
refreshes it, and it is removed on sign-out like the rest.

**What is and is not possible**

| | iPhone / iPad Safari | Chrome / Firefox on iOS 16.4+ | In-app browsers (Instagram, Facebook, WhatsApp) | Android Chrome / Samsung / Edge | Desktop Chrome / Edge |
|---|---|---|---|---|---|
| One-tap install button | No (Apple allows none) | No | No | Yes, when the browser offers it | Yes |
| Install | Share, then Add to Home Screen | Share or the menu, then Add to Home Screen | Not possible: open in Safari or the browser first | Install button, or menu then Install app | Install button or address bar icon |
| Save for offline | Yes | Yes | Not useful (cannot install) | Yes | Yes |

Notes. The browser decides whether to fire the install prompt (criteria, engagement,
and not shortly after a dismissal), so the button appears only when it has; otherwise the
card says "Use your browser menu: Install app / Add to Home screen". On iPhone the Home
Screen app keeps its own storage, separate from Safari: sign in again there, then tap
Save for offline inside it. Firefox on Android has no install prompt (menu only).
Offline is read-only: writes are never queued.

## Testing

```bash
npx tsc --noEmit -p .
CI=true npx react-scripts test --watchAll=false src/wedding
REACT_APP_SUPABASE_URL=https://example.supabase.co REACT_APP_SUPABASE_ANON_KEY=dummy CI=false npm run build
```

Notable suites: `lib/realtime.test.ts` (event to key mapping, debounce, cleanup),
`lib/persist.test.ts` and `Persistence.test.tsx` (per-user keys, expiry, clear on
sign-out), `lib/swRules.test.ts` (runs the real `sw.js` in a `vm` sandbox),
`pwa.test.ts`, `lib/installPlatform.test.ts`, `useInstallApp.test.tsx`,
`components/InstallAppCard.test.tsx`, `components/OfflineSaveCard.test.tsx`. After a build, confirm `build/hq/sw.js` and
`build/hq/manifest.webmanifest` exist and that `build/static/js/main.*.js` has no HQ
code (HQ is a lazy chunk).

## Troubleshooting

- **Sent to `/` after signing in**: your account is not in `wedding_members`
  (check the user id, not the email).
- **Badge stuck on "Reconnecting..."**: the tables are not in the `supabase_realtime`
  publication (re-run files 1 and 3, they are idempotent), or Realtime is disabled for
  the project. Data still works; it just refreshes on navigation/reconnect.
- **Not seeing the other person's edit**: pull to refresh or reopen; check the badge
  says Live.
- **Offline shows "Could not load"**: that screen was never opened online on this
  device, or the 7 day copy expired.
- **No "Install" button**: it must be a production build on HTTPS, signed in as a
  member, at `/hq/`; the browser may also withhold it (use its menu instead). On iPhone
  there is never a button: use Safari's Share, then Add to Home Screen. In dev
  (`npm start`) the worker is intentionally not registered.
- **Stuck on an old version**: close all HQ windows and reopen, or use the Update
  toast. To reset, clear site data for the domain (also removes the offline copy).
- **Service worker file served wrong**: `/hq/sw.js` must be JavaScript with
  `Cache-Control: no-cache` and `Service-Worker-Allowed: /hq/` (see `vercel.json`).
- **Main app behaving oddly after HQ**: it should not; the worker's scope is `/hq/`
  and `/privacy`, `/camera` etc. are never controlled. Unregister via browser site
  settings if in doubt.
