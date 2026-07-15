-- Migration: orders.delivery_distance_m
--
-- Geofencing: how far (in metres) the delivery agent's captured location was from
-- the consumer's pinned delivery address, computed on the Delivered transition
-- (backend/routes/delivery.js, via backend/utils/geo.js). Null when either point is
-- missing — the address was never pinned, or the agent shared no location — so the
-- column means "not comparable", not "zero".
--
-- A delivery beyond the geofence radius also drops an order_history note, so it
-- surfaces in the timeline without a query. Phase 3 (geofencing) of the rollout.
-- Idempotent.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_distance_m double precision;
