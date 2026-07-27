-- Bug: users click the "confirm your email" link, get redirected back to
-- the app looking successful, but signing in afterward still fails with
-- "please confirm your email" — because email_confirmed_at never actually
-- got saved.
--
-- Root cause: welcome-email-trigger-migration.sql's handle_email_confirmed()
-- runs as an AFTER UPDATE trigger directly on auth.users. Triggers execute
-- inside the SAME transaction as the row change that fired them — that
-- transaction is Supabase Auth's own confirmation endpoint doing
-- `UPDATE auth.users SET email_confirmed_at = now() ...` when the link is
-- clicked. The trigger body called net.http_post() with no exception
-- handling at all. If that call raised anything — the 'welcome_email_url'/
-- 'email_trigger_secret' Vault secrets were never created (a manual
-- one-time setup step, easy to skip), a typo in either secret, pg_net not
-- behaving as expected, whatever — the exception propagated out of the
-- trigger and rolled back the *entire* transaction, taking the
-- email_confirmed_at write down with it. The browser still lands on the
-- redirect page looking like success (Supabase Auth's HTTP response to the
-- confirmation link doesn't reflect a trigger failure it doesn't know
-- about), so nothing user-visible looked wrong until the next login.
--
-- This is exactly the failure mode every other side-effect in this app
-- explicitly guards against — paystack-webhook's own comment says it
-- outright: "Never fail the webhook response over an email hiccup". This
-- trigger just never got the same treatment. Fix: wrap the HTTP call in
-- its own exception handler so a welcome-email failure can never again
-- take the actual confirmation down with it.

CREATE OR REPLACE FUNCTION handle_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      -- Never let a welcome-email hiccup roll back the email confirmation
      -- this trigger fires on. Logged to error_logs (this app's existing
      -- diagnostic table) so a missing/misnamed Vault secret is easy to
      -- spot — but that insert is itself guarded, so even a failure to log
      -- (e.g. error_logs not yet applied) can't cascade back into rolling
      -- back the confirmation either.
      BEGIN
        INSERT INTO error_logs (user_id, severity, source, message)
        VALUES (NEW.id, 'error', 'handle_email_confirmed', SQLERRM);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_email_confirmed: welcome email dispatch failed for % (%), and error_logs insert also failed', NEW.email, SQLERRM;
      END;
    END;
  END IF;
  RETURN NEW;
END;
$$;
-- Trigger itself (on_email_confirmed) is unchanged — CREATE OR REPLACE
-- FUNCTION above is picked up automatically.

-- One-time recovery for accounts already stuck by this bug: anyone who
-- clicked their confirmation link before this fix was applied has a
-- confirmation email that has already been consumed (Supabase invalidates
-- the token after first use), so they can't just click it again. Two
-- options, pick whichever fits:
--
-- 1. If you can identify the affected user(s) and are confident they
--    really did click a real confirmation link (e.g. they're telling you
--    this happened), confirm them directly:
--      UPDATE auth.users SET email_confirmed_at = NOW()
--      WHERE email = 'the-users-email@example.com' AND email_confirmed_at IS NULL;
--
-- 2. Otherwise, have them use the "Resend confirmation" link on the login
--    page (already wired up client-side — Login.js / AuthContext.js
--    resendConfirmationEmail) to get a fresh, valid confirmation link now
--    that the trigger won't undo it.
