-- Closes a real gap found by testing: creating a paid-tier event and then
-- cancelling at Paystack's checkout still leaves the event fully usable —
-- guests can join and upload — because `enforce_event_billing_integrity()`
-- (security-hardening.sql / free-tier-event-limit.sql) already assigns the
-- FULL guest_cap/photo_cap_per_guest for the tier on INSERT, and nothing
-- downstream (RLS, the get_public_event_info RPC, or any trigger) ever
-- checks is_paid/payment_status. This file adds the missing checks at the
-- same layer as every other billing rule in this app: DB triggers, not
-- just client-side code (which any guest could bypass by calling the
-- Supabase REST API directly).
--
-- Free-tier events (payment_status = 'free') are never gated — they don't
-- require payment. An event's own creator is exempted from the gate (so
-- they can preview/test their own event before paying) — the dashboard's
-- "Preview" button reuses the organizer's already-authenticated session
-- rather than creating a new anonymous guest identity (see
-- AuthContext.signInAsGuest), so `created_by = auth.uid()` reliably
-- identifies that case.

-- 1. Extend enforce_guest_cap() (event_access, BEFORE INSERT WHEN
-- access_type = 'upload') to reject new guests on an unpaid paid-tier
-- event, before the existing guest-cap check. This is the primary gate —
-- it stops a guest from ever getting an event_access row on an unpaid
-- event, which transitively blocks uploads too (the photos INSERT policy
-- requires an event_access row).
--
-- IMPORTANT: the already_a_guest check must run FIRST and gate both the
-- payment check and the cap check below it. grantEventAccess()
-- (eventAccessService.js) unconditionally re-upserts every time a guest
-- reopens the camera page, including returning guests who already have
-- access — relying on `ON CONFLICT ... DO NOTHING` to no-op. Postgres
-- fires BEFORE INSERT row triggers before it resolves ON CONFLICT, so
-- without this guard, a RAISE EXCEPTION here would break that no-op
-- upsert (and lock out a legitimately-already-joined guest) the moment an
-- event happens to be unpaid or at its cap — even though nothing is
-- actually being newly inserted for them.
CREATE OR REPLACE FUNCTION enforce_guest_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev RECORD;
  current_count INT;
  already_a_guest BOOLEAN;
BEGIN
  SELECT guest_cap, tier, is_paid, created_by INTO ev FROM events WHERE id = NEW.event_id;

  SELECT EXISTS (
    SELECT 1 FROM event_access
    WHERE event_id = NEW.event_id
      AND user_id = NEW.user_id
      AND access_type = 'upload'
  ) INTO already_a_guest;

  IF NOT already_a_guest THEN
    IF ev.tier IS DISTINCT FROM 'free' AND NOT ev.is_paid AND NEW.user_id IS DISTINCT FROM ev.created_by THEN
      RAISE EXCEPTION 'payment_required: this event''s payment has not been completed yet';
    END IF;

    IF ev.guest_cap IS NOT NULL THEN
      SELECT COUNT(DISTINCT user_id) INTO current_count
      FROM event_access
      WHERE event_id = NEW.event_id
        AND access_type = 'upload';

      IF current_count >= ev.guest_cap THEN
        RAISE EXCEPTION 'guest_cap_reached: this event has reached its %-guest limit', ev.guest_cap;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- Trigger itself is unchanged (already exists from security-hardening.sql)
-- — CREATE OR REPLACE FUNCTION above is picked up automatically.

-- 2. Defense-in-depth: same check directly on photos INSERT. Matters for
-- guests who already got an event_access row on an unpaid event *before*
-- this fix was applied — they must still be blocked from uploading
-- *after* it's applied, with no retroactive cleanup needed.
CREATE OR REPLACE FUNCTION enforce_event_paid_for_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev RECORD;
BEGIN
  SELECT tier, is_paid, created_by INTO ev FROM events WHERE id = NEW.event_id;

  IF ev.tier IS DISTINCT FROM 'free' AND NOT ev.is_paid AND NEW.uploaded_by IS DISTINCT FROM ev.created_by THEN
    RAISE EXCEPTION 'payment_required: this event''s payment has not been completed yet';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_paid_for_upload ON photos;
CREATE TRIGGER trg_enforce_event_paid_for_upload
  BEFORE INSERT ON photos
  FOR EACH ROW
  EXECUTE FUNCTION enforce_event_paid_for_upload();

-- 3. get_public_event_info() (fix-events-rls-leak.sql) needs to expose
-- is_paid/payment_status so the client can show a friendly "this event
-- isn't ready yet" message before attempting to join, instead of
-- surfacing the raw trigger exception above. Return type is changing, so
-- CREATE OR REPLACE isn't enough — drop and recreate.
DROP FUNCTION IF EXISTS get_public_event_info(UUID);

CREATE FUNCTION get_public_event_info(p_event_id UUID)
RETURNS TABLE (
  name TEXT,
  photo_cap_per_guest INT,
  guest_cap INT,
  created_by UUID,
  is_paid BOOLEAN,
  payment_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name, photo_cap_per_guest, guest_cap, created_by, is_paid, payment_status
  FROM events
  WHERE id = p_event_id;
$$;

GRANT EXECUTE ON FUNCTION get_public_event_info(UUID) TO anon, authenticated;
