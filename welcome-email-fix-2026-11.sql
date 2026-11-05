-- ============================================================================
-- Welcome email: make it actually work (Nov 2026)
--
-- FOUND 2026-11-05: welcome emails were never sent. The send-welcome-email Edge
-- Function was never deployed and the Vault secrets that
-- welcome-email-trigger-migration.sql asks you to create ('welcome_email_url',
-- 'email_trigger_secret') did not exist, so every confirmation hit
-- "null value in column url of relation http_request_queue". The trigger's
-- exception handler swallowed it (sign-in was never blocked), so it failed
-- silently.
--
-- FIX: authenticate the call with the project's service role key, read from the
-- Vault secret 'service_role_key' that the cron jobs already use, instead of a
-- separate shared secret. No new secret to keep in sync; the Edge Function
-- (verify_jwt on) also compares the bearer to SUPABASE_SERVICE_ROLE_KEY.
--
-- ONE-TIME SETUP (run first; skip if the secret exists):
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-welcome-email',
--     'welcome_email_url');
--
-- Deploy the function: supabase functions deploy send-welcome-email
-- The existing trigger on_email_confirmed picks up the new function body.
-- 'email_trigger_secret' / EMAIL_TRIGGER_SECRET are no longer used.
-- Idempotent. Apply as one statement.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    -- Fires inside the UPDATE auth.users transaction GoTrue runs on sign-in. An
    -- unhandled exception would block login for everyone, so any failure is
    -- swallowed and logged. A welcome email must never be able to break auth.
    BEGIN
      PERFORM net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'welcome_email_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
        ),
        body := jsonb_build_object(
          'email', NEW.email,
          'full_name', NEW.raw_user_meta_data->>'full_name'
        ),
        timeout_milliseconds := 10000
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_email_confirmed: failed to send welcome email: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
