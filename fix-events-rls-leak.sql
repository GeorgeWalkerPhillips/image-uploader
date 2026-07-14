-- CRITICAL SECURITY FIX
--
-- "Users can view public events" (supabase-schema.sql) was declared as
-- `FOR SELECT USING (TRUE)` — every authenticated (and anonymous) session
-- could read every row of the events table: every user's event names,
-- descriptions, dates, tier, and payment fields, not just their own.
-- Postgres OR's multiple permissive policies together, so the later,
-- properly-scoped "Users can manage their own events" policy
-- (pricing-tiers-migration.sql, `USING (auth.uid() = created_by)`) never
-- actually restricted anything for SELECT — this USING(TRUE) policy alone
-- was enough to expose every row regardless of the stricter one sitting
-- next to it.
--
-- This also explains how another user's photos became visible: once a
-- stranger's event showed up on your dashboard, its event_id was exposed
-- via the Gallery/Camera preview links. event_access's INSERT policy lets
-- anyone self-grant guest access to any event_id they know (by design —
-- that's what makes "scan a QR code, join instantly, no signup" work), so
-- simply opening a leaked event's camera/gallery page silently joined you
-- as a guest, which then legitimately granted photo access under the
-- existing (correctly-scoped) photos policy.
--
-- Fix: only the event's creator, or someone who already holds an
-- event_access row for that specific event, can SELECT it directly.
-- Guests who haven't joined yet (e.g. first load of the camera screen,
-- before their join request completes) get the event's name/photo cap/
-- guest cap through a narrow SECURITY DEFINER function instead of blanket
-- table access — the same pattern already used for get_event_guest_count.

DROP POLICY IF EXISTS "Users can view public events" ON events;

CREATE POLICY "Users can view their own or joined events" ON events
  FOR SELECT USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM event_access
      WHERE event_access.event_id = events.id
        AND event_access.user_id = auth.uid()
    )
  );

-- Exposes only the fields a guest legitimately needs to see before they've
-- joined: the event's display name, its guest cap (to check if it's full
-- before attempting to join), its per-guest photo cap, and the owner's id
-- (a bare UUID, not sensitive — Gallery.js uses it only to decide whether
-- the current viewer is the organizer).
CREATE OR REPLACE FUNCTION get_public_event_info(p_event_id UUID)
RETURNS TABLE (name TEXT, photo_cap_per_guest INT, guest_cap INT, created_by UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT name, photo_cap_per_guest, guest_cap, created_by
  FROM events
  WHERE id = p_event_id;
$$;

GRANT EXECUTE ON FUNCTION get_public_event_info(UUID) TO anon, authenticated;
