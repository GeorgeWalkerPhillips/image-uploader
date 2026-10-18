-- ============================================================================
-- Wedding HQ (2026-10) — private two-person wedding & honeymoon planner.
--
-- Lives inside the Valere Supabase project but is completely isolated from
-- Capture by Val: every object here is prefixed `wedding_`, nothing existing
-- is altered, and only the two people listed in `wedding_members` can read or
-- write anything. Access is by account (auth.users id), never by email: Valere
-- sign-up is open and unconfirmed, so an email match would be spoofable.
--
-- Membership rows are created ONLY by the project owner via the SQL editor
-- (or the Supabase connector) — there is deliberately no client-side policy
-- that can insert into wedding_members or wedding_weddings.
--
-- Apply by hand in the Supabase SQL Editor (see SUPABASE_SETUP.md). Additive
-- and idempotent. Personal seed data is NOT in this repo (it is public) — it is
-- applied separately and never committed.
--
-- ROLLBACK (destroys all Wedding HQ data):
--   drop table if exists public.wedding_packing_items, public.wedding_travel_docs,
--     public.wedding_bookings, public.wedding_itinerary_days,
--     public.wedding_purchase_items, public.wedding_events, public.wedding_tasks,
--     public.wedding_targets, public.wedding_savings, public.wedding_payments,
--     public.wedding_invoices, public.wedding_quotes, public.wedding_budget_lines,
--     public.wedding_vendors, public.wedding_categories, public.wedding_members,
--     public.wedding_weddings cascade;
--   drop function if exists public.wedding_file_allowed(text),
--     public.wedding_is_member(uuid), public.wedding_touch_updated_at();
--   delete from storage.objects where bucket_id = 'wedding-files';
--   delete from storage.buckets where id = 'wedding-files';
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.wedding_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.wedding_touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Core: the wedding itself, and who belongs to it
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_weddings (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  wedding_date           timestamptz not null,
  venue                  text,
  guest_count            integer check (guest_count is null or guest_count >= 0),
  budget_cents           bigint not null default 0 check (budget_cents >= 0),
  honeymoon_budget_cents bigint not null default 0 check (honeymoon_budget_cents >= 0),
  honeymoon_start        date,
  honeymoon_days         integer check (honeymoon_days is null or honeymoon_days between 1 and 90),
  fx_thb_per_zar         numeric(10,4) check (fx_thb_per_zar is null or fx_thb_per_zar > 0),
  currency               text not null default 'ZAR',
  timezone               text not null default 'Africa/Johannesburg',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.wedding_members (
  wedding_id   uuid not null references public.wedding_weddings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('groom', 'bride')),
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (wedding_id, user_id),
  unique (wedding_id, role),
  unique (user_id)
);

-- The one authorization primitive every policy below uses. SECURITY DEFINER so
-- it can read wedding_members regardless of that table's own RLS (no recursion).
-- Anonymous guest sessions (Capture by Val) are rejected explicitly, on top of
-- never being listed in wedding_members.
create or replace function public.wedding_is_member(p_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (
       select 1
         from public.wedding_members m
        where m.wedding_id = p_wedding_id
          and m.user_id = auth.uid()
     );
$$;

revoke all on function public.wedding_is_member(uuid) from public, anon;
grant execute on function public.wedding_is_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_categories (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  scope      text not null default 'wedding' check (scope in ('wedding', 'honeymoon')),
  name       text not null check (length(btrim(name)) > 0),
  color      text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wedding_id, id),
  unique (wedding_id, scope, name)
);

create table if not exists public.wedding_vendors (
  id          uuid primary key default gen_random_uuid(),
  wedding_id  uuid not null references public.wedding_weddings(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  category_id uuid,
  phone       text,
  email       text,
  whatsapp    text,
  website     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, category_id) references public.wedding_categories (wedding_id, id) on delete set null (category_id)
);

create table if not exists public.wedding_budget_lines (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.wedding_weddings(id) on delete cascade,
  category_id     uuid not null,
  name            text not null check (length(btrim(name)) > 0),
  vendor_id       uuid,
  estimated_cents bigint not null default 0 check (estimated_cents >= 0),
  quoted_cents    bigint check (quoted_cents is null or quoted_cents >= 0),
  final_cents     bigint check (final_cents is null or final_cents >= 0),
  notes           text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, category_id) references public.wedding_categories (wedding_id, id) on delete cascade,
  foreign key (wedding_id, vendor_id)   references public.wedding_vendors (wedding_id, id) on delete set null (vendor_id)
);

