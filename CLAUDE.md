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
  and `paystack-webhook` Supabase Edge Functions (both now also amount-
  verify the charge against the tier price), and the billing-integrity
  trigger `enforce_event_billing_integrity()` — last redefined in
  `pricing-rework-2026-09.sql` (originally `security-hardening.sql`).
  It also holds `WEDDING_PLANNER` (the one-time R199 add-on price, included free with the `unlimited` tier), which must
  match the server constant in `supabase/functions/_shared/weddingPlanner.ts`.

**Payments (Paystack, hosted-checkout flow, not the Inline/client SDK
flow)**: no public key or Paystack JS ever loads client-side. An Edge
Function (`paystack-initialize`) recomputes the charge amount server-side
from the tier key and returns a hosted checkout URL; the browser redirects
there and back. Only the service role can mark an event paid — enforced by
a DB trigger (`security-hardening.sql`), not app logic, so it can't be
bypassed by calling the REST API directly. Two Edge Functions do it, both
through `supabase/functions/_shared/paystackPayment.ts` (which also holds
the server-side `TIER_CONFIG`): `paystack-webhook` (HMAC-SHA512 verified)
and `paystack-verify`, a fallback the admin page calls on return from
Paystack, which re-fetches the charge from Paystack and checks the caller
owns the event. Edge Function source
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

## Agents (`.claude/agents/`)

Project subagents, used in this order for non-trivial changes:

| Stage | Agent | Does |
|---|---|---|
| Build | `dev-frontend` | React/CRA code in `src/` (UI, services, CSS), with tests |
| Build | `dev-backend` | Edge Functions + root `.sql` migrations; never applies SQL or deploys |
| Review | `reviewer-code` | Read-only correctness/conventions review of the diff |
| Review | `reviewer-security` | Read-only RLS / payment / secrets review (required for payments, auth, RLS, storage, Edge Functions) |
| Test | `tester-regression` | `npm test`, `npm run build`, Edge Function logic tests, pricing-sync check; writes a report |
| Test | `tester-ui` | Headless Chromium on an iPhone profile; screenshots + console/network logs + `report.md` as proof |

Rules for all agents: RLS and DB triggers are the enforcement layer; never deploy, apply SQL, push to `main` or open PRs without the user's explicit say-so; tests are never skipped or weakened to get green. Tester evidence goes in `test-evidence/` (git-ignored); testers never trigger real Paystack payments or touch production data. The generic engineering skills they lean on are in `.claude/skills/` (installed from `addyosmani/agent-skills`, pinned in `skills-lock.json`).

## Wedding HQ (`src/wedding/`, route `/hq`, private)

