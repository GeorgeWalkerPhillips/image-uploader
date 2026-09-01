-- Pricing rework (Sept 2026). Tier *keys* are unchanged
-- (free/starter/growth/unlimited) — only the guest/photo caps and the
-- charge amounts move, plus the display names in the client
-- (Taster / Gathering / Big Day / The Whole Reel). Keep this in sync with
-- src/services/pricingTiers.js, supabase/functions/paystack-initialize
-- and supabase/functions/paystack-webhook.
--
--   key        name             guest cap   photos/guest   amount
--   free       Taster           5           5              R0
--   starter    Gathering        25          15             R179
--   growth     Big Day          50          25             R399
--   unlimited  The Whole Reel   500         50             R999
--
-- The "unlimited" key is a historical name — the tier is capped at
-- 500/50 (same intent as pro-tier-cap-and-retention-limit.sql, which this
-- file supersedes for the caps). Run this LAST, after every other numbered
-- file, so its enforce_event_billing_integrity() is the one that sticks.

-- 1. Re-declare the billing-integrity trigger function with the new caps.
--    Same body as free-tier-event-limit.sql / pro-tier-cap-and-retention-
--    limit.sql (including the one-free-event-per-account rule) with only
--    the CASE values changed. The existing trigger picks up the new
--    function body automatically.
CREATE OR REPLACE FUNCTION enforce_event_billing_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  expected_guest_cap INT;
  expected_photo_cap INT;
BEGIN
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

  -- Only one free-tier event per account, ever (INSERT only).
  IF TG_OP = 'INSERT' AND NEW.tier = 'free' THEN
    IF EXISTS (
      SELECT 1 FROM events
      WHERE created_by = NEW.created_by
        AND tier = 'free'
    ) THEN
      RAISE EXCEPTION 'free_tier_limit_reached: only one free event is allowed per account';
    END IF;
  END IF;

  NEW.guest_cap := expected_guest_cap;
  NEW.photo_cap_per_guest := expected_photo_cap;

  IF NEW.tier = 'free' THEN
    NEW.is_paid := FALSE;
    NEW.payment_status := 'free';
    NEW.paid_at := NULL;
  ELSE
    NEW.is_paid := FALSE;
    NEW.payment_status := 'pending_payment';
    NEW.paid_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Backfill existing events to the new caps (mirrors the straight
--    UPDATEs in free-tier-event-limit.sql). NOTE: this retroactively
--    lowers the Growth guest cap (100 -> 50), the Starter/Growth photo
--    caps, and pins any previously-uncapped "unlimited" event to 500/50.
--    That's intended here because the app is pre-launch with no real
--    paying customers; if that changes, scope these to
--    `WHERE created_at > '<cutoff>'` or drop the lines that lower a
--    sold allowance.
UPDATE events SET guest_cap = 5,   photo_cap_per_guest = 5  WHERE tier = 'free';
UPDATE events SET guest_cap = 25,  photo_cap_per_guest = 15 WHERE tier = 'starter';
UPDATE events SET guest_cap = 50,  photo_cap_per_guest = 25 WHERE tier = 'growth';
UPDATE events SET guest_cap = 500, photo_cap_per_guest = 50 WHERE tier = 'unlimited';
