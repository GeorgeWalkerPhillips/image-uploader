-- 1. Data backfill: events created before photo-cap-per-guest.sql /
--    security-hardening.sql existed have a NULL photo_cap_per_guest (and
--    possibly a stale guest_cap), which the app displays as "Unlimited" —
--    wrong for anything that isn't actually the Unlimited tier. This
--    corrects existing rows; new events are already correct via the
--    enforce_event_billing_integrity trigger.
UPDATE events SET guest_cap = 10, photo_cap_per_guest = 15 WHERE tier = 'free';
UPDATE events SET guest_cap = 25, photo_cap_per_guest = 25 WHERE tier = 'starter';
UPDATE events SET guest_cap = 100, photo_cap_per_guest = 40 WHERE tier = 'growth';
-- unlimited tier is already supposed to be NULL/NULL — nothing to fix there.

-- 2. Only one free-tier event per account, ever (previously the free tier
-- was unlimited-events-but-capped-guests; this adds an explicit
-- one-time-only limit on top, enforced server-side so it can't be
-- bypassed by calling the REST API directly). Re-declares the same
-- trigger function from security-hardening.sql with one addition — the
-- existing trigger automatically picks up the new function body, no need
-- to recreate the CREATE TRIGGER statement itself.
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
      expected_guest_cap := 10;
      expected_photo_cap := 15;
    WHEN 'starter' THEN
      expected_guest_cap := 25;
      expected_photo_cap := 25;
    WHEN 'growth' THEN
      expected_guest_cap := 100;
      expected_photo_cap := 40;
    WHEN 'unlimited' THEN
      expected_guest_cap := NULL;
      expected_photo_cap := NULL;
    ELSE
      RAISE EXCEPTION 'invalid tier: %', NEW.tier;
  END CASE;

  IF TG_OP = 'UPDATE' AND NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'changing an event''s tier after creation is not supported';
  END IF;

  -- NEW: only one free-tier event per account, ever. Checked on INSERT
  -- only — tier changes after creation are already blocked above.
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
