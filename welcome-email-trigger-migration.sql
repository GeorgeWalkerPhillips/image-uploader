-- Sends a welcome email the moment a user's email gets confirmed, by
-- calling the send-welcome-email Edge Function via pg_net. Run this in the
-- Supabase SQL Editor after google-oauth-profile-trigger.sql has already
-- been applied. See EMAIL_SETUP.md for the Resend account setup and Edge
-- Function deploy this depends on.
--
-- Runs server-side (not from client code) so it fires exactly once
-- regardless of which client (web, future mobile, etc.) completed the
-- confirmation, and can't be skipped by closing the tab mid-signup.
--
-- This trigger is additive alongside on_auth_user_created/handle_new_user
-- from google-oauth-profile-trigger.sql — different function and trigger
-- names, so it doesn't touch that trigger's guest-signup guard.
--
-- pg_net's http_post needs the function URL and a shared secret to
-- authenticate the call (this Edge Function isn't behind a user JWT — it's
-- called by Postgres, not a signed-in browser), stored in Supabase Vault
-- instead of pasted here in plaintext since this file is committed to
-- source control — same reasoning as event-archive-and-emails.sql.
--
-- ONE-TIME SETUP — replace the placeholders and run these two selects
-- FIRST, before the trigger below (generate a random string of your choice
-- for the secret, e.g. `openssl rand -hex 32`):
--
--   select vault.create_secret('https://<your-project-ref>.supabase.co/functions/v1/send-welcome-email', 'welcome_email_url');
--   select vault.create_secret('<your-random-secret>', 'email_trigger_secret');
--
-- Then set the same secret value as the send-welcome-email Edge Function's
-- EMAIL_TRIGGER_SECRET secret (Dashboard -> Edge Functions -> Secrets, or
-- `supabase secrets set EMAIL_TRIGGER_SECRET=<your-random-secret>`) so the
-- function can verify the call actually came from this trigger.
--
-- If you ever rotate the secret, update both places:
--   select vault.update_secret(id, '<new-secret>')
--   from vault.secrets where name = 'email_trigger_secret';

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION handle_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    PERFORM net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'welcome_email_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-email-trigger-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_trigger_secret')
      ),
      body := jsonb_build_object(
        'email', NEW.email,
        'full_name', NEW.raw_user_meta_data->>'full_name'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;
CREATE TRIGGER on_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_email_confirmed();

-- Verify it's wired up after a real signup + confirmation:
--   select id, email, email_confirmed_at from auth.users order by created_at desc limit 5;
-- Check error_logs / Edge Function logs if the email doesn't arrive.
