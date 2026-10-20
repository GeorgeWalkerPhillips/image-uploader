-- ============================================================================
-- Wedding HQ (2026-10e) — multi-tenant "planner product" (database part).
--
-- Turns Wedding HQ from one private wedding into a sellable product:
--   * wedding_planner_entitlements  who has paid (or was grandfathered) to create
--                                   their own wedding. Written ONLY by the service
--                                   role (Paystack Edge Function) or by this file.
--   * wedding_collaborators         up to 10 helpers per wedding (planner, family,
--                                   bridal party). They can see/update ONLY tasks
--                                   assigned to them and nothing else.
--   * wedding_invites               partner + collaborator invitations. Only the
--                                   sha256 of the secret token is stored. Rows are
--                                   created by the invite Edge Function (service
--                                   role); clients can read non-secret columns.
--   * RPCs (SECURITY DEFINER, search_path ''): wedding_has_access,
--     wedding_is_collaborator, my_wedding_planner_status, my_collab_wedding,
--     create_my_wedding (seeds generic template data), wedding_people,
--     accept_wedding_invite, remove_collaborator, revoke_wedding_invite,
--     leave_wedding.
--   * wedding_tasks.assigned_to + collaborator-only policies + two guard triggers.
--
-- Contract for frontend / Edge Function agents: WEDDING_PLANNER_CONTRACT.md.
--
-- Create-only and idempotent: NO DROP statements (DROP hangs on this project's SQL
-- connection). Policies/triggers/constraints are created only when missing;
-- functions use CREATE OR REPLACE. Nothing here contains personal data; the
-- existing wedding is grandfathered with set-based SQL (batch 1).
--
-- APPLY batch by batch (each BATCH below is self-contained, safe to re-run, and
-- must run in this order). Needs wedding-hq-2026-10.sql .. 10d already applied.
--
-- ROLLBACK (destroys collaborators, invites, entitlements; the couple's data is
-- untouched). Run in this order:
--   drop trigger if exists wedding_tasks_collab_guard   on public.wedding_tasks;
--   drop trigger if exists wedding_tasks_assignee_guard on public.wedding_tasks;
--   drop policy  if exists wedding_collab_select on public.wedding_tasks;
--   drop policy  if exists wedding_collab_update on public.wedding_tasks;
--   alter table public.wedding_tasks drop column if exists assigned_to;
--   drop table if exists public.wedding_invites, public.wedding_collaborators,
--     public.wedding_planner_entitlements cascade;
--   drop function if exists public.wedding_has_access(uuid),
--     public.wedding_is_collaborator(uuid), public.my_wedding_planner_status(),
--     public.my_collab_wedding(), public.create_my_wedding(text, date, text, text),
--     public.wedding_people(uuid), public.accept_wedding_invite(text, text),
--     public.remove_collaborator(uuid, uuid), public.revoke_wedding_invite(uuid),
--     public.leave_wedding(), public.wedding_tasks_collab_guard(),
--     public.wedding_tasks_assignee_guard(), public.wedding_collaborators_guard(),
--     public.wedding_collaborators_after_delete();
--   (weddings created through create_my_wedding stay; delete them by hand if wanted.)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- BATCH 1 — entitlements (+ grandfather every existing member)
-- Service role writes (Paystack). Clients may read ONLY their own row.
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_planner_entitlements (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  payment_reference text not null unique,
  amount_cents      bigint not null check (amount_cents >= 0),
  source            text not null check (source in ('paystack', 'grandfathered', 'admin')),
  paid_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table public.wedding_planner_entitlements enable row level security;

revoke all on table public.wedding_planner_entitlements from public, anon, authenticated;
grant select on table public.wedding_planner_entitlements to authenticated;
grant select, insert, update, delete on table public.wedding_planner_entitlements to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_planner_entitlements'
       and policyname = 'wedding_entitlement_select_own'
  ) then
    create policy wedding_entitlement_select_own on public.wedding_planner_entitlements
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end
$$;

-- Grandfather: everyone already in wedding_members keeps full access, no literals.
insert into public.wedding_planner_entitlements (user_id, payment_reference, amount_cents, source)
select m.user_id, 'grandfathered-' || m.user_id::text, 0, 'grandfathered'
  from public.wedding_members m
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- BATCH 2 — wedding_collaborators (+ cap/exclusivity trigger)
-- Clients: select (couple: their wedding; collaborator: own row) and delete
-- (couple only). No client insert/update: rows come from accept_wedding_invite.
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_collaborators (
  wedding_id   uuid not null references public.wedding_weddings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  added_by     uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (wedding_id, user_id),
  unique (user_id)
);

