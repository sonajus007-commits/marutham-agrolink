-- Migration: farmer_listings.images
-- Run once in the Supabase SQL Editor.
--
-- The column already exists in the current database — it was added by hand and
-- never written down. `npm run db:coverage` caught it: a database rebuilt from
-- these migrations would have had no product photos, and the storefront reads
-- offer.images[0] for every product card and offer row.
--
-- Idempotent, so it is a no-op against the existing database and only does work
-- on a fresh one.
--
-- Shape: a JSONB array of image URLs.  ["https://…/tomato-1.jpg", …]

ALTER TABLE farmer_listings
  ADD COLUMN IF NOT EXISTS images JSONB;
