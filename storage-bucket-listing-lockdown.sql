-- SUPABASE_SETUP.md Step 5 previously had you create a storage.objects
-- SELECT ("Download") policy on the event-photos bucket that was just:
--
--   (bucket_id = 'event-photos')
--
-- with no auth.uid() check at all. That same policy governs `.list()`, not
-- just single-object downloads — so any anon or authenticated session
-- (i.e. anyone holding the public anon key, which is embedded in every
-- deployed frontend by design) could enumerate the *entire* contents of
-- the bucket across every event, not just fetch a photo whose exact path
-- they already knew. Individual photo links looked and worked totally
-- normally the whole time, which is exactly why this class of bug is easy
-- to ship without noticing.
--
-- Photos are still served via getPublicUrl() (uploadService.js) — the
-- bucket keeps its "public" flag, and Supabase serves a public bucket's
-- object bytes for a known path without consulting storage.objects RLS at
-- all, so direct photo display is unaffected. Only `.list()` and any
-- authenticated `.download()` call go through RLS, and this policy scopes
-- those down to the same "owns the event, or has already joined it as a
-- guest" rule the `photos` table itself already uses (see
-- event-owner-photos-fix.sql / supabase-schema.sql).
--
-- IMPORTANT — manual step required first: if you created the Step 5
-- policies through the Storage dashboard UI (as the old instructions
-- said), Postgres will OR that policy together with the one below and the
-- leak will persist. Go to Storage -> event-photos -> Policies and DELETE
-- the existing "Download"/SELECT policy before running this file. The
-- upload/INSERT policy from Step 5 is fine as-is and doesn't need to
-- change (recreated below only for a single source of truth going
-- forward).

DROP POLICY IF EXISTS "Give users authenticated access" ON storage.objects;

CREATE POLICY "Only event owners or guests can list event-photos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'event-photos'
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id::text = (storage.foldername(name))[1]
        AND (
          events.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM event_access
            WHERE event_access.event_id = events.id
              AND event_access.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Authenticated users can upload to event-photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'event-photos'
    AND auth.role() = 'authenticated'
  );
