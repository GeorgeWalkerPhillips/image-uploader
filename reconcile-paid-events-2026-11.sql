-- ============================================================================
-- Self-healing reconciler for paid-but-locked events (Nov 2026)
--
-- WHY: a customer paid (payments row 'succeeded'), but the event ended up
-- is_paid = false / payment_status <> 'completed' (first cause: the old billing
-- trigger reset billing fields on a rename, fixed by
-- billing-trigger-preserve-on-update-2026-11.sql; an earlier case had an
-- unproven cause). This is a safety net that works whatever the cause: every 5
-- minutes the reconcile-paid-events Edge Function re-unlocks an event ONLY when
-- a recorded, succeeded payment provably matches it, then emails the owner of
-- the project (OPS_ALERT_EMAIL) about anything fixed or needing a human.
--
-- Contents (apply in the labelled BATCHES, each is self-contained and re-runnable):
--   BATCH 1  public.reconcile_paid_events_preview()  read-only diagnosis
--   BATCH 2  public.reconcile_paid_events()          the fixer
--   BATCH 3  grants (service_role only, both functions)
--   BATCH 4  pg_cron job reconcile-paid-events-every-5-min
--
-- Create-only and idempotent (create or replace / if not exists). Needs
-- payments(payment_reference) from paystack-migration.sql, events.tier from
-- pricing-tiers-migration.sql and error_logs from error-logging.sql.
--
-- SECURITY NOTES
--   * Both functions are SECURITY DEFINER with an empty search_path (everything
--     schema-qualified) and are executable by service_role ONLY.
--   * The fixer raises the billing role transiently (transaction-local
--     request.jwt.claims / request.jwt.claim.role = service_role) so the
--     enforce_event_billing_integrity() trigger permits the write. The previous
--     values are saved first and restored right after the UPDATE, and again in
--     the exception handler.
--   * It never touches an event without a succeeded payment that matches the
--     tier price, ZAR, and the event owner; never changes tier; never lowers a cap.
--
-- SYNC POINT: tier prices and caps below mirror TIER_CONFIG in
-- supabase/functions/_shared/paystackPayment.ts, src/services/pricingTiers.js and
-- enforce_event_billing_integrity(). Change one, change all.
--
-- ONE-TIME SETUP before BATCH 4 (the service_role_key Vault secret already
-- exists from event-archive-and-emails.sql; only the URL is new). Replace the
-- placeholder and run once:
--   select vault.create_secret(
--     'https://<your-project-ref>.supabase.co/functions/v1/reconcile-paid-events',
--     'reconcile_paid_events_function_url');
-- Deploy the function first: supabase functions deploy reconcile-paid-events --project-ref <ref>
--
-- ROLLBACK (nothing else depends on these objects; no data is changed by rolling back):
--   select cron.unschedule('reconcile-paid-events-every-5-min');
--   then remove the two functions with an owner-run statement (see PAYMENT_SETUP.md,
--   section "Self-healing reconciler", for the exact text). Events already
--   re-unlocked stay unlocked.
--
-- Verification script (run inside a transaction you roll back):
-- reconcile-paid-events.verify.sql
-- ============================================================================


-- ---------------------------------------------------------------------------
-- BATCH 1 — preview (read-only). One row per affected event: the best payment
-- (a fixable one first, then the oldest). Only payments from the last 14 days.
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_paid_events_preview()
returns table (
  event_id             uuid,
  tier                 text,
  payment_reference    text,
  payment_amount_cents integer,
  payment_currency     text,
  paid_recorded_at     timestamptz,
  verdict              text,
  reason               text,
  guest_cap            integer,
  photo_cap_per_guest  integer
)
language sql
stable
security definer
set search_path = ''
as $$
  -- SYNC POINT with TIER_CONFIG (paystackPayment.ts), pricingTiers.js and the
  -- billing trigger: price in ZAR cents, guest cap, photo cap per guest.
  with tiers (tier, price_cents, guest_cap, photo_cap) as (
    values
      ('starter'::text,   17900, 25,  15),
      ('growth'::text,    39900, 50,  25),
      ('unlimited'::text, 99900, 500, 50)
  ),
  candidates as (
    select
      e.id                as event_id,
      e.tier              as tier,
      p.payment_reference as payment_reference,
      p.amount_cents      as payment_amount_cents,
      p.currency          as payment_currency,
      p.created_at        as paid_recorded_at,
      case
        when t.tier is null then
          'tier is not a paid tier'
        when p.currency is distinct from 'ZAR' then
          'payment currency is not ZAR'
        when p.amount_cents is distinct from t.price_cents then
          'payment amount does not match the tier price'
        when p.user_id is distinct from e.created_by then
          'payment owner differs from event owner'
        else null
      end                 as reason,
      t.guest_cap         as guest_cap,
      t.photo_cap         as photo_cap_per_guest
    from public.payments p
    join public.events e on e.id = p.event_id
    left join tiers t on t.tier = e.tier
    where p.status = 'succeeded'
      and p.created_at >= now() - interval '14 days'
      and (e.is_paid is not true or e.payment_status is distinct from 'completed')
  )
  select distinct on (c.event_id)
    c.event_id,
    c.tier,
    c.payment_reference,
    c.payment_amount_cents,
    c.payment_currency,
    c.paid_recorded_at,
    case when c.reason is null then 'fixable' else 'needs_manual_review' end as verdict,
    c.reason,
    c.guest_cap,
    c.photo_cap_per_guest
  from candidates c
  order by c.event_id, (c.reason is not null), c.paid_recorded_at, c.payment_reference;
