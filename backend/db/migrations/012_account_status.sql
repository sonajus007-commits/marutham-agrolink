-- ============================================================
-- ACCOUNT STATUS + SUBSCRIPTION SELF-PAYMENT WORKFLOW
-- Run in Supabase SQL Editor AFTER migration_stage4_approval.sql
-- ============================================================
-- Introduces the admin-controllable account status:
--   active  – full access
--   suspended – can log in, but restricted to the subscription
--               payment screen until they pay (initial or renewal)
--   blocked – cannot log in at all ("contact Admin to unblock")
--
-- Access lifecycle for sellers (farmer/retailer):
--   register  → approval_status='pending_review'  (login blocked)
--   approve   → approval_status='approved', status='suspended'
--               (login allowed, payment popup only)
--   pay       → status='active' (home page unlocked)
--   expiry    → status='suspended' (renew — plan fee only, no reg. charge)
--   block     → status='blocked' (+ reason, recorded in history)
-- ============================================================

-- 1. Widen the status check to include 'suspended'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'suspended', 'blocked'));

-- 2. Reason shown to a blocked user + captured in history
ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason TEXT;

-- 3. Allow 'approved' as an approval_status value (approved, awaiting payment)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_approval_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_approval_status_check
  CHECK (approval_status IN ('pending_review', 'payment_pending', 'approved', 'active', 'rejected'));

-- 4. Audit trail of every account status change (who, when, why)
CREATE TABLE IF NOT EXISTS user_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_status  TEXT,
  new_status  TEXT NOT NULL,
  reason      TEXT,
  changed_by  UUID REFERENCES users(id),   -- NULL = system (e.g. expiry) or self (payment)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_status_history_user ON user_status_history(user_id, created_at DESC);

-- 5. Record of each subscription payment (initial activation + renewals)
CREATE TABLE IF NOT EXISTS subscription_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL,
  plan_amount         INTEGER NOT NULL DEFAULT 0,   -- paise
  registration_charge INTEGER NOT NULL DEFAULT 0,   -- paise (₹100 first time only)
  total_amount        INTEGER NOT NULL DEFAULT 0,   -- paise
  payment_reference   TEXT,
  is_renewal          BOOLEAN NOT NULL DEFAULT false,
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id, paid_at DESC);
