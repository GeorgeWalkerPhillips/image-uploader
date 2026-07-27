# Supabase Setup Guide

## Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up / Log in
3. Click "New project"
4. Fill in:
   - **Name**: `capture-app` (or your choice)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Pick closest to your users
5. Click "Create new project" and wait ~2 minutes for initialization

## Step 2: Get API Keys
1. Once initialized, go to **Settings → API**
2. Copy these values:
   - `Project URL` → `REACT_APP_SUPABASE_URL`
   - `anon public` key → `REACT_APP_SUPABASE_ANON_KEY`

## Step 3: Create Database Schema
Run these seventeen SQL files, in this exact order, in the **SQL Editor**
(New Query → paste → Run → wait for success message, then move to the next
file):

1. `supabase-schema.sql` — core tables (events, photos, profiles) and RLS
2. `payment-schema.sql` — payment/billing tables and columns
3. `pricing-tiers-migration.sql` — self-serve account policies + guest-count
   pricing tiers (free vs. paid plans)
4. `fix-events-rls-leak.sql` — **critical, required.** `payment-schema.sql`'s
   `events` policy layered on top of `supabase-schema.sql`'s left the whole
   `events` table readable by anyone (`FOR SELECT USING (TRUE)`) — every
   session, including anonymous guests, could read every organizer's event
   names, dates, tier, and payment fields, not just their own. This scopes
   `SELECT` to the event's creator or someone who already holds an
   `event_access` row for it, and adds `get_public_event_info()` (a narrow
   `SECURITY DEFINER` function) so a first-time guest can still see the
   handful of fields they legitimately need before joining.
5. `paid-events-rls-leak-fix.sql` — **critical, required, run right after
   file 4.** `payment-schema.sql`'s own `events` SELECT policy
   (`is_free = TRUE OR is_paid = TRUE OR created_by = auth.uid()`) was never
   dropped by file 4 — Postgres ORs every permissive policy on a table
   together, so that leftover policy alone kept exposing almost every event
   in the app (every free-tier event has `is_free = TRUE`; every completed
   paid-tier event has `is_paid = TRUE`) to any session, undoing file 4's
   fix. This drops that policy, leaving only file 4's correctly-scoped one.
6. `event-owner-photos-fix.sql` — lets an event's creator view/manage its
   photos directly, without needing to join their own event as a guest
7. `photo-cap-per-guest.sql` — per-guest photo quota by tier (disposable
   camera style "N shots" limit), enforced server-side via trigger
8. `error-logging.sql` — critical error log table, written to automatically
   by the app so bugs can be diagnosed without needing DevTools on the
   device that hit them
9. `guest-display-names.sql` — lets guests name themselves on join, so the
   gallery can group photos into per-guest albums
10. `security-hardening.sql` — **required before accepting real payments.**
    Locks `events.tier`/`guest_cap`/`photo_cap_per_guest`/`is_paid`/
    `payment_status` so only the payment webhook (service role) can ever
    mark an event paid — closes the gap where any signed-in user could
    open DevTools and mark their own event paid for free. Also moves guest
    cap and upload rate limiting from client-only checks to real DB
    enforcement. Fully payment-provider-agnostic. See `PAYMENT_SETUP.md`
    for the webhook this depends on.
11. `free-tier-event-limit.sql` — backfills `guest_cap`/`photo_cap_per_guest`
    on events created before file 7/10 existed, and adds a server-side
    limit of one free-tier event per account, ever.
12. `paystack-migration.sql` — renames a Stripe-specific column now that
    the app uses Paystack (Stripe doesn't support South African merchant
    payouts — see `PAYMENT_SETUP.md`)
13. `google-oauth-profile-trigger.sql` — DB trigger that auto-creates a
    `user_profiles` row for every new `auth.users` row, covering Google
    sign-in (which never runs the client-side insert that email/password
    signup used to rely on). Required for Step 6b (Google Sign-In) below.
