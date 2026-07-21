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
Run these nine SQL files, in this exact order, in the **SQL Editor**
(New Query → paste → Run → wait for success message, then move to the next
file):

1. `supabase-schema.sql` — core tables (events, photos, profiles) and RLS
2. `payment-schema.sql` — payment/billing tables and columns
3. `pricing-tiers-migration.sql` — self-serve account policies + guest-count
   pricing tiers (free vs. paid plans)
4. `event-owner-photos-fix.sql` — lets an event's creator view/manage its
   photos directly, without needing to join their own event as a guest
5. `photo-cap-per-guest.sql` — per-guest photo quota by tier (disposable
   camera style "N shots" limit), enforced server-side via trigger
6. `error-logging.sql` — critical error log table, written to automatically
   by the app so bugs can be diagnosed without needing DevTools on the
   device that hit them
7. `guest-display-names.sql` — lets guests name themselves on join, so the
   gallery can group photos into per-guest albums
8. `security-hardening.sql` — **required before accepting real payments.**
   Locks `events.tier`/`guest_cap`/`photo_cap_per_guest`/`is_paid`/
   `payment_status` so only the payment webhook (service role) can ever
   mark an event paid — closes the gap where any signed-in user could
   open DevTools and mark their own event paid for free. Also moves guest
   cap and upload rate limiting from client-only checks to real DB
   enforcement. Fully payment-provider-agnostic. See `PAYMENT_SETUP.md`
   for the webhook this depends on.
9. `paystack-migration.sql` — renames a Stripe-specific column now that
   the app uses Paystack (Stripe doesn't support South African merchant
   payouts — see `PAYMENT_SETUP.md`)
10. `google-oauth-profile-trigger.sql` — DB trigger that auto-creates a
    `user_profiles` row for every new `auth.users` row, covering Google
    sign-in (which never runs the client-side insert that email/password
    signup used to rely on). Required for Step 6b (Google Sign-In) below.
11. `event-archive-and-emails.sql` — adds `events.photos_purged_at`, a
    private `event-archives` storage bucket, and a daily `pg_cron` job that
    zips and emails an organizer their photos ~30 days after an event
    expires, then deletes them to free up storage. Required for the email
    system — see `EMAIL_SETUP.md`.

Files 1-9 must be applied for the app to work — signup, event creation,
guest joining, organizers seeing their own event's gallery, per-guest
photo limits, and payment integrity all depend on policies added in files
3 through 5, and 7 through 9. File 6 is diagnostic only (nothing breaks
without it, but you'll fly blind on bugs). File 10 is only needed if you
enable Google Sign-In (Step 6b). File 11 is only needed if you set up the
email system (`EMAIL_SETUP.md`).

### Checking error logs
Once file 6 is applied, run this in the SQL Editor any time something goes
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
1. Click the `event-photos` bucket
2. Go to **Policies**
3. Click **New policy → For authenticated users**
4. Select **Upload (insert)**
5. Paste this policy:
```sql
(bucket_id = 'event-photos') AND 
(auth.role() = 'authenticated')
```
6. Click **Save**

7. Create another policy for **Download (select)**:
```sql
(bucket_id = 'event-photos')
```
8. Click **Save**

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
- [ ] SQL files 1-9 applied, in order (Step 3); file 10 too if using Google Sign-In
- [ ] Storage bucket created with RLS
- [ ] Anonymous Sign-Ins enabled (guests can't upload without this)
- [ ] Confirm email is toggled ON (Step 6a)
- [ ] Google provider configured and Redirect URLs allowlisted (Step 6b), if using Google Sign-In
- [ ] `.env.local` added to `.gitignore` (should already be there)
- [ ] No credentials in code files

---

If you get stuck, share the error and I'll help debug.
