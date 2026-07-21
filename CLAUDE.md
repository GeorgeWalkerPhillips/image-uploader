# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Capture by Val" — a disposable-camera-style event photo app. An organizer
creates an event and shares a QR code/link; guests open it, get an anonymous
session automatically, and upload photos straight from the camera with no
signup (`/?event=<id>` → redirects to `/camera?event=<id>`). The organizer
views/manages all photos in an admin gallery. Pricing is one-time-per-event
by guest count (not a subscription), processed via Paystack.

Bootstrapped with Create React App (react-scripts 5), deployed on Vercel
(`capture-by-val.vercel.app`). The project previously used Firebase
(Firestore/Storage/Auth) before migrating to Supabase — see
`PHASE1_COMPLETE.md` for that decision — and all Firebase config/SDK
usage has since been removed.

## Commands

- `npm start` — dev server at localhost:3000. **Must restart after any
  `.env.local` change** — CRA only reads env vars at startup.
- `npm run build` — production build to `build/`.
- `npm test` — CRA/Jest test runner in interactive watch mode.
  - Single test file: `npm test -- src/App.test.js`
  - Single test name: `npm test -- -t "test name"`
- No lint script is defined beyond the CRA-bundled `eslintConfig` in
  `package.json` (`react-app`, `react-app/jest`) — lint runs automatically
  as part of `npm start`/`npm run build`.

There is no backend build step in this repo: the "server" is Supabase
(Postgres + RLS + Edge Functions), configured through the Supabase
dashboard/SQL editor, not through files that get deployed from here.

## Architecture

**Client**: React 18 + `react-router-dom` v7. Routes are declared flat in
`src/App.js` (Home, `/camera`, `/login`, `/reset-password`, `/admin`
(protected), `/gallery`, `/privacy`, `/terms`). `AuthProvider` wraps
everything; `ProtectedRoute` gates `/admin` on a signed-in non-anonymous
user.

**Backend is entirely Supabase** — Postgres with Row Level Security as the
real authorization boundary, not app code. Frontend `services/*.js` modules
are thin wrappers around `supabase-js` calls; they do client-side
convenience checks (fail fast, better error messages) but the actual
security enforcement is in DB policies/triggers, since any client-side
check can be bypassed via DevTools:
- `src/supabaseClient.js` — client init from `REACT_APP_SUPABASE_URL`/`REACT_APP_SUPABASE_ANON_KEY`.
- `src/context/AuthContext.js` — session state, sign up/in/out, anonymous
  guest sign-in, password reset, and best-effort audit logging to
  `audit_logs` (never blocks the actual auth action if logging fails).
- `src/services/eventAccessService.js` — guest join flow: creates an
  anonymous session, checks the event's guest cap via a
  `SECURITY DEFINER` RPC (`get_public_event_info`) since a first-time guest
  has no RLS-visible row yet to read the events table through, then
  upserts an `event_access` row.
- `src/services/uploadService.js` — upload pipeline: rate limit →
  validate → per-guest photo-cap check → compress → sanitize filename →
  upload to `event-photos` storage bucket → insert `photos` row (rolls
  back the storage object if the DB insert fails).
- `src/services/pricingTiers.js` — pure pricing data (free/starter/growth/
  unlimited), imported by UI and mirrored (amounts, guest/photo caps) in
  two other places that must be kept in sync: the `paystack-initialize`
  and `paystack-webhook` Supabase Edge Functions, and
  `security-hardening.sql`'s billing-integrity trigger.

**Payments (Paystack, hosted-checkout flow, not the Inline/client SDK
flow)**: no public key or Paystack JS ever loads client-side. An Edge
Function (`paystack-initialize`) recomputes the charge amount server-side
from the tier key and returns a hosted checkout URL; the browser redirects
there and back. Only the `paystack-webhook` Edge Function (HMAC-SHA512
verified, using the service role key) is allowed to mark an event paid —
enforced by a DB trigger (`security-hardening.sql`), not app logic, so it
can't be bypassed by calling the REST API directly. Edge Function source
lives under `supabase/functions/` (deployed via `supabase functions deploy`,
per the deploy comment at the top of each `index.ts`); `PAYMENT_SETUP.md`
walks through the full flow and dashboard/secrets setup.

**Email (Resend, sent only from Edge Functions)**: Supabase's own email
sending covers auth emails only (signup confirmation, password reset) —
anything else goes through Resend via a shared `supabase/functions/_shared/resend.ts`
helper, never client-side (no email API key is ever exposed to the
browser). Three flows: `send-event-created-email` (client-invoked, free-tier
events only — paid-tier events get an equivalent email from
`paystack-webhook` once payment confirms instead), the payment-receipt
email added to `paystack-webhook` itself, and `purge-expired-events` (a
daily `pg_cron` job, see `event-archive-and-emails.sql`) which ~30 days
after an event's `expiry_date` zips that event's photos into a private
`event-archives` bucket, emails the organizer a signed 7-day download link,
and only then deletes the photos (storage + DB rows) — the event record
itself is kept. See `EMAIL_SETUP.md` for the full setup.

**Database migrations**: there's no migration framework — schema changes
are plain `.sql` files at the repo root, applied by hand in the Supabase
SQL Editor in a specific documented order. See `SUPABASE_SETUP.md` for the
authoritative order and what each file does; the load-bearing ones:
`supabase-schema.sql` (core tables/RLS) → `payment-schema.sql` →
`pricing-tiers-migration.sql` → `event-owner-photos-fix.sql` →
`photo-cap-per-guest.sql` → `guest-display-names.sql` →
`security-hardening.sql` (**required before accepting real payments** —
locks billing fields to service-role-only writes) → `paystack-migration.sql`.
`error-logging.sql` is diagnostic-only. When adding a new schema change,
add a new dated/numbered `.sql` file rather than editing an already-applied
one, and update `SUPABASE_SETUP.md`'s ordered list.

**Security model to preserve** when touching upload/access/payment code:
RLS policies and DB triggers are the actual enforcement layer; anything
checked only in `services/*.js` or component code is a UX nicety and must
never be the sole guard for something that costs money or bypasses access
control (guest caps, photo caps, `is_paid`/`payment_status`/`tier`).

## Environment

Copy `.env.example` to `.env.local` (never commit `.env.local`):
`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`,
`REACT_APP_MAX_FILE_SIZE`, `REACT_APP_ALLOWED_MIME_TYPES`,
`REACT_APP_RATE_LIMIT_UPLOADS_PER_MINUTE`. Paystack's secret key is never
an app env var — it lives only in Supabase Edge Function secrets.