14. `event-archive-and-emails.sql` — adds `events.photos_purged_at`, a
    private `event-archives` storage bucket, and a daily `pg_cron` job that
    zips and emails an organizer their photos ~30 days after an event
    expires, then deletes them to free up storage. Required for the email
    system — see `EMAIL_SETUP.md`.
15. `welcome-email-trigger-migration.sql` — DB trigger that emails a new
    user via `send-welcome-email` the moment their `email_confirmed_at`
    first gets set. Additive alongside file 13's trigger (different
    function/trigger names). Required for the email system — see
    `EMAIL_SETUP.md`.
16. `payment-required-for-guest-access.sql` — **required before accepting
    real payments**, alongside file 10. Closes the gap where a paid-tier
    event was fully usable (guests could join and upload) the instant it
    was created, even if payment was never completed — file 10's trigger
    already assigns the tier's full guest/photo caps on INSERT regardless
    of `is_paid`. This adds the missing check to the guest-join and
    photo-upload triggers, and extends `get_public_event_info()` (from
    file 4) to expose `is_paid`/`payment_status` so the app can show a
    friendly message instead of a raw DB error.
17. `pro-tier-cap-and-retention-limit.sql` — caps the "unlimited" tier
    (displayed as "Pro" in the UI, DB key unchanged) at 500 guests / 50
    photos each instead of no cap at all, and adds `archive_purged_at` so
    `purge-expired-events` can permanently delete an event's archive zip
    90 days after it's created instead of keeping it forever — both
    changes needed so the one-time-per-event price can't be outrun by an
    unbounded recurring storage cost. Requires redeploying
    `paystack-initialize` and `paystack-webhook` (their tier
    amount/cap tables mirror this file — see the comment at the top of
    each) and `purge-expired-events` (new archive-deletion pass).

Files 1-9 must be applied for the app to work — signup, event creation,
guest joining, organizers seeing their own event's gallery, per-guest
photo limits, and payment integrity all depend on policies added in files
3 through 7, and 9. Files 4-5 are also security-critical on their own (see
above) — apply them even on an already-running project, not just fresh
setups. File 8 is diagnostic only (nothing breaks without it, but you'll
fly blind on bugs). File 13 is only needed if you enable Google Sign-In
(Step 6b). Files 14-15 are only needed if you set up the email system
(`EMAIL_SETUP.md`). Files 10, 16, and 17 must be applied before accepting
real payments.

### Checking error logs
Once file 8 is applied, run this in the SQL Editor any time something goes
wrong to see exactly what happened, on any device, without needing
DevTools:
```sql
SELECT created_at, severity, source, message, context
FROM error_logs
ORDER BY created_at DESC
LIMIT 20;
```

## Step 4: Create Storage Buckets
1. Go to **Storage** → **Buckets**
2. Create new bucket named: `event-photos`
3. Make it **Public** (for CDN access)
4. Click **Create bucket**

## Step 5: Set Storage RLS Policy
Run `storage-bucket-listing-lockdown.sql` in the SQL Editor. Do **not** use
the dashboard's "New policy" wizard for this bucket — a
`(bucket_id = 'event-photos')` **Download (select)** policy with no
`auth.uid()` check (what earlier versions of this guide had you paste in
by hand) also governs `.list()`, not just single-file fetches, so it lets
any anon or authenticated session enumerate every event's uploaded photos,
not just fetch a photo whose exact path they already know.

If you already created that policy through the dashboard on an existing
project: go to **Storage → event-photos → Policies** and delete the
existing "Download"/select policy *before* running the SQL file — Postgres
ORs every permissive policy on a table together, so leaving the old one in
place means the leak persists no matter what the new one says.

Photo display is unaffected either way: the bucket stays **Public**, and
Supabase serves a public bucket's object bytes for a known path without
consulting these policies at all — only `.list()` and authenticated
`.download()` calls go through them.

