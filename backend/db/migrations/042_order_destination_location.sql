-- Migration: orders.dest_lat / dest_lng
--
-- The consumer's delivery destination — where the parcel is headed. Captured
-- best-effort at checkout from the "Pin current location" control on the delivery
-- address (AddressFields → LocationPinButton), which already stores lat/lng inline
-- in the delivery_address JSONB. This promotes that pin to top-level columns so the
-- live-tracking map can read it without parsing the JSONB on every poll, and so it
-- sits alongside the rest of the geolocation rollout as a first-class column.
--
-- Both nullable — a consumer can decline location or place an order from a saved
-- address that was never pinned, and an order must never be blocked on it. The map
-- simply has no destination endpoint until a later geocoding fallback fills it.
--
-- Phase 5 (consumer destination) of the geolocation rollout, completing the set:
--   farm_*      — where the seller's farm is        (030)
--   verified_*  — where the VCO verified            (032)
--   dispatched_*— where the hub dispatched          (033)
--   dest_*      — where the parcel is headed        (this one)
--   delivered_* — where it was actually delivered   (029)
-- Idempotent.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dest_lat double precision,
  ADD COLUMN IF NOT EXISTS dest_lng double precision;
