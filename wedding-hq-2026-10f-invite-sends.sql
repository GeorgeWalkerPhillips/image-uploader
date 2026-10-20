-- ============================================================================
-- Wedding HQ (2026-10f) — wedding_invite_sends: one row per invitation email
-- actually sent (create AND resend).
--
-- Why: the wedding-invite Edge Function needs (a) the last send time of an
-- invite to refuse a resend within 60 seconds, and (b) a count of emails sent
-- per wedding / per inviting user in a rolling 24h so that RESENDS count toward
-- the same daily cap as creates (email-bomb brake on the shared Resend domain).
-- wedding_invites.created_at / expires_at cannot answer either question.
--
-- Written and read ONLY by the Edge Function (service role). RLS is on with NO
-- policies and clients have no grants, so anon/authenticated can neither read
-- nor write it. Contains no email address and no token: ids and a timestamp.
--
-- Create-only and idempotent (no DROP statements). Needs
-- wedding-hq-2026-10e-planner-product.sql applied. Apply BEFORE deploying the
-- updated wedding-invite function (the old function does not use this table;
-- the new one fails closed with a 500 if it is missing).
--
-- ROLLBACK (only after redeploying the previous wedding-invite version):
--   drop table if exists public.wedding_invite_sends;
-- ============================================================================

create table if not exists public.wedding_invite_sends (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  invite_id  uuid not null references public.wedding_invites(id) on delete cascade,
  sent_by    uuid references auth.users(id) on delete set null,
  sent_at    timestamptz not null default now()
);

create index if not exists wedding_invite_sends_wedding_sent_idx
  on public.wedding_invite_sends (wedding_id, sent_at);
create index if not exists wedding_invite_sends_sender_sent_idx
  on public.wedding_invite_sends (sent_by, sent_at);
create index if not exists wedding_invite_sends_invite_sent_idx
  on public.wedding_invite_sends (invite_id, sent_at desc);

alter table public.wedding_invite_sends enable row level security;

revoke all on table public.wedding_invite_sends from public, anon, authenticated;
grant select, insert, update, delete on table public.wedding_invite_sends to service_role;

-- Verify afterwards:
--   select relrowsecurity from pg_class where oid = 'public.wedding_invite_sends'::regclass;  -- true
--   select count(*) from pg_policies where tablename = 'wedding_invite_sends';                 -- 0
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'wedding_invite_sends';                                -- service_role only