create table if not exists public.wedding_quotes (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.wedding_weddings(id) on delete cascade,
  vendor_id       uuid,
  vendor_name     text not null check (length(btrim(vendor_name)) > 0),
  category_id     uuid,
  budget_line_id  uuid,
  amount_cents    bigint not null check (amount_cents >= 0),
  received_on     date,
  valid_until     date,
  status          text not null default 'requested'
                    check (status in ('requested', 'received', 'shortlisted', 'accepted', 'declined')),
  notes           text,
  attachment_path text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, vendor_id)      references public.wedding_vendors (wedding_id, id)      on delete set null (vendor_id),
  foreign key (wedding_id, category_id)    references public.wedding_categories (wedding_id, id)   on delete set null (category_id),
  foreign key (wedding_id, budget_line_id) references public.wedding_budget_lines (wedding_id, id) on delete set null (budget_line_id)
);

create table if not exists public.wedding_invoices (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.wedding_weddings(id) on delete cascade,
  vendor_id       uuid,
  vendor_name     text not null check (length(btrim(vendor_name)) > 0),
  invoice_number  text,
  total_cents     bigint not null check (total_cents >= 0),
  due_on          date,
  budget_line_id  uuid,
  quote_id        uuid,
  attachment_path text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, vendor_id)      references public.wedding_vendors (wedding_id, id)      on delete set null (vendor_id),
  foreign key (wedding_id, budget_line_id) references public.wedding_budget_lines (wedding_id, id) on delete set null (budget_line_id),
  foreign key (wedding_id, quote_id)       references public.wedding_quotes (wedding_id, id)       on delete set null (quote_id)
);

create table if not exists public.wedding_payments (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.wedding_weddings(id) on delete cascade,
  invoice_id   uuid not null,
  paid_on      date not null,
  amount_cents bigint not null check (amount_cents > 0),
  method       text not null default 'eft' check (method in ('eft', 'card', 'cash', 'payshap')),
  paid_by      text not null default 'joint' check (paid_by in ('groom', 'bride', 'joint')),
  proof_path   text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, invoice_id) references public.wedding_invoices (wedding_id, id) on delete cascade
);

