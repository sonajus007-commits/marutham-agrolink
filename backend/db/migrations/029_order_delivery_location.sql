-- Migration: orders.delivered_lat / delivered_lng
--
-- Proof-of-delivery coordinates: where the delivery agent's device was when they
-- marked the order Delivered. Captured best-effort by the agent app
-- (apps/web/src/native/geolocation.ts) and written on the Delivered transition in
-- backend/routes/delivery.js. Both nullable — location permission can be declined,
-- and a delivery must never be blocked on it.
--
-- Phase 1 of the geolocation rollout; later phases add farmer/consumer coordinates.
-- Idempotent.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_lat double precision,
  ADD COLUMN IF NOT EXISTS delivered_lng double precision;
