-- Migration: add qty_type & qty_value to farmer_listings
-- Run once in Supabase SQL Editor.

ALTER TABLE farmer_listings
  ADD COLUMN IF NOT EXISTS qty_type  TEXT CHECK (qty_type IN ('MOQ', 'SPQ')),
  ADD COLUMN IF NOT EXISTS qty_value NUMERIC;