create table if not exists public.wedding_savings (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references public.wedding_weddings(id) on delete cascade,
  contributed_on date not null,
  amount_cents   bigint not null check (amount_cents > 0),
  paid_by        text not null default 'joint' check (paid_by in ('groom', 'bride', 'joint')),
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- User-defined targets ("our own targets"): a money target (optionally tracked
-- automatically from the budget/payments/savings data) or a countdown to a date.
create table if not exists public.wedding_targets (
  id            uuid primary key default gen_random_uuid(),
  wedding_id    uuid not null references public.wedding_weddings(id) on delete cascade,
  title         text not null check (length(btrim(title)) > 0),
  kind          text not null check (kind in ('amount', 'date')),
  scope         text not null default 'general' check (scope in ('wedding', 'honeymoon', 'savings', 'general')),
  metric        text not null default 'manual'
                  check (metric in ('manual', 'paid_total', 'committed_total', 'savings_total',
                                    'honeymoon_paid_total', 'honeymoon_committed_total',
                                    'category_paid', 'category_committed')),
  category_id   uuid,
  target_cents  bigint check (target_cents is null or target_cents >= 0),
  current_cents bigint not null default 0 check (current_cents >= 0),
  target_at     timestamptz,
  notes         text,
  sort_order    integer not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((kind = 'amount' and target_cents is not null) or (kind = 'date' and target_at is not null)),
  check ((metric in ('category_paid', 'category_committed')) = (category_id is not null)),
  foreign key (wedding_id, category_id) references public.wedding_categories (wedding_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_tasks (
  id             uuid primary key default gen_random_uuid(),
  wedding_id     uuid not null references public.wedding_weddings(id) on delete cascade,
  parent_task_id uuid,
  title          text not null check (length(btrim(title)) > 0),
  description    text,
  assignee       text not null default 'both' check (assignee in ('groom', 'bride', 'both')),
  category       text,
  due_on         date,
  priority       text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status         text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  catch_up       boolean not null default false,
  recurrence     text check (recurrence is null or recurrence in ('daily', 'weekly', 'monthly')),
  sort_order     integer not null default 0,
  completed_at   timestamptz,
  completed_by   uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (wedding_id, id),
  foreign key (wedding_id, parent_task_id) references public.wedding_tasks (wedding_id, id) on delete cascade
);

create table if not exists public.wedding_events (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  title      text not null check (length(btrim(title)) > 0),
  kind       text not null default 'appointment'
               check (kind in ('appointment', 'fitting', 'tasting', 'honeymoon', 'other')),
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  all_day    boolean not null default false,
  location   text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.wedding_purchase_items (
  id              uuid primary key default gen_random_uuid(),
  wedding_id      uuid not null references public.wedding_weddings(id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  category        text,
  quantity        integer not null default 1 check (quantity > 0),
  needed_by       date,
  price_cents     bigint not null default 0 check (price_cents >= 0),
  bought          boolean not null default false,
  bought_by       text check (bought_by is null or bought_by in ('groom', 'bride', 'joint')),
  bought_at_store text,
  bought_on       date,
  receipt_path    text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Honeymoon
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_itinerary_days (
  id                uuid primary key default gen_random_uuid(),
  wedding_id        uuid not null references public.wedding_weddings(id) on delete cascade,
  day_number        integer not null check (day_number between 1 and 90),
  on_date           date,
  city              text,
  accommodation     text,
  activities        text,
  transport         text,
  booking_reference text,
  cost_cents        bigint not null default 0 check (cost_cents >= 0),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (wedding_id, day_number)
);

create table if not exists public.wedding_bookings (
  id                  uuid primary key default gen_random_uuid(),
  wedding_id          uuid not null references public.wedding_weddings(id) on delete cascade,
  kind                text not null default 'other'
                        check (kind in ('flight', 'accommodation', 'transport', 'activity', 'insurance', 'other')),
  name                text not null check (length(btrim(name)) > 0),
  confirmation_number text,
  starts_on           date,
  ends_on             date,
  cost_cents          bigint not null default 0 check (cost_cents >= 0),
  attachment_path     text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.wedding_packing_items (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  category   text,
  packed     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wedding_travel_docs (
  id         uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.wedding_weddings(id) on delete cascade,
  title      text not null check (length(btrim(title)) > 0),
  person     text not null default 'both' check (person in ('groom', 'bride', 'both')),
  status     text not null default 'not_started' check (status in ('not_started', 'applied', 'collected')),
  due_on     date,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes (foreign keys + the lookups the app does)
-- ---------------------------------------------------------------------------

create index if not exists wedding_categories_wedding_idx      on public.wedding_categories (wedding_id);
create index if not exists wedding_vendors_wedding_idx         on public.wedding_vendors (wedding_id);
create index if not exists wedding_budget_lines_wedding_idx    on public.wedding_budget_lines (wedding_id, category_id);
create index if not exists wedding_quotes_wedding_idx          on public.wedding_quotes (wedding_id, category_id);
create index if not exists wedding_invoices_wedding_idx        on public.wedding_invoices (wedding_id, due_on);
create index if not exists wedding_payments_invoice_idx        on public.wedding_payments (wedding_id, invoice_id);
create index if not exists wedding_savings_wedding_idx         on public.wedding_savings (wedding_id, contributed_on);
create index if not exists wedding_targets_wedding_idx         on public.wedding_targets (wedding_id);
create index if not exists wedding_tasks_wedding_due_idx       on public.wedding_tasks (wedding_id, due_on);
create index if not exists wedding_tasks_parent_idx            on public.wedding_tasks (wedding_id, parent_task_id);
create index if not exists wedding_events_wedding_starts_idx   on public.wedding_events (wedding_id, starts_at);
create index if not exists wedding_purchase_items_wedding_idx  on public.wedding_purchase_items (wedding_id);
create index if not exists wedding_bookings_wedding_idx        on public.wedding_bookings (wedding_id, starts_on);
create index if not exists wedding_packing_items_wedding_idx   on public.wedding_packing_items (wedding_id);
create index if not exists wedding_travel_docs_wedding_idx     on public.wedding_travel_docs (wedding_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers, RLS, and grants — applied uniformly to every table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  child_tables text[] := array[
    'wedding_categories', 'wedding_vendors', 'wedding_budget_lines', 'wedding_quotes',
    'wedding_invoices', 'wedding_payments', 'wedding_savings', 'wedding_targets',
    'wedding_tasks', 'wedding_events', 'wedding_purchase_items',
    'wedding_itinerary_days', 'wedding_bookings', 'wedding_packing_items',
    'wedding_travel_docs'
  ];
begin
  -- Tables keyed by wedding_id: members get full access to their own wedding only.
  foreach t in array child_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists wedding_member_all on public.%I', t);
    execute format(
      'create policy wedding_member_all on public.%I for all to authenticated
         using (public.wedding_is_member(wedding_id))
         with check (public.wedding_is_member(wedding_id))', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.wedding_touch_updated_at()', t || '_touch', t);
  end loop;
end
$$;

-- wedding_weddings: members can read and edit their own wedding. Nobody can
-- create or delete one from the client.
alter table public.wedding_weddings enable row level security;
drop policy if exists wedding_member_select on public.wedding_weddings;
drop policy if exists wedding_member_update on public.wedding_weddings;
create policy wedding_member_select on public.wedding_weddings
  for select to authenticated using (public.wedding_is_member(id));
create policy wedding_member_update on public.wedding_weddings
  for update to authenticated
  using (public.wedding_is_member(id)) with check (public.wedding_is_member(id));
revoke all on table public.wedding_weddings from public, anon, authenticated;
grant select, update on table public.wedding_weddings to authenticated;
drop trigger if exists wedding_weddings_touch on public.wedding_weddings;
create trigger wedding_weddings_touch before update on public.wedding_weddings
  for each row execute function public.wedding_touch_updated_at();

-- wedding_members: read-only from the client. Rows are created by the owner in
-- the SQL editor; a member can never add, change or remove members.
alter table public.wedding_members enable row level security;
drop policy if exists wedding_member_select on public.wedding_members;
create policy wedding_member_select on public.wedding_members
  for select to authenticated using (public.wedding_is_member(wedding_id));
revoke all on table public.wedding_members from public, anon, authenticated;
grant select on table public.wedding_members to authenticated;

-- ---------------------------------------------------------------------------
-- Private file storage (invoices, quotes, proofs of payment, receipts)
--   path convention: <wedding_id>/<anything>
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wedding-files', 'wedding-files', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safe for EVERY bucket: storage policies are evaluated against all objects
-- (including Capture by Val's photos), so a bare ::uuid cast on a non-uuid
-- folder would raise an error and break unrelated uploads. This returns false
-- for anything that isn't a uuid first path segment and never throws.
create or replace function public.wedding_file_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.wedding_is_member(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;

revoke all on function public.wedding_file_allowed(text) from public, anon;
grant execute on function public.wedding_file_allowed(text) to authenticated;

drop policy if exists wedding_files_select on storage.objects;
drop policy if exists wedding_files_insert on storage.objects;
drop policy if exists wedding_files_update on storage.objects;
drop policy if exists wedding_files_delete on storage.objects;

create policy wedding_files_select on storage.objects for select to authenticated
  using (bucket_id = 'wedding-files' and public.wedding_file_allowed(name));
create policy wedding_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wedding-files' and public.wedding_file_allowed(name));
create policy wedding_files_update on storage.objects for update to authenticated
  using (bucket_id = 'wedding-files' and public.wedding_file_allowed(name))
  with check (bucket_id = 'wedding-files' and public.wedding_file_allowed(name));
create policy wedding_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wedding-files' and public.wedding_file_allowed(name));

-- ---------------------------------------------------------------------------
-- Realtime: edits show up instantly on both phones (RLS still applies).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  rt_tables text[] := array[
    'wedding_weddings', 'wedding_categories', 'wedding_vendors', 'wedding_budget_lines',
    'wedding_quotes', 'wedding_invoices', 'wedding_payments', 'wedding_savings',
    'wedding_targets', 'wedding_tasks', 'wedding_events', 'wedding_purchase_items',
    'wedding_itinerary_days', 'wedding_bookings', 'wedding_packing_items',
    'wedding_travel_docs'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array rt_tables loop
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

commit;

-- Make PostgREST pick up the new tables immediately.
notify pgrst, 'reload schema';
