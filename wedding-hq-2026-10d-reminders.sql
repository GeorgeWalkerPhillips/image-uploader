-- ============================================================================
-- Wedding HQ (2026-10d) — email reminders.
--
-- Adds, for the send-wedding-reminders Edge Function (see EMAIL_SETUP.md):
--   * wedding_reminder_settings — each member's own reminder preferences.
--     A member can read/insert/update ONLY their own row. No row = defaults
--     (enabled, remind today + tomorrow), handled in the Edge Function.
--   * wedding_reminder_log      — dedupe/audit of what was already emailed.
--     SERVICE ROLE ONLY: RLS on, no policies, no grants to anon/authenticated.
--   * a daily pg_cron job (05:00 UTC = 07:00 Africa/Johannesburg, no DST).
--
-- Create-only and idempotent (no DROP statements). Apply after
-- wedding-hq-2026-10.sql (needs wedding_weddings, wedding_is_member and
-- wedding_touch_updated_at). Additive; changes nothing that already exists.
--
-- Written to be pasted into the SQL editor / execute_sql in the BATCHES marked
-- below (each batch is self-contained and safe to re-run).
--
-- ONE-TIME SETUP before batch 5 (cron) — the service role key secret already
-- exists from event-archive-and-emails.sql ('service_role_key'); only the
-- function URL is new. Replace the placeholder and run once:
--   select vault.create_secret(
--     'https://<your-project-ref>.supabase.co/functions/v1/send-wedding-reminders',
--     'wedding_reminders_function_url');
-- Deploy the function first: supabase functions deploy send-wedding-reminders --project-ref <ref>
--
-- ROLLBACK (destroys reminder settings and the sent-log; reminders simply stop):
--   select cron.unschedule('send-wedding-reminders-daily');
--   drop table if exists public.wedding_reminder_log, public.wedding_reminder_settings;
--   drop function if exists public.wedding_lead_days_valid(integer[]);
-- ============================================================================


-- ---------------------------------------------------------------------------
-- BATCH 1 — validation helper for lead_days (CHECK constraints cannot contain
-- subqueries, so the array rules live in an immutable function).
-- Valid = not null, at most 6 items, every item an integer 0..30, no dupes.
-- ---------------------------------------------------------------------------

create or replace function public.wedding_lead_days_valid(p_days integer[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_days is not null
     and coalesce(cardinality(p_days), 0) <= 6
     and not exists (select 1 from unnest(p_days) as d where d is null or d < 0 or d > 30)
     and (select count(distinct d) from unnest(p_days) as d) = coalesce(cardinality(p_days), 0);
$$;

revoke all on function public.wedding_lead_days_valid(integer[]) from public, anon;
grant execute on function public.wedding_lead_days_valid(integer[]) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- BATCH 2 — wedding_reminder_settings (table + RLS + grants together)
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_reminder_settings (
  wedding_id       uuid not null references public.wedding_weddings(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  enabled          boolean not null default true,
  lead_days        integer[] not null default '{0,1}'
                     constraint wedding_reminder_settings_lead_days_valid
                     check (public.wedding_lead_days_valid(lead_days)),
  include_events   boolean not null default true,
  include_tasks    boolean not null default true,
  include_payments boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (wedding_id, user_id)
);

alter table public.wedding_reminder_settings enable row level security;

revoke all on table public.wedding_reminder_settings from public, anon, authenticated;
grant select, insert, update on table public.wedding_reminder_settings to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_reminder_settings'
       and policyname = 'wedding_reminder_settings_select_own'
  ) then
    create policy wedding_reminder_settings_select_own on public.wedding_reminder_settings
      for select to authenticated
      using (user_id = auth.uid() and public.wedding_is_member(wedding_id));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_reminder_settings'
       and policyname = 'wedding_reminder_settings_insert_own'
  ) then
    create policy wedding_reminder_settings_insert_own on public.wedding_reminder_settings
      for insert to authenticated
      with check (user_id = auth.uid() and public.wedding_is_member(wedding_id));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_reminder_settings'
       and policyname = 'wedding_reminder_settings_update_own'
  ) then
    create policy wedding_reminder_settings_update_own on public.wedding_reminder_settings
      for update to authenticated
      using (user_id = auth.uid() and public.wedding_is_member(wedding_id))
      with check (user_id = auth.uid() and public.wedding_is_member(wedding_id));
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- BATCH 3 — updated_at trigger for wedding_reminder_settings
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'wedding_reminder_settings_touch'
       and tgrelid = 'public.wedding_reminder_settings'::regclass
       and not tgisinternal
  ) then
    create trigger wedding_reminder_settings_touch
      before update on public.wedding_reminder_settings
      for each row execute function public.wedding_touch_updated_at();
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- BATCH 4 — wedding_reminder_log (service role only: RLS on, NO policies,
-- no grants to public/anon/authenticated; the service role bypasses RLS).
-- item_id is polymorphic (event / task / invoice id), so it has no FK.
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_reminder_log (
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_kind  text not null check (item_kind in ('event', 'task', 'payment')),
  item_id    uuid not null,
  due_on     date not null,
  lead_days  integer not null check (lead_days between 0 and 30),
  sent_at    timestamptz not null default now(),
  constraint wedding_reminder_log_unique
    unique (wedding_id, user_id, item_kind, item_id, due_on, lead_days)
);

alter table public.wedding_reminder_log enable row level security;

revoke all on table public.wedding_reminder_log from public, anon, authenticated;
grant select, insert, update, delete on table public.wedding_reminder_log to service_role;


-- ---------------------------------------------------------------------------
-- BATCH 5 — daily cron job (needs the one-time vault secret above).
-- Same pattern as event-archive-and-emails.sql: the Authorization header is
-- the service role key read from Vault, never pasted into this file.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'send-wedding-reminders-daily') then
    perform cron.schedule(
      'send-wedding-reminders-daily',
      '0 5 * * *', -- 05:00 UTC = 07:00 Africa/Johannesburg (UTC+2, no DST)
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'wedding_reminders_function_url'),
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  end if;
end
$$;

-- Make PostgREST pick up the new tables immediately.
notify pgrst, 'reload schema';

-- Verify:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'send-wedding-reminders-daily';
--   select tablename, rowsecurity from pg_tables where tablename like 'wedding_reminder_%';  -- both true
--   select tablename, policyname, cmd from pg_policies where tablename like 'wedding_reminder_%';
--     -- exactly 3 policies (select/insert/update) on settings, none on log
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name = 'wedding_reminder_log';  -- service_role only
-- Manual run: see EMAIL_SETUP.md ("Wedding HQ email reminders").
