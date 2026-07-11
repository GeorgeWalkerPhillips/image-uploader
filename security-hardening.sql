-- Security hardening pass before real payments go live. See the security
-- review in conversation for full context. Three independent fixes:
--
-- 1. Billing integrity (events.tier/guest_cap/photo_cap_per_guest/is_paid/
--    payment_status/paid_at can currently be set to ANYTHING by the event's
--    own owner via a direct client call — e.g.
--    supabase.from('events').update({ is_paid: true, tier: 'unlimited' })
--    — completely bypassing Stripe. This also affects INSERT: a crafted
--    request could create an event already claiming "unlimited" caps with
--    payment_status left at pending. Fix: force these fields to the
--    server-side-known-correct values for the claimed tier on every
--    write, and only allow the trusted webhook (service_role) to flip
--    payment status to paid.
--
-- 2. Guest cap was only enforced in client JS (eventAccessService.js) —
--    trivially bypassed by calling the REST API directly. Now enforced
--    with a trigger, matching the existing photo_cap_per_guest pattern.
--
-- 3. Upload rate limiting was an in-memory client-side counter that resets
--    on page refresh. Now backstopped server-side too.
--
-- NOTE: the tier -> (guestCap, photoCap, amountCents) mapping below must
-- be kept in sync by hand with src/services/pricingTiers.js (client) and
-- the create-checkout-session Edge Function (server). There's no single
-- shared source of truth across JS and SQL — if you change pricing, update
-- all three.

CREATE OR REPLACE FUNCTION enforce_event_billing_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  expected_guest_cap INT;
  expected_photo_cap INT;
BEGIN
  -- The service role is used exclusively by the trusted Stripe webhook
  -- Edge Function (after verifying a real Stripe signature). It's the only
  -- caller allowed to freely set billing fields — e.g. to confirm payment.
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

  -- Caps always come from the server-side table above, never from
  -- whatever the client sent.
  NEW.guest_cap := expected_guest_cap;
  NEW.photo_cap_per_guest := expected_photo_cap;

  -- A non-service-role caller can never mark an event paid. Free events
  -- are simply never "paid"; paid-tier events start pending until the
  -- webhook confirms a real Stripe charge.
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

DROP TRIGGER IF EXISTS trg_enforce_event_billing_integrity ON events;
CREATE TRIGGER trg_enforce_event_billing_integrity
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_event_billing_integrity();

-- The client no longer has any legitimate reason to insert its own
-- "payment succeeded" record — only the webhook (service_role, which
-- bypasses RLS entirely) does that now. This policy let any client insert
-- an arbitrary amount/status with nothing to verify it against Stripe.
DROP POLICY IF EXISTS "Users can insert their own payments" ON payments;


-- 2. Guest cap, enforced server-side (mirrors photo_cap_per_guest below).
CREATE OR REPLACE FUNCTION enforce_guest_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cap INT;
  current_count INT;
  already_a_guest BOOLEAN;
BEGIN
  SELECT guest_cap INTO cap FROM events WHERE id = NEW.event_id;

  IF cap IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM event_access
      WHERE event_id = NEW.event_id
        AND user_id = NEW.user_id
        AND access_type = 'upload'
    ) INTO already_a_guest;

    IF NOT already_a_guest THEN
      SELECT COUNT(DISTINCT user_id) INTO current_count
      FROM event_access
      WHERE event_id = NEW.event_id
        AND access_type = 'upload';

      IF current_count >= cap THEN
        RAISE EXCEPTION 'guest_cap_reached: this event has reached its %-guest limit', cap;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_guest_cap ON event_access;
CREATE TRIGGER trg_enforce_guest_cap
  BEFORE INSERT ON event_access
  FOR EACH ROW
  WHEN (NEW.access_type = 'upload')
  EXECUTE FUNCTION enforce_guest_cap();


-- 3. Upload rate limit, enforced server-side (matches the client default
-- of 10/minute — REACT_APP_RATE_LIMIT_UPLOADS_PER_MINUTE only controls the
-- client-side UX message, this is the real backstop).
CREATE OR REPLACE FUNCTION enforce_upload_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM photos
  WHERE uploaded_by = NEW.uploaded_by
    AND uploaded_at > NOW() - INTERVAL '1 minute';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'rate_limit_exceeded: too many uploads in the last minute';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_upload_rate_limit ON photos;
CREATE TRIGGER trg_enforce_upload_rate_limit
  BEFORE INSERT ON photos
  FOR EACH ROW
  EXECUTE FUNCTION enforce_upload_rate_limit();