create index if not exists wedding_collaborators_wedding_idx on public.wedding_collaborators (wedding_id);

alter table public.wedding_collaborators enable row level security;

revoke all on table public.wedding_collaborators from public, anon, authenticated;
grant select, delete on table public.wedding_collaborators to authenticated;
grant select, insert, update, delete on table public.wedding_collaborators to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_collaborators'
       and policyname = 'wedding_collab_select'
  ) then
    create policy wedding_collab_select on public.wedding_collaborators
      for select to authenticated
      using (public.wedding_is_member(wedding_id) or user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_collaborators'
       and policyname = 'wedding_collab_delete'
  ) then
    create policy wedding_collab_delete on public.wedding_collaborators
      for delete to authenticated
      using (public.wedding_is_member(wedding_id));
  end if;
end
$$;

-- Hard cap (10 per wedding) and "one wedding per user" across BOTH tables.
-- The advisory lock serialises concurrent inserts for the same wedding so two
-- simultaneous accepts cannot both slip under the cap.
create or replace function public.wedding_collaborators_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.wedding_id::text, 0));

  if (select count(*) from public.wedding_collaborators c where c.wedding_id = new.wedding_id) >= 10 then
    raise exception 'This wedding has reached its limit of 10 collaborators.' using errcode = '23514';
  end if;

  if exists (select 1 from public.wedding_members m where m.user_id = new.user_id) then
    raise exception 'You already belong to a wedding.' using errcode = '23505';
  end if;

  return new;
end;
$$;

revoke all on function public.wedding_collaborators_guard() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'wedding_collaborators_guard'
       and tgrelid = 'public.wedding_collaborators'::regclass and not tgisinternal
  ) then
    create trigger wedding_collaborators_guard
      before insert on public.wedding_collaborators
      for each row execute function public.wedding_collaborators_guard();
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- BATCH 3 — wedding_invites
-- token_hash is NEVER readable by clients: column-level SELECT grant omits it.
-- (Clients must list columns; select=* will be "permission denied".)
-- No insert/update/delete for clients: the invite Edge Function (service role)
-- inserts; revoke_wedding_invite() revokes.
-- ---------------------------------------------------------------------------

