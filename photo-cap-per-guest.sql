-- Per-guest photo quota, matching how competitors like POV Camera give
-- each guest a limited number of "shots" on the free/lower tiers (the
-- disposable-camera scarcity mechanic). NULL = unlimited.
ALTER TABLE events ADD COLUMN IF NOT EXISTS photo_cap_per_guest INT;

-- This is enforced with a trigger, not just client-side, because tier
-- limits are the actual monetization mechanism — a client-only check can
-- be bypassed by anyone calling the REST API directly with dev tools.
CREATE OR REPLACE FUNCTION enforce_photo_cap_per_guest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap INT;
  current_count INT;
BEGIN
  SELECT photo_cap_per_guest INTO cap FROM events WHERE id = NEW.event_id;

  IF cap IS NOT NULL THEN
    SELECT COUNT(*) INTO current_count
    FROM photos
    WHERE event_id = NEW.event_id
      AND uploaded_by = NEW.uploaded_by;

    IF current_count >= cap THEN
      RAISE EXCEPTION 'photo_cap_reached: this guest has reached the %-photo limit for this event', cap;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_photo_cap_per_guest ON photos;
CREATE TRIGGER trg_enforce_photo_cap_per_guest
  BEFORE INSERT ON photos
  FOR EACH ROW
  EXECUTE FUNCTION enforce_photo_cap_per_guest();
