-- ============================================================
-- STAGE 4: Seller Registration Approval Workflow
-- Run AFTER migration_stage1_seller.sql
-- ============================================================
-- Adds an approval lifecycle to farmer/retailer accounts:
--   pending_review → payment_pending → active
--                  ↘ rejected
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'active'
    CHECK (approval_status IN ('pending_review', 'payment_pending', 'active', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by        UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason   TEXT,
  ADD COLUMN IF NOT EXISTS subscription_amount INTEGER DEFAULT 0,   -- paise
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_reference  TEXT UNIQUE,          -- e.g. PAY-ABCD1234
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;

-- All existing farmers/retailers are grandfathered in as active
UPDATE users SET approval_status = 'active' WHERE role = 'farmer';

CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);

-- ============================================================
-- HOW TO USE:
-- 1. Run in Supabase SQL Editor.
-- 2. New farmer/retailer registrations will have approval_status='pending_review'.
-- 3. Admin reviews → approves (triggers payment email) or rejects.
-- 4. Once payment confirmed by admin → approval_status='active'.
-- ============================================================
