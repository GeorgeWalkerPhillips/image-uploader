-- Users table (extends Supabase auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE
);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT NOT NULL,
  mime_type TEXT NOT NULL,
  width INT,
  height INT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event access (who can upload to which events)
CREATE TABLE IF NOT EXISTS event_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_type TEXT CHECK (access_type IN ('upload', 'view', 'admin')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(event_id, user_id, access_type)
);

-- Audit logs for security
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own profile
CREATE POLICY "Users can see own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policy: Events - admins can do everything, others can only view
CREATE POLICY "Admins can manage all events" ON events
  FOR ALL USING (
    (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = TRUE
  );

CREATE POLICY "Users can view public events" ON events
  FOR SELECT USING (TRUE);

-- RLS Policy: Photos - users can upload to events they have access to
CREATE POLICY "Users can upload photos to accessible events" ON photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_access
      WHERE event_id = photos.event_id
        AND user_id = auth.uid()
        AND access_type IN ('upload', 'admin')
    )
  );

CREATE POLICY "Users can view photos from events" ON photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_access
      WHERE event_id = photos.event_id
        AND user_id = auth.uid()
    )
  );

-- RLS Policy: Audit logs - only admins can see
CREATE POLICY "Only admins can view audit logs" ON audit_logs
  FOR SELECT USING (
    (SELECT is_admin FROM user_profiles WHERE id = auth.uid()) = TRUE
  );

-- Create indexes for performance
CREATE INDEX idx_photos_event_id ON photos(event_id);
CREATE INDEX idx_photos_uploaded_by ON photos(uploaded_by);
CREATE INDEX idx_event_access_user_id ON event_access(user_id);
CREATE INDEX idx_event_access_event_id ON event_access(event_id);
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