A private wedding/honeymoon planner that lives inside this app but is unrelated
to Capture by Val. It is now a **sold add-on ("Wedding Planner", one-time
`WEDDING_PLANNER` price in `pricingTiers.js`)**. Public marketing + purchase
page: `/wedding-planner` (`src/WeddingPlanner.js`; indexable, in `sitemap.xml`;
a landing-page section and nav link point to it). Purchase flow
(`src/services/weddingPlannerService.js`, same hosted-checkout pattern as
Paystack above): `wedding-planner-checkout` returns a Paystack URL, Paystack
returns to `/wedding-planner?payment=success&reference=…`, and the page calls
`wedding-planner-verify` with a few retries. Signed-out and anonymous-guest
users are sent to `/login?next=/wedding-planner?buy=1` (Login honours a
validated same-origin `next`, see `utils/postAuthRedirect.js`), then continue
to checkout. Entitlement is read through the `my_wedding_planner_status()` RPC
(`hooks/useWeddingPlannerStatus.js`, fails closed) to show a "Wedding Planner"
entry in the signed-in menu and "Open" instead of Buy; the client never grants
access, the server does. The main bundle must not import anything from
`src/wedding/`. **The app itself is hidden, not secret-by-obscurity:** the
real protection is RLS — all `wedding_*` tables and the `wedding-files` storage
bucket are readable only by couple members (`wedding_members`,
`wedding_is_member()`) and, for assigned tasks only, helpers; anonymous guest
sessions are rejected. The route is lazy-loaded, unlinked, absent from
`sitemap.xml`/`robots.txt`, and sets `noindex`. `Gate.tsx` decides what a visitor
sees: signed out or anonymous → login with `next`; signed in but not entitled →
"Get the Wedding Planner"; entitled without a wedding → setup; a partner (max 2,
a `wedding_members` row) or a helper (max 10, `wedding_collaborators`) → the app.
Partners and helpers join through invites (Edge Function `wedding-invite` + RPC
`accept_wedding_invite`); the token travels in the URL fragment (`#token=`, never
sent to a server in a request line) and only its sha256 hash is stored. `/hq/join`
sits outside the gate. Owners of paid `unlimited` events get the entitlement free
(`bundle-<eventId>` references, source `admin`). Code is strict TypeScript (CRA
`allowJs`); all money is integer cents formatted `R 15 000,00`; dates are shown in
Africa/Johannesburg. **This repo is public: never commit the couple's personal
seed data** — apply it directly to the database. Any change touching `wedding_*`
policies or storage needs `reviewer-security`. Schema: `wedding-hq-2026-10.sql`
(+ `-10b`, `-10c`, `-10e` planner product, `-10f` invite sends, `-10g` bundle
backfill).
Realtime sync (`lib/realtime.ts`), a per-user offline read cache in localStorage
(`wedding-hq:` prefix, cleared on sign-out) and a `/hq/`-scoped PWA
(`public/hq/sw.js`, registered only from inside `WeddingApp`; `vercel.json` sets its
headers) live in the lazy chunk and must never touch the main app. The "Install app" /
"Save for offline" cards live there too (`installStore.ts` captures `beforeinstallprompt` early;
offline save reuses `persist.ALLOWED_ROOTS` as its only allowlist; offline is view-only). Full guide:
`WEDDING_HQ.md`.

The `/wedding-planner` marketing page is SEO-driven: copy, FAQ, images and JSON-LD
constants live in `src/weddingPlannerContent.js` (the FAQ JSON-LD is generated from
the same data as the rendered FAQ); head meta is set at runtime and captured by
`scripts/prerender.js`. Its phone screenshots in `public/wedding-planner/` come
from `scripts/generate-planner-screenshots.js` (mocked Supabase + entirely
fictional fixtures in `scripts/planner-screenshot-fixtures.js`; run by hand, never
in build/tests). Never put real couple, guest or supplier data in those fixtures.
Page claims must stay true: no ratings, reviews, user counts or awards.

## SEO and AI visibility (public pages)

Public, indexable pages: `/`, `/wedding-planner`, `/about`, `/guides` and five `/guides/<slug>` pages,
plus the policies. Entity data lives in `src/siteProfile.js` (Organization, WebSite, `SOCIAL_PROFILES`
(empty until the owner supplies real URLs), `CONTACT_EMAIL`); `public/index.html` carries a static copy of
the home `@graph` and `src/seoFiles.test.js` fails if the two drift. Copy for About is
`src/aboutContent.js`, for guides `src/guides/content.js` (prices derived from `pricingTiers.js`; the
FAQ JSON-LD is generated from the same data). Each page sets its head via `src/seo/usePageMeta.js`
(restored on unmount) and emits JSON-LD blocks that reference the Organization by `@id`. New indexable routes
must be added to `scripts/prerender.js`, `public/sitemap.xml`, `public/llms.txt`, and (after editing content)
`node scripts/generate-llms-full.js` must be re-run. `scripts/indexnow.js` is run by hand after each deploy.
Never add `/hq` to any public file. Brand in public copy is "Valere". Details and the owner checklist:
`SEO_AND_AI_VISIBILITY.md`.
