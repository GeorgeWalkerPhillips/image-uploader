-- Google Sign-In support.
-- Run this in the Supabase SQL Editor after pricing-tiers-migration.sql has
-- already been applied. Also requires enabling the Google provider under
-- Authentication -> Providers in the dashboard (see SUPABASE_SETUP.md).

-- Email/password signUp previously inserted its own user_profiles row from
-- the client (see pricing-tiers-migration.sql's "Users can insert own
-- profile" policy). Google sign-in never runs that client code path — the
-- user lands back on the app already authenticated — so without this
-- trigger every Google sign-in would produce an orphaned auth user with no
-- matching user_profiles row. A DB trigger covers both paths uniformly and
-- replaces the client-side insert, so a race between the trigger and a
-- client insert can't produce a duplicate-key error.
-- IMPORTANT: this project also uses Supabase anonymous auth for guest
-- uploads (signInAsGuest() in AuthContext.js) — those auth.users rows have
-- NEW.email = NULL. user_profiles.email is NOT NULL, so without the guard
-- below this trigger's INSERT fails on every anonymous sign-in, and since
-- a trigger's exception aborts the entire triggering transaction, that
-- takes the guest's auth.users insert down with it — i.e. this would
-- silently break guest QR-code joining app-wide. The WHEN clause on the
-- trigger (not just an IF inside the function) skips the function
-- entirely for anonymous sign-ins, which is clearer than a null check.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name, avatar_url, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (NEW.email IS NOT NULL)
  EXECUTE FUNCTION handle_new_user();
