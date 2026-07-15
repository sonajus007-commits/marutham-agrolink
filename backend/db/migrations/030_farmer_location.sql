-- Migration: users.farm_lat / farm_lng
--
-- The seller's farm coordinates, captured best-effort from their device on the
-- farmer profile (apps/web/src/pages/farmer/FarmLocationCard.tsx via the shared
-- geolocation helper) and saved through PATCH /auth/me. Both nullable — a farmer
-- may never set them, and location permission can be declined.
--
-- Phase 2 of the geolocation rollout (phase 1 was orders.delivered_lat/lng).
-- Idempotent.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS farm_lat double precision,
  ADD COLUMN IF NOT EXISTS farm_lng double precision;
