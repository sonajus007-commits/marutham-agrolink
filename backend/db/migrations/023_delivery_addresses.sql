-- Migration: add the consumer address book to users.
-- Run once in the Supabase SQL Editor.
--
-- PATCH /auth/me has listed 'delivery_addresses' in its ALLOWED fields since the
-- address book was written (backend/routes/auth.js), but the column was never
-- created. Every save therefore failed with 500 "Could not update profile.", and
-- the checkout's saved-address picker was always empty. This adds the column.
--
-- Shape: an array of address objects, exactly one of which has is_default: true.
--   [{ "label": "Home", "house_no": "12", "street1": "…", "landmark": "…",
--      "village_town": "…", "city": "…", "taluk": "…", "district": "…",
--      "state": "…", "pincode": "622001", "is_default": true }]

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS delivery_addresses JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Guard against a non-array being written (the API replaces the whole value).
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_delivery_addresses_is_array;

ALTER TABLE users
  ADD CONSTRAINT users_delivery_addresses_is_array
  CHECK (jsonb_typeof(delivery_addresses) = 'array');
