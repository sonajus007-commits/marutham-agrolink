// Best-effort forward geocoding for the live-tracking map: turn a delivery address
// into { lat, lng } so an order that was never map-pinned still has a destination.
//
// Key-gated and entirely optional — with no GOOGLE_GEOCODING_API_KEY (or the shared
// GOOGLE_MAPS_API_KEY) set, every call returns null and the map simply shows no
// destination endpoint. Never throws: a geocode failure must never sink the request
// that asked for it (order placement, order tracking). Mirrors the DATA_GOV_API_KEY
// pattern — a feature that lights up when its key is present and no-ops when it isn't.
//
// ⚠ Geocoding a generic Indian address is only ever approximate, and Google can fail
// LOUDLY: given a common street ("Anna Nagar", "Main Road") plus a pincode, it may
// discard the locality entirely and PARTIAL-MATCH a same-named road in a different
// district 80 km away — returning a confident, wrong, ROOFTOP point. Two guards here:
//   1. Validation — a result must actually contain the requested locality (city /
//      taluk / district) in its formatted address, else it is rejected. This catches
//      the "matched a random road" degradation (its formatted address is just a road
//      + country, with no locality).
//   2. Pincode retry — empirically the pincode is often the very token that misleads
//      the parser, so if the pincode'd query fails validation we retry WITHOUT it
//      (locality alone geocodes the town centroid reliably). Better an approximate
//      town-level pin than a precise pin in the wrong district.
// The real fix for accuracy is a captured pin (checkout map-pin, agent GPS, farm pin);
// this fallback is only as good as the text address, and now fails safe rather than
// far.

const GEOCODE_KEY =
  process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 4000;

/** Whether geocoding is configured at all (a key is present). */
function geocodingEnabled() {
  return Boolean(GEOCODE_KEY);
}

/** The locality parts of an address, most- to least-specific, for both building the
 *  query and validating the result. Empty parts dropped. */
function localityParts(a) {
  if (!a || typeof a !== 'object') return [];
  return [a.village_town, a.city, a.taluk, a.district]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean);
}

/**
 * Build a single-line address from the structured fields shared by delivery_address
 * (JSONB) and a users row. Empty parts are dropped, consecutive duplicates collapsed
 * (city/taluk/district are frequently the same town, and repeating it three times
 * confuses the parser), and India is appended so the region bias and the geocoder
 * agree. Pass `{ pincode: false }` to omit the pincode (the retry path). Returns ''
 * when there is nothing to geocode.
 */
function addressLine(a, { pincode = true } = {}) {
  if (!a || typeof a !== 'object') return '';
  const raw = [
    a.house_no,
    a.street1,
    a.street2,
    a.landmark,
    a.village_town,
    a.city,
    a.taluk,
    a.district,
    a.state,
    pincode ? a.pincode : null,
  ].map((p) => (p == null ? '' : String(p).trim()));

  // Drop empties, then collapse case-insensitive duplicates (keep first occurrence).
  const parts = [];
  const seen = new Set();
  for (const p of raw) {
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(p);
  }
  if (!parts.length) return '';
  return `${parts.join(', ')}, India`;
}

/** One geocode call → the top result object (with geometry + formatted_address +
 *  partial_match), or null. Best-effort and bounded by a short timeout. */
async function geocodeOnce(line) {
  try {
    const url =
      `${GEOCODE_URL}?address=${encodeURIComponent(line)}` +
      `&region=in&key=${encodeURIComponent(GEOCODE_KEY)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.results || !data.results[0]) return null;
    return data.results[0];
  } catch {
    return null;
  }
}

/** Does the geocoder's result actually resolve the requested locality? True when any
 *  of the address's locality names appears in the result's formatted address. When the
 *  address carries no locality at all, there is nothing to validate against, so accept
 *  (the caller gave us only a street — we can't do better). */
function resultMatchesLocality(result, address) {
  const wanted = localityParts(address);
  if (!wanted.length) return true;
  const hay = String(result.formatted_address || '').toLowerCase();
  return wanted.some((w) => hay.includes(w.toLowerCase()));
}

/** A result's { lat, lng } if present and on-planet, else null. */
function pointOf(result) {
  const loc = result && result.geometry ? result.geometry.location : null;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  if (loc.lat < -90 || loc.lat > 90 || loc.lng < -180 || loc.lng > 180) return null;
  return { lat: loc.lat, lng: loc.lng };
}

/**
 * Geocode a structured address object to { lat, lng }, or null. Best-effort:
 * returns null with no key, no address, a network/timeout error, or a result that
 * fails the locality check on both the pincode'd and pincode-free queries. See the
 * file header for why the pincode retry and the locality validation exist.
 */
async function geocodeAddress(address) {
  if (!geocodingEnabled()) return null;

  // Attempt 1: the full line (with pincode) — most precise when it resolves.
  const line = addressLine(address);
  if (line) {
    const r = await geocodeOnce(line);
    if (r && resultMatchesLocality(r, address)) {
      const p = pointOf(r);
      if (p) return p;
    }
  }

  // Attempt 2: drop the pincode — often the token that derailed the parser. Only
  // worth trying if it actually changes the query (there was a pincode to drop).
  const lineNoPin = addressLine(address, { pincode: false });
  if (lineNoPin && lineNoPin !== line) {
    const r = await geocodeOnce(lineNoPin);
    if (r && resultMatchesLocality(r, address)) {
      const p = pointOf(r);
      if (p) return p;
    }
  }

  return null;
}

module.exports = { geocodeAddress, geocodingEnabled, addressLine };
