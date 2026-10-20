-- ============================================================================
-- Wedding Planner bundle backfill (run once, after wedding-hq-2026-10e).
--
-- The Wedding Planner is INCLUDED FREE with the top Capture by Val tier
-- (`unlimited`, "The Whole Reel"). New payments are handled in code
-- (paystackPayment.ts -> applyPaystackPayment). This file grants the same
-- entitlement to owners of events that were ALREADY paid before that deploy.
--
-- Convention: bundle rows have payment_reference = 'bundle-' || <event id>,
-- amount_cents = 0 and source = 'admin' (the table's CHECK allows only
-- paystack | grandfathered | admin and is not altered). 'bundle-%' therefore
-- means "included with the unlimited tier".
--
-- Create-only and idempotent: NO DROP. ON CONFLICT DO NOTHING covers both a
-- user who already has an entitlement (user_id PK) and a bundle already
-- granted (payment_reference UNIQUE). Anonymous guest accounts are skipped.
-- No personal data; set-based.
--
-- Run as postgres/service role in the SQL editor (RLS is bypassed there; the
-- table is service-role-write only for clients).
--
-- ROLLBACK (removes only bundle grants; paid/grandfathered rows untouched):
--   delete from public.wedding_planner_entitlements
--    where payment_reference like 'bundle-%';
-- (This revokes planner access for those owners; any weddings they created stay.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BATCH 1 — grant the bundle to owners of already-paid unlimited events
-- ---------------------------------------------------------------------------
insert into public.wedding_planner_entitlements (user_id, payment_reference, amount_cents, source)
select e.created_by, 'bundle-' || e.id::text, 0, 'admin'
  from public.events e
 where e.tier = 'unlimited'
   and e.is_paid = true
   and e.created_by is not null
   and exists (
     select 1 from auth.users u
      where u.id = e.created_by
        and coalesce(u.is_anonymous, false) = false
   )
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only)
-- ---------------------------------------------------------------------------
-- Every paid unlimited event owner should now be entitled (expect 0 rows):
select e.id as event_id, e.created_by
  from public.events e
 where e.tier = 'unlimited' and e.is_paid = true and e.created_by is not null
   and not exists (select 1 from public.wedding_planner_entitlements w where w.user_id = e.created_by)
   and exists (select 1 from auth.users u where u.id = e.created_by and coalesce(u.is_anonymous, false) = false);

-- Bundle rows by source (expect source = 'admin', amount_cents = 0):
select source, amount_cents, count(*) as n
  from public.wedding_planner_entitlements
 where payment_reference like 'bundle-%'
 group by 1, 2;
