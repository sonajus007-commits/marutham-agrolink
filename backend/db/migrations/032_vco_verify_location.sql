-- Migration: orders.verified_lat / verified_lng
--
-- Where the VCO was when they verified/collected the order (the VCO Verified scan,
-- backend/routes/delivery.js). Captured best-effort from the VCO's device via the
-- shared geolocation helper. Both nullable — location can be declined, and a verify
-- must never be blocked on it.
--
-- Phase 3 (VCO) of the geolocation rollout. Idempotent.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS verified_lat double precision,
  ADD COLUMN IF NOT EXISTS verified_lng double precision;
