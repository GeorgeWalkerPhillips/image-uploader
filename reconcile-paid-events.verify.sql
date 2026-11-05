-- ============================================================================
-- Scripted verification for reconcile-paid-events-2026-11.sql
--
-- Run against the live DB as ONE statement (SQL editor, or begin; ...; rollback;).
-- It creates throwaway events and payments, exercises the preview and the fixer,
-- then ALWAYS ends with `raise exception`, so nothing is ever persisted. The
-- error text is the result:
--     VERIFY PASS: ...   everything behaved
--     VERIFY FAIL: ...   lists each failed assertion
--
-- Needs at least one row in auth.users (a second, different user is optional:
-- without one the "different user" case is reported as skipped).
-- Creates no real customer data and sends no email. Run it when no real
-- payment is mid-flight, though even then nothing survives the rollback.
-- ============================================================================

do $$
declare
  v_fail        text := '';
  v_skipped     text := '';
  v_user        uuid;
  v_other       uuid;
  v_marker      text := '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}';
  v_claims_pre  text;
  v_claims_post text;
  v_role_pre    text;
  v_role_post   text;
  v_tag         text := pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text), 1, 8);
  v_ok_event    uuid;  -- growth, correct payment: must be fixed
  v_amt_event   uuid;  -- growth, wrong amount
  v_cur_event   uuid;  -- growth, wrong currency
  v_usr_event   uuid;  -- growth, payment by a different user
  v_free_event  uuid;  -- free tier with a payment
  v_old_event   uuid;  -- growth, correct payment but older than 14 days
  v_paid_event  uuid;  -- already paid and healthy
  v_n           integer;
  v_row         record;
  v_ev          record;
  v_fresh_event uuid;
  v_first_n     integer;
  v_second_n    integer;
  v_global_n    integer;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception 'VERIFY FAIL: no row in auth.users to use as event owner';
  end if;
  select id into v_other from auth.users where id <> v_user order by created_at limit 1;

  -- ---- setup, under a service_role claim so the billing trigger lets us write
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.events (name, start_date, end_date, expiry_date, created_by, tier,
                             is_paid, payment_status, paid_at, guest_cap, photo_cap_per_guest)
  values
    ('verify-ok-' || v_tag,   now(), now() + interval '1 day', now() + interval '30 days', v_user, 'growth', false, 'pending_payment', null, 5, 5),
    ('verify-amt-' || v_tag,  now(), now() + interval '1 day', now() + interval '30 days', v_user, 'growth', false, 'pending_payment', null, 5, 5),
    ('verify-cur-' || v_tag,  now(), now() + interval '1 day', now() + interval '30 days', v_user, 'growth', false, 'pending_payment', null, 5, 5),
    ('verify-usr-' || v_tag,  now(), now() + interval '1 day', now() + interval '30 days', v_user, 'growth', false, 'pending_payment', null, 5, 5),
    ('verify-free-' || v_tag, now(), now() + interval '1 day', now() + interval '30 days', v_user, 'free',   false, 'free',            null, 5, 5),
    ('verify-old-' || v_tag,  now(), now() + interval '1 day', now() + interval '30 days', v_user, 'growth', false, 'pending_payment', null, 5, 5),
    ('verify-paid-' || v_tag, now(), now() + interval '1 day', now() + interval '30 days', v_user, 'growth', true,  'completed',       now(), 50, 25),
    ('verify-fresh-' || v_tag, now(), now() + interval '1 day', now() + interval '30 days', v_user, 'growth', false, 'pending_payment', null, 5, 5);

  select id into v_ok_event   from public.events where name = 'verify-ok-'   || v_tag;
  select id into v_amt_event  from public.events where name = 'verify-amt-'  || v_tag;
  select id into v_cur_event  from public.events where name = 'verify-cur-'  || v_tag;
  select id into v_usr_event  from public.events where name = 'verify-usr-'  || v_tag;
  select id into v_free_event from public.events where name = 'verify-free-' || v_tag;
  select id into v_old_event  from public.events where name = 'verify-old-'  || v_tag;
  select id into v_paid_event from public.events where name = 'verify-paid-' || v_tag;
  select id into v_fresh_event from public.events where name = 'verify-fresh-' || v_tag;

  -- Payments (succeeded). Correct = growth R399.00 ZAR by the event owner.
  insert into public.payments (event_id, user_id, payment_reference, amount_cents, currency, status, metadata)
  values
    (v_ok_event,   v_user, 'verify-' || v_tag || '-ok',   39900, 'ZAR', 'succeeded', '{"tier":"growth"}'),
    (v_amt_event,  v_user, 'verify-' || v_tag || '-amt',  17900, 'ZAR', 'succeeded', '{"tier":"growth"}'),
    (v_cur_event,  v_user, 'verify-' || v_tag || '-cur',  39900, 'USD', 'succeeded', '{"tier":"growth"}'),
    (v_free_event, v_user, 'verify-' || v_tag || '-free', 17900, 'ZAR', 'succeeded', '{"tier":"free"}'),
    (v_old_event,  v_user, 'verify-' || v_tag || '-old',  39900, 'ZAR', 'succeeded', '{"tier":"growth"}'),
    (v_paid_event, v_user, 'verify-' || v_tag || '-paid', 39900, 'ZAR', 'succeeded', '{"tier":"growth"}'),
    (v_fresh_event, v_user, 'verify-' || v_tag || '-fresh', 39900, 'ZAR', 'succeeded', '{"tier":"growth"}');

  update public.payments set created_at = now() - interval '30 days'
   where payment_reference = 'verify-' || v_tag || '-old';

  if v_other is not null then
    insert into public.payments (event_id, user_id, payment_reference, amount_cents, currency, status, metadata)
    values (v_usr_event, v_other, 'verify-' || v_tag || '-usr', 39900, 'ZAR', 'succeeded', '{"tier":"growth"}');
  else
    v_skipped := v_skipped || 'different-user case skipped (only one auth user); ';
  end if;

  -- The reconciler ignores payments younger than 2 minutes (grace period for the
  -- webhook's own flip), so age the test payments; 'fresh' stays brand new on purpose.
  update public.payments set created_at = now() - interval '10 minutes'
   where payment_reference like 'verify-' || v_tag || '-%'
     and payment_reference <> 'verify-' || v_tag || '-old'
     and payment_reference <> 'verify-' || v_tag || '-fresh';

  -- Switch to a distinctive NON-service claim so the claim save/restore is observable.
  perform set_config('request.jwt.claims', v_marker, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- (b) preview ---------------------------------------------------------------
  select * into v_row from public.reconcile_paid_events_preview() where event_id = v_ok_event;
  if v_row.verdict is distinct from 'fixable' then
    v_fail := v_fail || 'preview: matching payment is not fixable (' || coalesce(v_row.verdict, 'no row') || '); ';
  end if;

  for v_row in
    select * from public.reconcile_paid_events_preview()
     where event_id in (v_amt_event, v_cur_event, v_free_event)
        or (v_other is not null and event_id = v_usr_event)
  loop
    if v_row.verdict is distinct from 'needs_manual_review' or v_row.reason is null then
      v_fail := v_fail || 'preview: ' || v_row.payment_reference || ' should be needs_manual_review; ';
    end if;
  end loop;

  select count(*) into v_n from public.reconcile_paid_events_preview()
   where event_id in (v_amt_event, v_cur_event, v_free_event)
      or (v_other is not null and event_id = v_usr_event);
  if v_n <> (case when v_other is not null then 4 else 3 end) then
    v_fail := v_fail || 'preview: expected ' || (case when v_other is not null then 4 else 3 end)
              || ' manual-review rows, got ' || v_n || '; ';
  end if;

  select count(*) into v_n from public.reconcile_paid_events_preview()
   where event_id in (v_old_event, v_paid_event, v_fresh_event);
  if v_n <> 0 then
    v_fail := v_fail || 'preview: old (>14 days), already-paid or fresh (<2 min) event listed; ';
  end if;

  -- (c) first run -----------------------------------------------------------------
  v_claims_pre := current_setting('request.jwt.claims', true);
  v_role_pre   := current_setting('request.jwt.claim.role', true);

  select count(*) filter (where fixed) into v_first_n from public.reconcile_paid_events();

  v_claims_post := current_setting('request.jwt.claims', true);
  v_role_post   := current_setting('request.jwt.claim.role', true);

  select * into v_ev from public.events where id = v_ok_event;
  if v_ev.is_paid is not true or v_ev.payment_status is distinct from 'completed'
     or v_ev.paid_at is null or v_ev.guest_cap <> 50 or v_ev.photo_cap_per_guest <> 25
     or v_ev.tier <> 'growth' then
    v_fail := v_fail || 'fix: event not paid/completed with growth caps 50/25 (is_paid=' || coalesce(v_ev.is_paid::text, 'null')
              || ', status=' || coalesce(v_ev.payment_status, 'null')
              || ', caps=' || coalesce(v_ev.guest_cap::text, 'null') || '/' || coalesce(v_ev.photo_cap_per_guest::text, 'null') || '); ';
  end if;

  select count(*) into v_n from public.error_logs
   where event_id = v_ok_event and source = 'reconcile-paid-events' and severity = 'warning';
  if v_n <> 1 then
    v_fail := v_fail || 'fix: expected 1 error_logs row, got ' || v_n || '; ';
  end if;

  if v_first_n < 1 then
    v_fail := v_fail || 'fix: reconcile_paid_events reported no fixed rows; ';
  end if;

  -- (e) nothing else unlocked ------------------------------------------------------
  for v_ev in
    select id, name, is_paid, payment_status, guest_cap, photo_cap_per_guest from public.events
     where id in (v_amt_event, v_cur_event, v_usr_event, v_free_event, v_old_event, v_fresh_event)
  loop
    if v_ev.is_paid is true or v_ev.payment_status in ('completed')
       or v_ev.guest_cap <> 5 or v_ev.photo_cap_per_guest <> 5 then
      -- the different-user event only exists as a payment when a second user exists
      if v_ev.id = v_usr_event and v_other is null then continue; end if;
      v_fail := v_fail || 'guard: ' || v_ev.name || ' was unlocked or changed; ';
    end if;
  end loop;

  select * into v_ev from public.events where id = v_paid_event;
  if v_ev.guest_cap <> 50 or v_ev.photo_cap_per_guest <> 25 or v_ev.is_paid is not true then
    v_fail := v_fail || 'guard: healthy paid event was modified; ';
  end if;

  -- (d) second run is a no-op ------------------------------------------------------------
  select count(*) into v_second_n from public.reconcile_paid_events()
   where event_id in (v_ok_event, v_amt_event, v_cur_event, v_usr_event, v_free_event, v_old_event, v_paid_event);
  if v_second_n <> 0 then
    v_fail := v_fail || 'idempotency: second run touched ' || v_second_n || ' test events; ';
  end if;

  select count(*) into v_n from public.error_logs
   where event_id = v_ok_event and source = 'reconcile-paid-events';
  if v_n <> 1 then
    v_fail := v_fail || 'idempotency: error_logs rows after second run = ' || v_n || ' (expected 1); ';
  end if;

  select count(*) into v_n from public.reconcile_paid_events_preview() where event_id = v_ok_event;
  if v_n <> 0 then
    v_fail := v_fail || 'preview: fixed event still listed; ';
  end if;

  -- Anything left in the preview that is still fixable means a real fix failed.
  select count(*) into v_global_n from public.reconcile_paid_events_preview() where verdict = 'fixable';
  if v_global_n <> 0 then
    v_fail := v_fail || 'global: ' || v_global_n || ' fixable rows remain after reconcile (see error_logs); ';
  end if;

  -- (f) claims restored (a never-set value comes back as '' which auth.role() treats as unset)
  if coalesce(v_claims_post, '') <> coalesce(v_claims_pre, '') or coalesce(v_role_post, '') <> coalesce(v_role_pre, '') then
    v_fail := v_fail || 'claims: not restored after reconcile_paid_events (' || coalesce(v_claims_post, 'null') || '); ';
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') <> v_marker then
    v_fail := v_fail || 'claims: marker claim changed; ';
  end if;
  if auth.role() is distinct from 'authenticated' then
    v_fail := v_fail || 'claims: auth.role() is ' || coalesce(auth.role(), 'null') || ' after reconcile, expected authenticated; ';
  end if;

  -- A non-service write must still be unable to unlock/lock (trigger intact).
  update public.events set name = name || '' where id = v_amt_event;
  select * into v_ev from public.events where id = v_amt_event;
  if v_ev.is_paid is true then
    v_fail := v_fail || 'trigger: a non-service update unlocked an event; ';
  end if;

  if v_fail <> '' then
    raise exception 'VERIFY FAIL: %', v_fail;
  end if;
  raise exception 'VERIFY PASS: preview and guard cases ok, first run fixed %, second run touched %, claims restored, error_logs written once. % (rolled back by design)',
    v_first_n, v_second_n, v_skipped;
end
$$;
