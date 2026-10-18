-- ============================================================================
-- Wedding HQ (2026-10c) — guest list and activity feed.
--
-- Follow-up to wedding-hq-2026-10.sql / -10b. Adds two tables, both isolated to
-- the wedding's two members by the same wedding_is_member() rule:
--
--   wedding_guests    guest list with RSVP status, party size, dietary notes
--                     (guest names/emails/phones are personal data: members only)
--   wedding_activity  append-only feed ("Ada marked 'Book makeup trial' done").
--                     Members can read and add entries, never edit or delete
--                     them, and cannot attribute an entry to someone else
--                     (actor_id must be the caller).
--
-- Additive and idempotent. Written create-only (no DROP) because DROP POLICY was
-- observed to hang on this project's SQL connection; policies/triggers are only
-- created when missing.
--
-- ROLLBACK (destroys the data):
--   drop table if exists public.wedding_activity, public.wedding_guests cascade;
-- ============================================================================

create table if not exists public.wedding_guests (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.wedding_weddings(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 200),
  email        text check (email is null or length(email) <= 254),
  phone        text check (phone is null or length(phone) <= 40),
  side         text not null default 'both' check (side in ('groom', 'bride', 'both')),
  rsvp_status  text not null default 'pending' check (rsvp_status in ('pending', 'yes', 'no', 'maybe')),
  party_size   integer not null default 1 check (party_size between 1 and 20),
  dietary_notes text check (dietary_notes is null or length(dietary_notes) <= 2000),
  table_label  text check (table_label is null or length(table_label) <= 100),
  notes        text check (notes is null or length(notes) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.wedding_activity (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  actor_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  actor_name text not null check (length(btrim(actor_name)) between 1 and 100),
  action     text not null check (length(btrim(action)) > 0 and length(action) <= 60),
  subject    text check (subject is null or length(subject) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists wedding_guests_wedding_idx   on public.wedding_guests (wedding_id, name);
create index if not exists wedding_activity_wedding_idx on public.wedding_activity (wedding_id, created_at desc);

-- ---- guests: members get full access to their own wedding's guests only
alter table public.wedding_guests enable row level security;
revoke all on table public.wedding_guests from public, anon, authenticated;
grant select, insert, update, delete on table public.wedding_guests to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wedding_guests' and policyname = 'wedding_member_all') then
    create policy wedding_member_all on public.wedding_guests for all to authenticated
      using (public.wedding_is_member(wedding_id))
      with check (public.wedding_is_member(wedding_id));
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'wedding_guests_touch' and tgrelid = 'public.wedding_guests'::regclass) then
    create trigger wedding_guests_touch before update on public.wedding_guests
      for each row execute function public.wedding_touch_updated_at();
  end if;
end
$$;

-- ---- activity: append-only; read + insert (as yourself) only
alter table public.wedding_activity enable row level security;
revoke all on table public.wedding_activity from public, anon, authenticated;
grant select, insert on table public.wedding_activity to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wedding_activity' and policyname = 'wedding_member_select') then
    create policy wedding_member_select on public.wedding_activity for select to authenticated
      using (public.wedding_is_member(wedding_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wedding_activity' and policyname = 'wedding_member_insert_self') then
    create policy wedding_member_insert_self on public.wedding_activity for insert to authenticated
      with check (public.wedding_is_member(wedding_id) and actor_id = auth.uid());
  end if;
end
$$;

-- ---- realtime (RLS still applies to what subscribers receive)
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['wedding_guests', 'wedding_activity'] loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$$;

notify pgrst, 'reload schema';
