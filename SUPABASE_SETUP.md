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
1. In Supabase, go to **SQL Editor**
2. Click **New Query**
3. Copy entire contents of `supabase-schema.sql` from this repo
4. Paste into the query box
5. Click **Run**
6. Wait for success message

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

## Step 6: Configure .env
1. Copy `.env.example` to `.env.local`
2. Fill in your values from Step 2
3. **Never commit `.env.local`** to git

## Step 7: Test Connection
Run:
```bash
npm start
```

You should see the app load without Firebase errors.

## Security Checklist
- [ ] Project URL and Anon Key copied to `.env.local`
- [ ] Database schema applied
- [ ] Storage bucket created with RLS
- [ ] `.env.local` added to `.gitignore` (should already be there)
- [ ] No credentials in code files

---

If you get stuck, share the error and I'll help debug.