## Step 6: Enable Anonymous Sign-Ins (required for guest uploads)

Guests scan a QR code / open the event link and should be able to upload
immediately, with no signup — like a disposable camera. This app uses
Supabase's anonymous auth to give each guest a session behind the scenes.

1. Go to **Authentication → Sign In / Providers**
2. Find **Anonymous Sign-Ins** and toggle it **ON**
3. Save

If this is off, guests visiting an event link will see "Could not join this
event" and uploads will fail.

## Step 6a: Confirm email verification is on

Email/password signup already sends a confirmation link (`AuthContext.js`
passes `emailRedirectTo`) and the UI already handles the "please confirm
your email" and resend-confirmation cases (`Login.js`) — but the actual
gate is a dashboard toggle, not app code.

1. Go to **Authentication → Sign In / Providers → Email**
2. Make sure **Confirm email** is toggled **ON**
3. (Optional) Go to **Authentication → Emails** to customize the "Confirm
   signup" template's subject/body — the default Supabase template works
   but references generic branding

If this is off, `supabase.auth.signUp` returns an already-active session
and no confirmation email is ever sent.

## Step 6b: Enable Google Sign-In

1. **Google Cloud Console** (console.cloud.google.com) → create/select a
   project → **APIs & Services → OAuth consent screen**: configure it
   (External user type is fine for a public app)
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**,
   type **Web application**
3. Under **Authorized redirect URIs**, add your Supabase callback URL:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (found on **Settings → API** in Supabase, or in the Google provider
   setup screen in the next step, which shows it for you)
4. Copy the generated **Client ID** and **Client Secret**
5. In Supabase: **Authentication → Sign In / Providers → Google**, toggle
   it **ON**, paste the Client ID and Client Secret, **Save**
6. **Authentication → URL Configuration**: add your app's URLs to
   **Redirect URLs** (e.g. `http://localhost:3000/**` for dev and
   `https://capture-by-val.vercel.app/**` for prod) — Google/email
   redirects are rejected if they don't match this allowlist
7. Run `google-oauth-profile-trigger.sql` (SQL file 10 above) if you
   haven't already, so Google sign-ins get a `user_profiles` row

The app's "Continue with Google" button on `/login` handles both sign-up
and sign-in — Supabase creates the account automatically on first use.

## Step 7: Configure .env
1. Copy `.env.example` to `.env.local`
2. Fill in your values from Step 2
3. No payment-related env var is needed here — Paystack's secret key lives
   only in the Edge Function secrets (see `PAYMENT_SETUP.md`), never in the
   React app
4. **Never commit `.env.local`** to git
5. **Restart `npm start`** after any change to `.env.local` — Create React
   App only reads env vars at dev-server startup, so edits won't take effect
   until you restart

## Step 8: Test Connection
Run:
```bash
npm start
```

You should see the app load with no errors in the browser console.

If you see `net::ERR_NAME_NOT_RESOLVED` for your Supabase URL, the hostname
in `REACT_APP_SUPABASE_URL` doesn't match a real, live project — re-copy the
Project URL from **Settings → API** and confirm the project isn't paused or
deleted.

## Security Checklist
- [ ] Project URL and Anon Key copied to `.env.local`
- [ ] SQL files 1-9 applied, in order (Step 3), including the critical
      RLS-leak fixes in files 4-5; file 13 too if using Google Sign-In
- [ ] Storage bucket created and `storage-bucket-listing-lockdown.sql` run
      (Step 5) — not the old dashboard-pasted open policy
- [ ] Anonymous Sign-Ins enabled (guests can't upload without this)
- [ ] Confirm email is toggled ON (Step 6a)
- [ ] Google provider configured and Redirect URLs allowlisted (Step 6b), if using Google Sign-In
- [ ] `.env.local` added to `.gitignore` (should already be there)
- [ ] No credentials in code files

---

If you get stuck, share the error and I'll help debug.
