-- ============================================================================
-- Billing-integrity trigger: stop re-locking paid events (Nov 2026)
--
-- BUG (found 2026-11-05 from a real customer payment): the previous
-- enforce_event_billing_integrity() reset is_paid / payment_status / paid_at to
-- "pending" on EVERY write that is not made by the service role, including
-- harmless edits. A customer paid for an event (webhook unlocked it at 19:23:51),
-- then renamed the event from the admin page (PATCH events {name}) four minutes
-- later, and the trigger silently set the event back to pending_payment. The
-- same thing explains the earlier unexplained "paid but still locked" case.
--
-- FIX: billing fields can still only be changed by the service role (clients
-- cannot unlock OR re-lock anything), but on UPDATE a non-service write now
-- PRESERVES the existing values instead of resetting them. Caps are likewise
-- preserved on UPDATE (set from the tier only on INSERT). The "unlimited" tier
-- is capped at 500 guests / 50 photos per guest, matching TIER_CONFIG in
-- supabase/functions/_shared/paystackPayment.ts and src/services/pricingTiers.js
-- (production previously had NULL = uncapped for new unlimited events).
--
-- Idempotent (CREATE OR REPLACE; the existing trigger picks up the new body).
-- Apply as one statement. No DROP.
--
-- ROLLBACK: re-run pricing-rework-2026-09.sql section 1 (restores the old body).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_event_billing_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  expected_guest_cap INT;
  expected_photo_cap INT;
BEGIN
  -- The service role (Edge Functions: paystack-webhook, paystack-verify,
  -- paystack-initialize) may write billing fields freely.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  CASE NEW.tier
    WHEN 'free' THEN
      expected_guest_cap := 5;
      expected_photo_cap := 5;
    WHEN 'starter' THEN
      expected_guest_cap := 25;
      expected_photo_cap := 15;
    WHEN 'growth' THEN
      expected_guest_cap := 50;
      expected_photo_cap := 25;
    WHEN 'unlimited' THEN
      expected_guest_cap := 500;
      expected_photo_cap := 50;
    ELSE
      RAISE EXCEPTION 'invalid tier: %', NEW.tier;
  END CASE;

  IF TG_OP = 'UPDATE' AND NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'changing an event''s tier after creation is not supported';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Only one free-tier event per account, ever.
    IF NEW.tier = 'free' THEN
      IF EXISTS (
        SELECT 1 FROM public.events
        WHERE created_by = NEW.created_by
          AND tier = 'free'
      ) THEN
        RAISE EXCEPTION 'free_tier_limit_reached: only one free event is allowed per account';
      END IF;
    END IF;

    -- New events always start unpaid with the caps of their tier.
    NEW.guest_cap := expected_guest_cap;
    NEW.photo_cap_per_guest := expected_photo_cap;
    NEW.is_paid := FALSE;
    NEW.payment_status := CASE WHEN NEW.tier = 'free' THEN 'free' ELSE 'pending_payment' END;
    NEW.paid_at := NULL;
  ELSE
    -- UPDATE by a non-service role (rename, dates, ...): billing fields and
    -- caps cannot be changed by the client in either direction.
    NEW.guest_cap := OLD.guest_cap;
    NEW.photo_cap_per_guest := OLD.photo_cap_per_guest;
    NEW.is_paid := OLD.is_paid;
    NEW.payment_status := OLD.payment_status;
    NEW.paid_at := OLD.paid_at;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- VERIFY (read-only; run after applying). In a transaction that is rolled back,
-- a non-service update must keep a paid event paid:
--   begin;
--   select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
--   update public.events set name = name where id = '<a paid event id>';
--   select is_paid, payment_status from public.events where id = '<a paid event id>';  -- unchanged
--   rollback;
-- ----------------------------------------------------------------------------
