-- Profile change requests — run once in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS profile_change_requests (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  login_id         TEXT NOT NULL,
  fname            TEXT,
  requested_changes JSONB NOT NULL,
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at     TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES users(id),
  reviewer_name    TEXT,
  notes            TEXT
);
