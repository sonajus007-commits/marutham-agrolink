// Best-effort forward geocoding for the live-tracking map: turn a delivery address
// into { lat, lng } so an order that was never map-pinned still has a destination.
//
// Key-gated and entirely optional — with no GOOGLE_GEOCODING_API_KEY (or the shared
// GOOGLE_MAPS_API_KEY) set, every call returns null and the map simply shows no
// destination endpoint. Never throws: a geocode failure must never sink the request
// that asked for it (order placement, order tracking). Mirrors the DATA_GOV_API_KEY
// pattern — a feature that lights up when its key is present and no-ops when it isn't.

const GEOCODE_KEY =
  process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 4000;

/** Whether geocoding is configured at all (a key is present). */
function geocodingEnabled() {
  return Boolean(GEOCODE_KEY);
}

/**
 * Build a single-line address from the structured fields shared by delivery_address
 * (JSONB) and a users row. Empty parts are dropped; India is appended so the region
 * bias and the geocoder agree. Returns '' when there is nothing to geocode.
 */
function addressLine(a) {
  if (!a || typeof a !== 'object') return '';
  const parts = [
    a.house_no,
    a.street1,
    a.street2,
    a.landmark,
    a.village_town,
    a.city,
    a.taluk,
    a.district,
    a.state,
    a.pincode,
  ]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean);
  if (!parts.length) return '';
  return `${parts.join(', ')}, India`;
}

/**
 * Geocode a structured address object to { lat, lng }, or null. Best-effort:
 * returns null with no key, no address, a network/timeout error, or a non-OK
 * Google response. Bounded by a short timeout so it can sit inline in a request.
 */
async function geocodeAddress(address) {
  if (!geocodingEnabled()) return null;
  const line = addressLine(address);
  if (!line) return null;

  try {
    const url =
      `${GEOCODE_URL}?address=${encodeURIComponent(line)}` +
      `&region=in&key=${encodeURIComponent(GEOCODE_KEY)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const loc = data.results && data.results[0] && data.results[0].geometry
      ? data.results[0].geometry.location
      : null;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
    // Sanity-bound: a bad payload must not write an off-planet pin.
    if (loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

module.exports = { geocodeAddress, geocodingEnabled, addressLine };
