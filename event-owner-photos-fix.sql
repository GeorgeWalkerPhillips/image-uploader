-- Event creators previously had no way to see or manage their own event's
-- photos unless they separately joined it as a guest (which nobody does
-- for their own event). RLS silently filtered out every photo, so the
-- Gallery view and the admin "Download ZIP" button both showed empty for
-- organizers even when guests had successfully uploaded plenty.
--
-- This grants the event's creator full access to that event's photos
-- (view, upload, delete) directly via events.created_by — no event_access
-- row needed, and it applies retroactively to events created before this
-- fix.
CREATE POLICY "Event creators can manage their own event's photos" ON photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = photos.event_id
        AND events.created_by = auth.uid()
    )
  );
