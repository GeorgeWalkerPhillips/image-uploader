-- Critical error logging: every RLS rejection, failed upload, join
-- failure, or uncaught crash gets written here automatically, from any
-- session (including anonymous guests), so you can see exactly what went
-- wrong without needing a phone plugged into DevTools.
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('warning', 'error', 'critical')),
  source TEXT NOT NULL, -- which function/component logged this, e.g. 'uploadImage'
  message TEXT NOT NULL,
  context JSONB, -- structured extra detail: Postgres error code/details/hint, ids involved, etc.
  url TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Anyone — including anonymous guests — can write an error log. Errors can
-- happen before any "real" identity exists, and we want to capture those
-- too, not just organizer-side failures.
CREATE POLICY "Anyone can insert error logs" ON error_logs
  FOR INSERT WITH CHECK (true);

-- No client-side SELECT policy on purpose: this table can contain
-- sensitive debugging detail (ids, request context), so it's viewable only
-- via the Supabase dashboard (Table Editor / SQL Editor) using your own
-- project-owner access, which bypasses RLS entirely — never through the
-- app's anon key.

CREATE INDEX idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_event_id ON error_logs(event_id);
CREATE INDEX idx_error_logs_user_id ON error_logs(user_id);

-- Handy query for checking recent errors, e.g. after reproducing a bug:
--   SELECT created_at, severity, source, message, context
--   FROM error_logs
--   ORDER BY created_at DESC
--   LIMIT 20;
