-- Migration: farmer_listings.rejection_reason
-- Run once in the Supabase SQL Editor.
--
-- Why this column did not exist, despite the app acting as though it did:
--
-- The legacy admin console prompted the reviewer for "Reason for rejection (shown
-- to farmer)" and POSTed it to PATCH /listings/:id/status. The route built its
-- update as { listing_status, updated_at } and never read `rejection_reason`, so
-- every reason an admin ever typed was silently dropped. The farmer's listing card
-- has a slot to display it and renders "Contact support for details." instead,
-- because the field is always undefined.
--
-- So the promise on the label — "shown to farmer" — has never once been kept. This
-- column is what makes it true.
--
-- Nullable, deliberately: only a REJECTED listing carries a reason, and the route
-- CLEARS it on approve/deactivate. A stale "produce looked spoiled" hanging off a
-- listing that is now live would be worse than no reason at all.
--
-- Idempotent, so re-running it is safe.

ALTER TABLE farmer_listings
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
