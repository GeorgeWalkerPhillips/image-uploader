-- Security audit fixes, October 2026. Apply by hand in the Supabase SQL
-- Editor AFTER every file listed before it in SUPABASE_SETUP.md. Idempotent.
-- Findings fixed (numbering matches the audit report):
--
--  1. user_profiles: any user could set their own is_admin = true (UPDATE
--     policy had no column restriction; INSERT policy likewise), which
--     unlocks the "Admins can manage all events" ALL policy and the audit
--     log. A trigger now pins is_admin for API callers (anon/authenticated).
--     Promote admins from the SQL Editor (runs as postgres, not restricted).
--  2. event-photos storage: a public SELECT policy let anyone list every
--     event's photos. Replaced with the owner/guest-scoped policy that
--     storage-bucket-listing-lockdown.sql intended. Public-URL image serving
--     (getPublicUrl) does not use this policy and is unaffected.
--  3. event-photos storage: INSERT only checked bucket_id. Now the first
--     path segment must be an event the caller owns or has upload access to;
--     the bucket also gets a size limit and MIME allowlist (mirrors the
--     client defaults in .env.example / imageValidation.js).
--  4. event_access: a user could self-insert any access_type, and the UPDATE
--     policy let them repoint a row at another event (skipping the INSERT-only
--     guest-cap trigger). Self-grant is now 'upload' only and the identity
--     columns are immutable for API callers.
--  5. events: drop the leftover "Paid events are visible, free events to
--     creator only" policy (paid-events-rls-leak-fix.sql evidently did not
--     drop it on the live project), which exposed every paid event row.
--  6. error_logs: "Anyone can insert error logs" was WITH CHECK (true).
--     Now attributable (user_id null or own) and size-bounded.
--  9. enforce_event_billing_integrity: pin search_path.
-- 10. Revoke EXECUTE on trigger/helper SECURITY DEFINER functions from the
--     API roles. get_public_event_info / get_event_guest_count and the
--     wedding_* RPCs the app calls are intentionally left alone.
--
-- Not fixed here (dashboard/other): enable leaked-password protection in
-- Auth settings; move pg_net out of public; npm dependency upgrades.

BEGIN;

-- 1. is_admin cannot be changed through the API -----------------------------
CREATE OR REPLACE FUNCTION protect_profile_admin_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- API traffic arrives as anon/authenticated. The SQL Editor (postgres) and
  -- the service role are unrestricted, so admins can still be promoted there.
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_admin := FALSE;
    ELSE
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_flag ON user_profiles;
CREATE TRIGGER trg_protect_profile_admin_flag
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profile_admin_flag();

-- 2 + 3. event-photos storage policies --------------------------------------
DROP POLICY IF EXISTS "Allow public downloads 1rdror8_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads 1rdror8_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access" ON storage.objects;
DROP POLICY IF EXISTS "Only event owners or guests can list event-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to event-photos" ON storage.objects;
DROP POLICY IF EXISTS "Event owners or guests can upload to event-photos" ON storage.objects;

CREATE POLICY "Only event owners or guests can list event-photos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'event-photos'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.event_access a
            WHERE a.event_id = e.id AND a.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Event owners or guests can upload to event-photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'event-photos'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id::text = (storage.foldername(name))[1]
        AND (
          e.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.event_access a
            WHERE a.event_id = e.id
              AND a.user_id = auth.uid()
              AND a.access_type IN ('upload', 'admin')
          )
        )
    )
  );

UPDATE storage.buckets
SET file_size_limit = 31457280,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
WHERE id = 'event-photos';

-- 4. event_access: self-grant is upload-only; identity columns immutable ----
DROP POLICY IF EXISTS "Users can grant themselves event access" ON event_access;
CREATE POLICY "Users can grant themselves event access" ON event_access
  FOR INSERT WITH CHECK (auth.uid() = user_id AND access_type = 'upload');

CREATE OR REPLACE FUNCTION protect_event_access_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.event_id := OLD.event_id;
    NEW.user_id := OLD.user_id;
    NEW.access_type := OLD.access_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_event_access_identity ON event_access;
CREATE TRIGGER trg_protect_event_access_identity
  BEFORE UPDATE ON event_access
  FOR EACH ROW
  EXECUTE FUNCTION protect_event_access_identity();

-- 5. events: remove the leaking leftover policy -----------------------------
DROP POLICY IF EXISTS "Paid events are visible, free events to creator only" ON events;
DROP POLICY IF EXISTS "Users can view public events" ON events;

-- 6. error_logs: attributable and bounded -----------------------------------
DROP POLICY IF EXISTS "Anyone can insert error logs" ON error_logs;
CREATE POLICY "Clients can insert bounded error logs" ON error_logs
  FOR INSERT WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND char_length(source) <= 200
    AND char_length(message) <= 2000
    AND (url IS NULL OR char_length(url) <= 2000)
    AND (user_agent IS NULL OR char_length(user_agent) <= 500)
    AND (context IS NULL OR pg_column_size(context) <= 8000)
  );

-- 9. pin search_path on the billing trigger ---------------------------------
ALTER FUNCTION enforce_event_billing_integrity() SET search_path = public;

-- 10. API roles must not call internal SECURITY DEFINER functions -----------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'enforce_event_paid_for_upload()',
    'enforce_guest_cap()',
    'enforce_photo_cap_per_guest()',
    'enforce_upload_rate_limit()',
    'handle_email_confirmed()',
    'handle_new_user()',
    'rls_auto_enable()'
  ] LOOP
    IF to_regprocedure('public.' || fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verify after applying (should all hold):
--   -- as an authenticated API user:  UPDATE user_profiles SET is_admin = true WHERE id = auth.uid();
--   --   then SELECT is_admin ...  -> still false
--   -- anon key:  supabase.storage.from('event-photos').list('<other event id>') -> empty / error
--   -- guest:     upload to '<unjoined event id>/x.jpg' -> RLS violation
--   -- guest:     insert event_access with access_type 'admin' -> RLS violation
