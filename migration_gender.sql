-- ============================================================
-- Gender field + Women/Transgender Empowerment concession
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20)
    CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Transgender'));
