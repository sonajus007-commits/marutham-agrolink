-- Add listing_status to farmer_listings — run once in Supabase SQL Editor
ALTER TABLE farmer_listings
  ADD COLUMN IF NOT EXISTS listing_status TEXT DEFAULT 'pending'
    CHECK (listing_status IN ('pending', 'active', 'rejected'));

-- Existing confirmed+listed listings are already live — mark them active
UPDATE farmer_listings
  SET listing_status = 'active'
  WHERE confirmed = true AND listed = true AND listing_status = 'pending';
