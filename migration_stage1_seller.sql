-- ─────────────────────────────────────────────────────────────────────────────
-- STAGE 1 MIGRATION: Expand "farmer" role into a Seller model
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add seller_type to tell Farmers from Retailers
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS seller_type text
    CHECK (seller_type IN ('Farmer', 'Retailer'));

-- 2. Retailer-specific business fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gst_number    text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS business_type text;

-- 3. Backfill all existing farmer accounts → Farmer
UPDATE users SET seller_type = 'Farmer' WHERE role = 'farmer';

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify (run after the above):
-- SELECT id, login_id, role, seller_type, business_name FROM users WHERE role = 'farmer';
-- ─────────────────────────────────────────────────────────────────────────────
