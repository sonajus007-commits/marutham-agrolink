-- Add subscription_plan to users — run once in Supabase SQL Editor
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT
    CHECK (subscription_plan IS NULL OR subscription_plan IN ('Monthly','Quarterly','Half Yearly','Yearly'));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_charge INTEGER DEFAULT 0;