$$;


-- ---------------------------------------------------------------------------
-- BATCH 2 — the fixer. Returns one row per fixable event it attempted.
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_paid_events()
returns table (
  event_id             uuid,
  tier                 text,
  payment_reference    text,
  payment_amount_cents integer,
  fixed                boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r             record;
  v_prev_claims text;
  v_prev_role   text;
  v_rows        integer;
begin
  for r in
    select p.*
      from public.reconcile_paid_events_preview() p
     where p.verdict = 'fixable'
  loop
    v_rows := 0;

    -- Remember the caller's claims (null when never set in this session).
    v_prev_claims := pg_catalog.current_setting('request.jwt.claims', true);
    v_prev_role   := pg_catalog.current_setting('request.jwt.claim.role', true);

    begin
      -- Transaction-local: lets enforce_event_billing_integrity() see auth.role() = 'service_role'.
      perform pg_catalog.set_config('request.jwt.claims', '{"role":"service_role"}', true);
      perform pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);

      -- Idempotent and race-safe: the WHERE repeats the "still locked" condition
      -- and pins the tier, so a concurrent run or a tier mismatch updates 0 rows.
      -- Caps are only ever raised to the tier caps; a NULL cap (uncapped) stays NULL.
      update public.events ev
         set is_paid             = true,
             payment_status      = 'completed',
             paid_at             = coalesce(ev.paid_at, r.paid_recorded_at),
             guest_cap           = case when ev.guest_cap is null then null
                                        else greatest(ev.guest_cap, r.guest_cap) end,
             photo_cap_per_guest = case when ev.photo_cap_per_guest is null then null
                                        else greatest(ev.photo_cap_per_guest, r.photo_cap_per_guest) end
       where ev.id = r.event_id
         and ev.tier = r.tier
         and (ev.is_paid is not true or ev.payment_status is distinct from 'completed');
      get diagnostics v_rows = row_count;

      -- Restore the caller's claims immediately after the write.
      perform pg_catalog.set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
      perform pg_catalog.set_config('request.jwt.claim.role', coalesce(v_prev_role, ''), true);

      if v_rows > 0 then
        insert into public.error_logs (event_id, severity, source, message, context)
        values (
          r.event_id,
          'warning',
          'reconcile-paid-events',
          'Re-unlocked event after recorded payment ' || r.payment_reference,
          pg_catalog.jsonb_build_object(
            'tier', r.tier,
            'amount_cents', r.payment_amount_cents,
            'payment_reference', r.payment_reference
          )
        );
      end if;
    exception when others then
      -- The subtransaction rolled back the update and the claim changes; restore anyway.
      perform pg_catalog.set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
      perform pg_catalog.set_config('request.jwt.claim.role', coalesce(v_prev_role, ''), true);
      v_rows := 0;
      insert into public.error_logs (event_id, severity, source, message, context)
      values (
        r.event_id,
        'error',
        'reconcile-paid-events',
        'Failed to re-unlock event for payment ' || r.payment_reference || ' (sqlstate ' || sqlstate || ')',
        pg_catalog.jsonb_build_object('tier', r.tier, 'payment_reference', r.payment_reference)
      );
    end;

    event_id             := r.event_id;
    tier                 := r.tier;
    payment_reference    := r.payment_reference;
    payment_amount_cents := r.payment_amount_cents;
    fixed                := v_rows > 0;
    return next;
  end loop;

  return;
end;
$$;


-- ---------------------------------------------------------------------------
-- BATCH 3 — grants. Supabase grants execute on new public functions to anon and
-- authenticated through default privileges, so revoke them explicitly.
-- ---------------------------------------------------------------------------

revoke all on function public.reconcile_paid_events_preview() from public, anon, authenticated;
revoke all on function public.reconcile_paid_events()         from public, anon, authenticated;
grant execute on function public.reconcile_paid_events_preview() to service_role;
grant execute on function public.reconcile_paid_events()         to service_role;


-- ---------------------------------------------------------------------------
-- BATCH 4 — cron job (needs the one-time Vault secret above). Same pattern as
-- wedding-hq-2026-10d-reminders.sql: the Authorization header is the service
-- role key read from Vault, never pasted into this file.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'reconcile-paid-events-every-5-min') then
    perform cron.schedule(
      'reconcile-paid-events-every-5-min',
      '*/5 * * * *',
      $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_paid_events_function_url'),
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cron$
    );
  end if;
end
$$;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- VERIFY (read-only):
--   select jobid, jobname, schedule, active from cron.job
--    where jobname = 'reconcile-paid-events-every-5-min';          -- 1 row, active, */5 * * * *
--   select proname, prosecdef, proconfig from pg_proc
--    where proname in ('reconcile_paid_events', 'reconcile_paid_events_preview')
--      and pronamespace = 'public'::regnamespace;                    -- 2 rows, prosecdef true, search_path=""
--   select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
--     from pg_proc p cross join pg_roles r
--    where p.proname in ('reconcile_paid_events', 'reconcile_paid_events_preview')
--      and p.pronamespace = 'public'::regnamespace
--      and r.rolname in ('anon', 'authenticated', 'service_role');   -- true ONLY for service_role
--   select * from public.reconcile_paid_events_preview();            -- zero rows when healthy
--   select name from vault.decrypted_secrets
--    where name in ('service_role_key', 'reconcile_paid_events_function_url');  -- 2 rows
-- Full scripted check: reconcile-paid-events.verify.sql (inside a rolled-back transaction).
-- ----------------------------------------------------------------------------
