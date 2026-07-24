#!/usr/bin/env node
// One-off admin utility: seeds a demo host account + populated, paid-tier
// event for Paystack's activation review team. Not part of the CRA app
// (nothing under scripts/ is bundled into src/), and not deployed anywhere
// — run it locally, once, against your real Supabase project.
//
// Requires the Supabase SERVICE ROLE key (Project Settings -> API in the
// Supabase dashboard). NEVER commit this key. Pass it as a one-off env var
// so it never touches disk:
//
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-paystack-demo-account.js
//
// Reuses REACT_APP_SUPABASE_URL from .env.local for the project URL.
// Safe to re-run — looks for the demo user/event by marker before creating
// anything, so it won't duplicate on a second run.
//
// Inserts go through the service-role client, which is exactly the
// `auth.role() = 'service_role'` escape hatch in security-hardening.sql's
// billing-integrity trigger — the same path the real paystack-webhook Edge
// Function uses to mark a genuine event paid. No RLS or trigger bypassing
// beyond what that trigger already grants to service_role.

const fs = require('fs');
const path = require('path');

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const key = match[1];
    const value = (match[2] || '').replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Adjust the email domain to one you control before running this.
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'paystack-review@capturebyval.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'PaystackReview2026!';
const DEMO_MARKER = 'PAYSTACK_REVIEW_DEMO';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing REACT_APP_SUPABASE_URL (from .env.local) or SUPABASE_SERVICE_ROLE_KEY (env var).'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findExistingUser(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureDemoUser() {
  const existing = await findExistingUser(DEMO_EMAIL);
  if (existing) {
    console.log(`Demo user already exists (${existing.id}), reusing it.`);
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Paystack Review (Demo Host)' },
  });
  if (error) throw error;
  console.log(`Created demo user ${data.user.id}`);
  return data.user;
}

async function ensureProfile(user) {
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { id: user.id, email: user.email, full_name: 'Paystack Review (Demo Host)', is_admin: false },
      { onConflict: 'id' }
    );
  if (error) throw error;
}

async function findExistingEvent(userId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('created_by', userId)
    .eq('description', DEMO_MARKER)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureDemoEvent(user) {
  const existing = await findExistingEvent(user.id);
  if (existing) {
    console.log(`Demo event already exists (${existing.id}), reusing it.`);
    return existing;
  }

  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
  // Two years out so the purge-expired-events cron job never touches this
  // account mid-review (see event-archive-and-emails.sql).
  const expiry = new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('events')
    .insert({
      name: "Val & Sam's Wedding",
      description: DEMO_MARKER,
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      expiry_date: expiry.toISOString(),
      created_by: user.id,
      tier: 'unlimited',
      is_free: false,
      is_paid: true,
      payment_status: 'paid',
      paid_at: now.toISOString(),
      payment_id: 'PAYSTACK_REVIEW_DEMO_SEED',
    })
    .select()
    .single();
  if (error) throw error;
  console.log(`Created demo event ${data.id} on the Unlimited tier, marked paid.`);
  return data;
}

const PLACEHOLDER_PHOTOS = [
  { color: '#4a3728', label: 'Ceremony', uploader: 'Val (Host)' },
  { color: '#c9a876', label: 'First Dance', uploader: 'Sam (Host)' },
  { color: '#8b5e5e', label: 'Guest Table 3', uploader: 'Aunt Trudy' },
  { color: '#5e7c8b', label: 'Bouquet Toss', uploader: 'Sipho (Best Man)' },
  { color: '#7c8b5e', label: 'Cake Cutting', uploader: 'Naledi' },
  { color: '#8b7c5e', label: 'Dance Floor', uploader: 'Guest' },
];

async function makePlaceholderImage({ color, label }) {
  const svg = `
    <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${color}" />
      <text x="50%" y="50%" font-size="64" font-family="sans-serif" fill="white"
            text-anchor="middle" dominant-baseline="middle">${label}</text>
      <text x="50%" y="60%" font-size="28" font-family="sans-serif" fill="white" opacity="0.7"
            text-anchor="middle">Capture by Val — demo photo</text>
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function seedPhotos(event, user) {
  const { count, error: countError } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id);
  if (countError) throw countError;

  if (count > 0) {
    console.log(`Demo event already has ${count} photos, skipping photo seed.`);
    return;
  }

  for (let i = 0; i < PLACEHOLDER_PHOTOS.length; i++) {
    const spec = PLACEHOLDER_PHOTOS[i];
    const buffer = await makePlaceholderImage(spec);
    const fileName = `demo_${i + 1}_${spec.label.toLowerCase().replace(/\s+/g, '_')}.jpg`;
    const storagePath = `${event.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('event-photos')
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw uploadError;

    const uploadedAt = new Date(Date.now() - (PLACEHOLDER_PHOTOS.length - i) * 60 * 60 * 1000);

    const { error: insertError } = await supabase.from('photos').insert({
      event_id: event.id,
      uploaded_by: user.id,
      storage_path: storagePath,
      file_name: fileName,
      file_size: buffer.length,
      mime_type: 'image/jpeg',
      width: 1200,
      height: 900,
      uploaded_at: uploadedAt.toISOString(),
      uploader_name: spec.uploader,
    });
    if (insertError) throw insertError;

    console.log(`Seeded photo ${i + 1}/${PLACEHOLDER_PHOTOS.length}: ${fileName}`);
  }
}

async function main() {
  const user = await ensureDemoUser();
  await ensureProfile(user);
  const event = await ensureDemoEvent(user);
  await seedPhotos(event, user);

  console.log('\nDone. Demo account ready:');
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Event:    ${event.name} (${event.id}) — Unlimited tier, marked paid`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
