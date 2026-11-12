-- ============================================================================
-- Wedding HQ (2026-11) — wedding day schedule ("run of day").
--
-- Adds one table, wedding_schedule_items: the timed running order of the
-- wedding day (time, what happens, where, who is in charge, notes). It is
-- isolated to the wedding's couple by the same wedding_is_member() rule as every
-- other wedding_* table; helpers/collaborators are not members, so they are
-- denied. The day itself is the wedding's own wedding_date, so rows carry only a
-- time of day (South Africa has no DST; times are wall-clock Johannesburg).
--
-- Additive and idempotent. Written create-only (no DROP POLICY, which has hung on
-- this project's SQL connection): policies/triggers are only created when missing.
-- Run after wedding-hq-2026-10.sql (needs wedding_is_member and
-- wedding_touch_updated_at).
--
-- ROLLBACK (destroys the data):
--   drop table if exists public.wedding_schedule_items cascade;
-- ============================================================================

create table if not exists public.wedding_schedule_items (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  start_time time not null,
  end_time   time,
  title      text not null check (length(btrim(title)) between 1 and 120),
  location   text check (location is null or length(location) <= 160),
  who        text check (who is null or length(who) <= 160),
  notes      text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wedding_schedule_items_end_after_start
    check (end_time is null or end_time > start_time)
);

create index if not exists wedding_schedule_items_wedding_idx
  on public.wedding_schedule_items (wedding_id, start_time);

alter table public.wedding_schedule_items enable row level security;
revoke all on table public.wedding_schedule_items from public, anon, authenticated;
grant select, insert, update, delete on table public.wedding_schedule_items to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_schedule_items' and policyname = 'wedding_member_all'
  ) then
    create policy wedding_member_all on public.wedding_schedule_items for all to authenticated
      using (public.wedding_is_member(wedding_id))
      with check (public.wedding_is_member(wedding_id));
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'wedding_schedule_items_touch' and tgrelid = 'public.wedding_schedule_items'::regclass
  ) then
    create trigger wedding_schedule_items_touch before update on public.wedding_schedule_items
      for each row execute function public.wedding_touch_updated_at();
  end if;
end
$$;

-- Realtime: an edit on one phone shows on the other (RLS still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wedding_schedule_items'
     ) then
    alter publication supabase_realtime add table public.wedding_schedule_items;
  end if;
end
$$;

-- Make PostgREST pick up the new table immediately.
notify pgrst, 'reload schema';
