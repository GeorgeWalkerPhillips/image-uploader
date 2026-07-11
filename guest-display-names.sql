-- Lets guests enter a name when they join an event, so the gallery can be
-- organized into per-guest albums ("who uploaded what") instead of one
-- flat stream.
ALTER TABLE event_access ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Denormalized onto each photo at upload time (rather than joined from
-- event_access) so the gallery can group by name with a single query, and
-- so a photo's attribution stays fixed even if the guest later joins a
-- different event under a different name.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS uploader_name TEXT;

-- There was no UPDATE policy on event_access at all before this — a guest
-- could self-grant access (INSERT) but never update their own row
-- afterward, which is what setting a display name after the fact requires.
CREATE POLICY "Users can update their own event access" ON event_access
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