create table if not exists public.wedding_invites (
  id           uuid primary key default gen_random_uuid(),
  wedding_id   uuid not null references public.wedding_weddings(id) on delete cascade,
  email        text not null
                 check (email = lower(btrim(email)) and length(email) between 3 and 254),
  kind         text not null check (kind in ('partner', 'collaborator')),
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists wedding_invites_wedding_idx on public.wedding_invites (wedding_id, created_at desc);

-- At most one OPEN invite per (wedding, email). "Open" here means neither accepted
-- nor revoked; an expired-but-unrevoked invite still occupies the slot, so the
-- invite Edge Function must revoke stale rows (set revoked_at) before re-inviting.
create unique index if not exists wedding_invites_open_uq
  on public.wedding_invites (wedding_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.wedding_invites enable row level security;

revoke all on table public.wedding_invites from public, anon, authenticated;
grant select (id, wedding_id, email, kind, display_name, expires_at, accepted_at, revoked_at, created_at)
  on table public.wedding_invites to authenticated;
grant select, insert, update, delete on table public.wedding_invites to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_invites'
       and policyname = 'wedding_invite_select'
  ) then
    create policy wedding_invite_select on public.wedding_invites
      for select to authenticated
      using (public.wedding_is_member(wedding_id));
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- BATCH 4 — access helper functions (need wedding_collaborators from batch 2)
-- ---------------------------------------------------------------------------

create or replace function public.wedding_is_collaborator(p_wedding uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and exists (
       select 1
         from public.wedding_collaborators c
        where c.wedding_id = p_wedding
          and c.user_id = auth.uid()
     );
$$;

revoke all on function public.wedding_is_collaborator(uuid) from public, anon;
grant execute on function public.wedding_is_collaborator(uuid) to authenticated;

create or replace function public.wedding_has_access(p_wedding uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and (public.wedding_is_member(p_wedding) or public.wedding_is_collaborator(p_wedding));
$$;

revoke all on function public.wedding_has_access(uuid) from public, anon;
grant execute on function public.wedding_has_access(uuid) to authenticated;

-- {entitled, wedding_id, access, role}. Anonymous / signed-out -> all empty.
create or replace function public.my_wedding_planner_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_wedding uuid;
  v_access  text;
  v_role    text;
  v_entitled boolean := false;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return jsonb_build_object('entitled', false, 'wedding_id', null, 'access', null, 'role', null);
  end if;

  v_entitled := exists (select 1 from public.wedding_planner_entitlements e where e.user_id = v_uid);

  select m.wedding_id, m.role into v_wedding, v_role
    from public.wedding_members m where m.user_id = v_uid;

  if v_wedding is not null then
    v_access := 'partner';
  else
    select c.wedding_id into v_wedding
      from public.wedding_collaborators c where c.user_id = v_uid;
    if v_wedding is not null then
      v_access := 'collaborator';
      v_role := null;
    end if;
  end if;

  return jsonb_build_object(
    'entitled', v_entitled,
    'wedding_id', v_wedding,
    'access', v_access,
    'role', v_role
  );
end;
$$;

revoke all on function public.my_wedding_planner_status() from public, anon;
grant execute on function public.my_wedding_planner_status() to authenticated;

-- Collaborators get no access to wedding_weddings; this is their only view of it.
create or replace function public.my_collab_wedding()
returns table (id uuid, name text, wedding_date timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return;
  end if;
  return query
    select w.id, w.name, w.wedding_date
      from public.wedding_collaborators c
      join public.wedding_weddings w on w.id = c.wedding_id
     where c.user_id = auth.uid();
end;
$$;

revoke all on function public.my_collab_wedding() from public, anon;
grant execute on function public.my_collab_wedding() to authenticated;


-- ---------------------------------------------------------------------------
-- BATCH 5 — task assignment: column, policies, guard triggers
-- Only change to an existing table: one nullable column on wedding_tasks.
-- ---------------------------------------------------------------------------

alter table public.wedding_tasks
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists wedding_tasks_assigned_idx
  on public.wedding_tasks (assigned_to) where assigned_to is not null;

-- Collaborators: ONLY tasks assigned to them. (The existing wedding_member_all
-- policy requires wedding_is_member, which a collaborator is not.) No insert or
-- delete policy for collaborators exists, so those stay denied.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_tasks' and policyname = 'wedding_collab_select'
  ) then
    create policy wedding_collab_select on public.wedding_tasks
      for select to authenticated
      using (assigned_to = auth.uid() and public.wedding_is_collaborator(wedding_id));
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wedding_tasks' and policyname = 'wedding_collab_update'
  ) then
    create policy wedding_collab_update on public.wedding_tasks
      for update to authenticated
      using (assigned_to = auth.uid() and public.wedding_is_collaborator(wedding_id))
      with check (assigned_to = auth.uid() and public.wedding_is_collaborator(wedding_id));
  end if;
end
$$;

-- A collaborator (who is not a couple member) may change ONLY status,
-- completed_at, completed_by (and updated_at, set by the touch trigger). Any other
-- changed column raises. completed_by, if set, must be the caller.
create or replace function public.wedding_tasks_collab_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed text[] := array['status', 'completed_at', 'completed_by', 'updated_at'];
begin
  -- pg_trigger_depth() = 1: only guard direct client writes, not updates made by
  -- our own trigger (the after-delete unassign when a collaborator leaves).
  if auth.uid() is not null
     and pg_trigger_depth() = 1
     and not public.wedding_is_member(old.wedding_id)
     and public.wedding_is_collaborator(old.wedding_id) then
    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'Collaborators can only change a task''s status.' using errcode = '42501';
    end if;
    if new.completed_by is not null and new.completed_by <> auth.uid() then
      raise exception 'Collaborators can only change a task''s status.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.wedding_tasks_collab_guard() from public, anon, authenticated;

-- assigned_to must be a couple member or collaborator of the SAME wedding
-- (checked on insert, and on update when assigned_to or wedding_id changes).
create or replace function public.wedding_tasks_assignee_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT'
          or old.assigned_to is distinct from new.assigned_to
          or old.wedding_id is distinct from new.wedding_id) then
    if not (
      exists (select 1 from public.wedding_members m
               where m.wedding_id = new.wedding_id and m.user_id = new.assigned_to)
      or exists (select 1 from public.wedding_collaborators c
                  where c.wedding_id = new.wedding_id and c.user_id = new.assigned_to)
    ) then
      raise exception 'Tasks can only be assigned to people in this wedding.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.wedding_tasks_assignee_guard() from public, anon, authenticated;

-- When a collaborator leaves / is removed, their tasks become unassigned.
create or replace function public.wedding_collaborators_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wedding_tasks t
     set assigned_to = null
   where t.wedding_id = old.wedding_id
     and t.assigned_to = old.user_id;
  return old;
end;
$$;

revoke all on function public.wedding_collaborators_after_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'wedding_tasks_collab_guard'
       and tgrelid = 'public.wedding_tasks'::regclass and not tgisinternal
  ) then
    create trigger wedding_tasks_collab_guard
      before update on public.wedding_tasks
      for each row execute function public.wedding_tasks_collab_guard();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'wedding_tasks_assignee_guard'
       and tgrelid = 'public.wedding_tasks'::regclass and not tgisinternal
  ) then
    create trigger wedding_tasks_assignee_guard
      before insert or update on public.wedding_tasks
      for each row execute function public.wedding_tasks_assignee_guard();
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgname = 'wedding_collaborators_after_delete'
       and tgrelid = 'public.wedding_collaborators'::regclass and not tgisinternal
  ) then
    create trigger wedding_collaborators_after_delete
      after delete on public.wedding_collaborators
      for each row execute function public.wedding_collaborators_after_delete();
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- BATCH 6 — create_my_wedding (entitled user creates their own wedding and gets
-- GENERIC template data: categories, a few zero-amount lines, packing list,
-- travel documents, purchase checklist). No names, vendors or amounts.
-- ---------------------------------------------------------------------------

