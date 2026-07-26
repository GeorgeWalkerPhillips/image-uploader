-- Two changes prompted by comparing this app's one-time-per-event pricing
-- against Supabase's real monthly storage/egress costs:
--
-- 1. The "unlimited" tier had NULL guest_cap/photo_cap_per_guest — a
--    single very large event could cost far more in ongoing storage than
--    its one-time fee ever recovers. It's renamed "Pro" in the UI
--    (src/services/pricingTiers.js) and now capped at 500 guests / 50
--    photos each — generous enough for virtually every real event while
--    bounding the worst case. The DB key stays `unlimited` (renaming it
--    would require a data migration and touch every CASE statement that
--    references the string) — only the caps and the mirrored Paystack
--    Edge Function amounts/config change.
--
-- 2. Archived event photos (purge-expired-events, in
--    event-archive-and-emails.sql) were never actually deleted — only the
--    7-day emailed download link expired, so every event ever sold added
--    a permanent slice to the monthly storage bill. This adds a tracking
--    column so a second pass in purge-expired-events can hard-delete the
--    archive zip itself 90 days after it was created, bounding total
--    storage to a roughly steady-state amount instead of one that grows
--    forever with all-time event volume.

-- 1. Cap the "unlimited" tier at 500 guests / 50 photos per guest.
-- Re-declares the same trigger function from security-hardening.sql /
-- free-tier-event-limit.sql with one changed branch — the existing
-- trigger automatically picks up the new function body.
--
-- NOTE: this only affects events created/updated from now on (the
-- trigger fires on INSERT/UPDATE). Any already-paid "unlimited" event
-- keeps its current NULL/NULL (truly uncapped) guest_cap/
-- photo_cap_per_guest untouched — decide by hand whether to backfill
-- those manually if you have any live ones you'd want capped too:
--   UPDATE events SET guest_cap = 500, photo_cap_per_guest = 50
--   WHERE tier = 'unlimited' AND guest_cap IS NULL;
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
      expected_guest_cap := 500;
      expected_photo_cap := 50;
    ELSE
      RAISE EXCEPTION 'invalid tier: %', NEW.tier;
  END CASE;

  IF TG_OP = 'UPDATE' AND NEW.tier IS DISTINCT FROM OLD.tier THEN
    RAISE EXCEPTION 'changing an event''s tier after creation is not supported';
  END IF;

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

-- 2. Track when an event's archive zip itself gets permanently deleted,
-- separately from photos_purged_at (when the *original* photos were
-- removed and the archive was first created).
ALTER TABLE events ADD COLUMN IF NOT EXISTS archive_purged_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_events_archive_unpurged
  ON events(photos_purged_at) WHERE photos_purged_at IS NOT NULL AND archive_purged_at IS NULL;
