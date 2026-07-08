-- Self-serve accounts + competitive guest-count-based pricing tiers.
-- Run this in the Supabase SQL Editor after supabase-schema.sql and
-- payment-schema.sql have already been applied.

-- 1. Self-serve profiles: previously nothing let a new signup insert their
--    own profile row, so every signup silently produced an orphaned auth
--    user with no matching user_profiles row.
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Self-serve events: previously only a manually is_admin-flagged user
--    could create an event at all. Any signed-up (non-anonymous) user can
--    now create and manage their own events.
CREATE POLICY "Users can manage their own events" ON events
  FOR ALL USING (auth.uid() = created_by)
  WITH CHECK (
    auth.uid() = created_by
    AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- 3. Tiered pricing: events are priced by guest count, matching how
--    competitors like POV price (free under 10 guests, then flat per-event
--    fees that scale with guest count). guest_cap = NULL means unlimited.
ALTER TABLE events ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE events ADD COLUMN IF NOT EXISTS guest_cap INT;

-- 4. Guest-count lookup: guests need to know if an event is full before
--    joining, but RLS only lets a user see their own event_access row.
--    SECURITY DEFINER exposes just the count, not other guests' identities.
CREATE OR REPLACE FUNCTION get_event_guest_count(p_event_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT user_id)::INT
  FROM event_access
  WHERE event_id = p_event_id
    AND access_type = 'upload';
$$;

GRANT EXECUTE ON FUNCTION get_event_guest_count(UUID) TO anon, authenticated;

-- 5. Payments: the client records its own payment after returning from
--    Stripe Checkout (see PAYMENT_SETUP.md for the more secure
--    webhook-based alternative). There was no INSERT policy at all before.
CREATE POLICY "Users can insert their own payments" ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
