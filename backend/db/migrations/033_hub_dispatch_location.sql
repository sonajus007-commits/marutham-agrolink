-- Migration: orders.dispatched_lat / dispatched_lng
--
-- Where the hub was when the Hub Incharge dispatched the order for last-mile
-- delivery (the At Hub → Out for Delivery scan, backend/routes/delivery.js).
-- Captured best-effort from the device via the shared geolocation helper. Both
-- nullable — location can be declined, and a dispatch must never be blocked on it.
--
-- Phase 3 (Hub Incharge) of the geolocation rollout — the last handoff to gain a
-- location stamp (verified_* at VCO, dispatched_* here, delivered_* at delivery).
-- Idempotent.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dispatched_lat double precision,
  ADD COLUMN IF NOT EXISTS dispatched_lng double precision;
