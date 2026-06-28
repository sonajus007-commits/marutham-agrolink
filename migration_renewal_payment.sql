-- Migration: add payment tracking columns to profile_change_requests
-- Run in Supabase SQL Editor

ALTER TABLE profile_change_requests
  ADD COLUMN IF NOT EXISTS payment_reference    TEXT,
  ADD COLUMN IF NOT EXISTS renewal_amount       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
