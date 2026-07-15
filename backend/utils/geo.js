// Geospatial helpers. The reusable core of geofencing — the distance between two
// lat/lng points — so every "is this within N metres of that" check (delivery
// off-site flagging today; VCO/hub checks later) shares one tested implementation.

const EARTH_RADIUS_M = 6_371_000; // mean Earth radius in metres

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates, in METRES (haversine). Accurate
 * to well within a metre at delivery scale. Returns null if any coordinate is
 * missing or not a finite number, so callers can treat "no pin" and "no fix" the
 * same way — as "cannot compare".
 */
function distanceMeters(aLat, aLng, bLat, bLng) {
  const nums = [aLat, aLng, bLat, bLng];
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when b is within `radiusMeters` of a. null distance (missing points) → false. */
function isWithin(aLat, aLng, bLat, bLng, radiusMeters) {
  const d = distanceMeters(aLat, aLng, bLat, bLng);
  return d !== null && d <= radiusMeters;
}

module.exports = { distanceMeters, isWithin };