create or replace function public.create_my_wedding(
  p_name text,
  p_wedding_date date,
  p_my_role text,
  p_my_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_name, ''));
  v_display text := btrim(coalesce(p_my_display_name, ''));
  v_wedding uuid;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Please sign in with a full account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.wedding_planner_entitlements e where e.user_id = v_uid) then
    raise exception 'Purchase the planner to create a wedding.' using errcode = '42501';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'Wedding name must be 1 to 120 characters.' using errcode = '22023';
  end if;
  if p_wedding_date is null then
    raise exception 'Please choose the wedding date.' using errcode = '22023';
  end if;
  if p_my_role is null or p_my_role not in ('groom', 'bride') then
    raise exception 'Role must be groom or bride.' using errcode = '22023';
  end if;
  if length(v_display) not between 1 and 80 then
    raise exception 'Your name must be 1 to 80 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from public.wedding_members m where m.user_id = v_uid)
     or exists (select 1 from public.wedding_collaborators c where c.user_id = v_uid) then
    raise exception 'You already belong to a wedding.' using errcode = '23505';
  end if;

  begin
    -- Noon local time so the calendar date is right in any timezone within +-11h.
    insert into public.wedding_weddings (name, wedding_date)
    values (v_name, (p_wedding_date::timestamp + time '12:00') at time zone 'Africa/Johannesburg')
    returning id into v_wedding;

    insert into public.wedding_members (wedding_id, user_id, role, display_name)
    values (v_wedding, v_uid, p_my_role, v_display);

    -- ---- budget categories
    insert into public.wedding_categories (wedding_id, scope, name, color, sort_order)
    select v_wedding, v.scope, v.name, v.color, v.ord
      from (values
        ('wedding',   'Venue',                  '#8E7CC3', 1),
        ('wedding',   'Catering',               '#E69138', 2),
        ('wedding',   'Photography and video',  '#3D85C6', 3),
        ('wedding',   'Attire',                 '#C27BA0', 4),
        ('wedding',   'Flowers and decor',      '#6AA84F', 5),
        ('wedding',   'Music and entertainment','#CC4125', 6),
        ('wedding',   'Stationery',             '#76A5AF', 7),
        ('wedding',   'Transport',              '#7F6000', 8),
        ('wedding',   'Beauty',                 '#D5A6BD', 9),
        ('wedding',   'Rings',                  '#BF9000', 10),
        ('wedding',   'Other',                  '#7F7F7F', 11),
        ('honeymoon', 'Flights',                '#3D85C6', 1),
        ('honeymoon', 'Accommodation',          '#8E7CC3', 2),
        ('honeymoon', 'Activities',             '#6AA84F', 3),
        ('honeymoon', 'Food and drink',         '#E69138', 4),
        ('honeymoon', 'Local transport',        '#7F6000', 5),
        ('honeymoon', 'Spending money',         '#7F7F7F', 6)
      ) as v(scope, name, color, ord);

    -- ---- a few generic budget lines (all amounts 0)
    insert into public.wedding_budget_lines (wedding_id, category_id, name, estimated_cents, sort_order)
    select v_wedding, c.id, v.line, 0, v.ord
      from (values
        ('wedding',   'Venue',                  'Venue hire', 1),
        ('wedding',   'Venue',                  'Venue deposit', 2),
        ('wedding',   'Catering',               'Food', 1),
        ('wedding',   'Catering',               'Drinks', 2),
        ('wedding',   'Catering',               'Cake', 3),
        ('wedding',   'Photography and video',  'Photographer', 1),
        ('wedding',   'Photography and video',  'Videographer', 2),
        ('wedding',   'Attire',                 'Wedding dress or suit', 1),
        ('wedding',   'Attire',                 'Alterations', 2),
        ('wedding',   'Flowers and decor',      'Bouquet and buttonholes', 1),
        ('wedding',   'Flowers and decor',      'Table decor', 2),
        ('wedding',   'Music and entertainment','DJ or band', 1),
        ('wedding',   'Stationery',             'Invitations', 1),
        ('wedding',   'Transport',              'Wedding day transport', 1),
        ('wedding',   'Beauty',                 'Hair and makeup', 1),
        ('wedding',   'Rings',                  'Wedding rings', 1),
        ('wedding',   'Other',                  'Officiant', 1),
        ('wedding',   'Other',                  'Contingency', 2),
        ('honeymoon', 'Flights',                'Return flights', 1),
        ('honeymoon', 'Accommodation',          'Accommodation', 1),
        ('honeymoon', 'Activities',             'Tours and activities', 1),
        ('honeymoon', 'Food and drink',         'Meals', 1),
        ('honeymoon', 'Local transport',        'Transfers and local transport', 1),
        ('honeymoon', 'Spending money',         'Spending money', 1)
      ) as v(scope, cat, line, ord)
      join public.wedding_categories c
        on c.wedding_id = v_wedding and c.scope = v.scope and c.name = v.cat;

    -- ---- packing list
    insert into public.wedding_packing_items (wedding_id, name, category)
    select v_wedding, v.name, v.category
      from (values
        ('Passports',                      'Documents'),
        ('Printed bookings and tickets',   'Documents'),
        ('Travel insurance details',       'Documents'),
        ('Swimwear',                       'Clothing'),
        ('Light everyday outfits',         'Clothing'),
        ('Evening outfits',                'Clothing'),
        ('Comfortable walking shoes',      'Clothing'),
        ('Sunscreen',                      'Toiletries'),
        ('Toiletry bag',                   'Toiletries'),
        ('Prescription medication',        'Health'),
        ('First aid basics',               'Health'),
        ('Phone chargers',                 'Electronics'),
        ('Plug adapters',                  'Electronics'),
        ('Camera',                         'Electronics'),
        ('Power bank',                     'Electronics')
      ) as v(name, category);

    -- ---- travel documents checklist
    insert into public.wedding_travel_docs (wedding_id, title, person)
    select v_wedding, v.title, 'both'
      from (values
        ('Passports valid for the whole trip'),
        ('Visas or entry permits'),
        ('Travel insurance'),
        ('Flight tickets'),
        ('Accommodation confirmations'),
        ('Vaccinations or health requirements'),
        ('Foreign currency or travel card')
      ) as v(title);

    -- ---- purchase checklist
    insert into public.wedding_purchase_items (wedding_id, name, category, quantity)
    select v_wedding, v.name, v.category, 1
      from (values
        ('Wedding rings',              'Rings'),
        ('Wedding attire',             'Attire'),
        ('Shoes and accessories',      'Attire'),
        ('Guest favours',              'Decor'),
        ('Decor supplies',             'Decor'),
        ('Guest book',                 'Decor'),
        ('Going-away outfit',          'Attire'),
        ('Honeymoon luggage',          'Travel')
      ) as v(name, category);
  exception
    when unique_violation then
      raise exception 'You already belong to a wedding.' using errcode = '23505';
  end;

  return v_wedding;
