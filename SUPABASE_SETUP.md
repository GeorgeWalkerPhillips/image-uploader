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
Run these four SQL files, in this exact order, in the **SQL Editor**
(New Query → paste → Run → wait for success message, then move to the next
file):

1. `supabase-schema.sql` — core tables (events, photos, profiles) and RLS
2. `payment-schema.sql` — payment/Stripe-related tables and columns
3. `pricing-tiers-migration.sql` — self-serve account policies + guest-count
   pricing tiers (free vs. paid plans)
4. `event-owner-photos-fix.sql` — lets an event's creator view/manage its
   photos directly, without needing to join their own event as a guest

All four must be applied for the app to work — signup, event creation,
guest joining, and organizers actually seeing their own event's gallery all
depend on policies added in files 3 and 4.

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

## Step 7: Configure .env
1. Copy `.env.example` to `.env.local`
2. Fill in your values from Step 2
3. Add your Stripe publishable key (see `PAYMENT_SETUP.md`) if you're
   enabling paid event tiers
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
- [ ] All four SQL files applied, in order (Step 3)
- [ ] Storage bucket created with RLS
- [ ] Anonymous Sign-Ins enabled (guests can't upload without this)
- [ ] `.env.local` added to `.gitignore` (should already be there)
- [ ] No credentials in code files

---

If you get stuck, share the error and I'll help debug.