end;
$$;

revoke all on function public.create_my_wedding(text, date, text, text) from public, anon;
grant execute on function public.create_my_wedding(text, date, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- BATCH 7 — people, invites, removal
-- ---------------------------------------------------------------------------

-- Couple: everyone (couple + collaborators). Collaborator: themselves + the couple.
-- Anyone else: no rows.
create or replace function public.wedding_people(p_wedding uuid)
returns table (user_id uuid, display_name text, kind text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.wedding_has_access(p_wedding) then
    return;
  end if;

  if public.wedding_is_member(p_wedding) then
    return query
      select m.user_id, m.display_name, 'partner'::text, m.role
        from public.wedding_members m where m.wedding_id = p_wedding
      union all
      select c.user_id, c.display_name, 'collaborator'::text, null::text
        from public.wedding_collaborators c where c.wedding_id = p_wedding;
  else
    return query
      select m.user_id, m.display_name, 'partner'::text, m.role
        from public.wedding_members m where m.wedding_id = p_wedding
      union all
      select c.user_id, c.display_name, 'collaborator'::text, null::text
        from public.wedding_collaborators c
       where c.wedding_id = p_wedding and c.user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.wedding_people(uuid) from public, anon;
grant execute on function public.wedding_people(uuid) to authenticated;

-- Accept an invite. The token is hashed here (sha256 hex of the UTF-8 token, same
-- as the Edge Function must produce); the token itself is never stored. One atomic
-- UPDATE claims the invite, so two simultaneous accepts cannot both win; any later
-- failure raises and rolls the claim back.
create or replace function public.accept_wedding_invite(p_token text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_hash      text;
  v_inv       record;
  v_name      text;
  v_role      text;
  v_count     integer;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Please sign in with a full account.' using errcode = '42501';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at into v_email, v_confirmed
    from auth.users u where u.id = v_uid;

  if v_email is null or v_confirmed is null then
    raise exception 'Please confirm your email address first.' using errcode = '42501';
  end if;

  if exists (select 1 from public.wedding_members m where m.user_id = v_uid)
     or exists (select 1 from public.wedding_collaborators c where c.user_id = v_uid) then
    raise exception 'You already belong to a wedding.' using errcode = '23505';
  end if;

  if p_display_name is not null and length(btrim(p_display_name)) > 80 then
    raise exception 'Your name must be 1 to 80 characters.' using errcode = '22023';
  end if;

  if p_token is null or length(p_token) < 16 or length(p_token) > 200 then
    raise exception 'This invite is not valid or has expired.' using errcode = 'P0002';
  end if;

  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  update public.wedding_invites i
     set accepted_at = now(), accepted_by = v_uid
   where i.token_hash = v_hash
     and i.accepted_at is null
     and i.revoked_at is null
     and i.expires_at > now()
     and i.email = v_email
  returning i.id, i.wedding_id, i.kind, i.display_name into v_inv;

  if not found then
    raise exception 'This invite is not valid or has expired.' using errcode = 'P0002';
  end if;

  v_name := left(coalesce(nullif(btrim(p_display_name), ''), v_inv.display_name,
                          nullif(split_part(v_email, '@', 1), ''), 'Guest'), 80);

  -- Serialise on the wedding row.
  perform 1 from public.wedding_weddings w where w.id = v_inv.wedding_id for update;

  begin
    if v_inv.kind = 'partner' then
      select count(*) into v_count from public.wedding_members m where m.wedding_id = v_inv.wedding_id;
      if v_count >= 2 then
        raise exception 'This wedding cannot accept more people.' using errcode = '23514';
      end if;

      select case when m.role = 'groom' then 'bride' else 'groom' end into v_role
        from public.wedding_members m where m.wedding_id = v_inv.wedding_id limit 1;
      v_role := coalesce(v_role, 'groom');

      insert into public.wedding_members (wedding_id, user_id, role, display_name)
      values (v_inv.wedding_id, v_uid, v_role, v_name);
    else
      select count(*) into v_count from public.wedding_collaborators c where c.wedding_id = v_inv.wedding_id;
      if v_count >= 10 then
        raise exception 'This wedding cannot accept more people.' using errcode = '23514';
      end if;

      insert into public.wedding_collaborators (wedding_id, user_id, display_name, added_by)
      select v_inv.wedding_id, v_uid, v_name, i.invited_by
        from public.wedding_invites i where i.id = v_inv.id;
    end if;
  exception
    when unique_violation then
      raise exception 'You already belong to a wedding.' using errcode = '23505';
  end;

  return jsonb_build_object('wedding_id', v_inv.wedding_id, 'kind', v_inv.kind);
end;
$$;

revoke all on function public.accept_wedding_invite(text, text) from public, anon;
grant execute on function public.accept_wedding_invite(text, text) to authenticated;

create or replace function public.remove_collaborator(p_wedding uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.wedding_is_member(p_wedding) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  delete from public.wedding_collaborators c
   where c.wedding_id = p_wedding and c.user_id = p_user;

  if not found then
    raise exception 'Collaborator not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.remove_collaborator(uuid, uuid) from public, anon;
grant execute on function public.remove_collaborator(uuid, uuid) to authenticated;

create or replace function public.revoke_wedding_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.wedding_invites i
     set revoked_at = now()
   where i.id = p_invite
     and i.accepted_at is null
     and i.revoked_at is null
     and public.wedding_is_member(i.wedding_id);

  if not found then
    raise exception 'Invite not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.revoke_wedding_invite(uuid) from public, anon;
grant execute on function public.revoke_wedding_invite(uuid) to authenticated;

create or replace function public.leave_wedding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Please sign in with a full account.' using errcode = '42501';
  end if;

  delete from public.wedding_collaborators c where c.user_id = auth.uid();

  if not found then
    raise exception 'You are not a collaborator on any wedding.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.leave_wedding() from public, anon;
grant execute on function public.leave_wedding() to authenticated;


-- ---------------------------------------------------------------------------
-- BATCH 8 — realtime. wedding_collaborators only. wedding_invites is deliberately
-- NOT published: Realtime filters rows by RLS but does not honour column-level
-- grants, so its payload could include token_hash. Clients refetch invites instead.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wedding_collaborators'
    ) then
      alter publication supabase_realtime add table public.wedding_collaborators;
    end if;
  end if;
end
$$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- VERIFY (read-only)
--   -- RLS on, expected policies:
--   select tablename, rowsecurity from pg_tables
--    where tablename in ('wedding_planner_entitlements','wedding_collaborators','wedding_invites');  -- all true
--   select tablename, policyname, cmd from pg_policies
--    where tablename in ('wedding_planner_entitlements','wedding_collaborators','wedding_invites')
--       or (tablename = 'wedding_tasks' and policyname like 'wedding_collab_%') order by 1, 2;
--     -- entitlements: select_own; collaborators: select + delete; invites: select; tasks: collab select + update
--   -- grants (authenticated must NOT have insert/update on any of the three; invites: column select only):
--   select table_name, grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('wedding_planner_entitlements','wedding_collaborators','wedding_invites')
--      and grantee in ('anon','authenticated','public') order by 1, 2, 3;
--   select column_name, privilege_type from information_schema.column_privileges
--    where table_name = 'wedding_invites' and grantee = 'authenticated';  -- no token_hash
--   -- functions exist, SECURITY DEFINER, empty search_path, not executable by anon:
--   select p.proname, p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon_exec
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('wedding_has_access','wedding_is_collaborator',
--      'my_wedding_planner_status','my_collab_wedding','create_my_wedding','wedding_people',
--      'accept_wedding_invite','remove_collaborator','revoke_wedding_invite','leave_wedding');
--   -- triggers:
--   select tgname, tgrelid::regclass from pg_trigger where not tgisinternal
--    and tgname in ('wedding_tasks_collab_guard','wedding_tasks_assignee_guard',
--                   'wedding_collaborators_guard','wedding_collaborators_after_delete');
--   -- grandfathering: every member has an entitlement (expect 0):
--   select count(*) from public.wedding_members m
--    where not exists (select 1 from public.wedding_planner_entitlements e where e.user_id = m.user_id);
--   -- sha256() builtin works (expect 64-char hex):
--   select encode(sha256(convert_to('x','UTF8')),'hex');
--   -- realtime: wedding_collaborators listed, wedding_invites NOT:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename in ('wedding_collaborators','wedding_invites');
-- ---------------------------------------------------------------------------
