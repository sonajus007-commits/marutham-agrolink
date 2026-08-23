// Suggest the destination hub for a VIA-HUB delivery — deterministically.
//
// On the hub lane a parcel takes the line-haul to a hub, then a last-mile agent
// runs it to the consumer's door. WHICH hub? The one covering the consumer's
// delivery area. That is a geospatial LOOKUP, not a reasoning task: the delivery
// address is structured (taluk / pincode / lat-lng from the shared address block),
// so it resolves with a taluk match and a distance sort — no LLM, no per-order cost
// or latency, and the VCO still confirms/overrides in a dropdown.
//
// This lives in its own module as a SEAM: if free-text delivery addresses ever
// prove too messy for a taluk match, an AI fallback can wrap suggestDeliveryHubs
// without any caller changing.
//
// Candidates = every ACTIVE taluk hub in the delivery district. Ranked:
//   1. the hub in the consumer's OWN taluk (exact area match); when a taluk holds
//      several offices the primary (oldest) sorts first,
//   2. then the rest by map distance from the consumer's pin (when both carry one),
//   3. then by name, so the order is stable.
// The first is the suggestion; the VCO sees the whole list and can pick another.

const { distanceMeters } = require('./geo');

const HUB_COLS = 'id, name, taluk, district, state, lat, lng, is_active, created_at';

// Returns { suggested_hub_id, hubs: [{ id, name, taluk, distance_m, same_taluk }] }.
// Best-effort: a missing district, a failed read, or no hubs all yield an empty
// list with a null suggestion — this only ever ADVISES a routing choice, it never
// gates one.
async function suggestDeliveryHubs(supabase, { state, district, taluk, lat, lng } = {}) {
  if (!district) return { suggested_hub_id: null, hubs: [] };

  let q = supabase
    .from('hubs')
    .select(HUB_COLS)
    .eq('district', district)
    .eq('hub_type', 'taluk')
    .eq('is_active', true)
    .order('created_at', { ascending: true }); // primary (oldest) office first within a taluk
  if (state) q = q.eq('state', state);

  const { data, error } = await q;
  if (error) {
    console.error('suggestDeliveryHubs lookup failed:', error.message);
    return { suggested_hub_id: null, hubs: [] };
  }

  const tlc = String(taluk || '').trim().toLowerCase();
  const oLat = typeof lat === 'number' ? lat : null;
  const oLng = typeof lng === 'number' ? lng : null;

  // Keep the fetch order (created_at asc) stable inside each rank bucket so a taluk's
  // primary office wins — Array.prototype.sort is stable in Node.
  const shaped = (data || []).map((h) => ({
    id: h.id,
    name: h.name,
    taluk: h.taluk,
    same_taluk: !!tlc && String(h.taluk || '').toLowerCase() === tlc,
    distance_m:
      oLat != null && oLng != null && h.lat != null && h.lng != null
        ? distanceMeters(oLat, oLng, Number(h.lat), Number(h.lng))
        : null,
  }));

  const rankKey = (s) => [s.same_taluk ? 0 : 1, s.distance_m ?? Infinity];
  const ranked = shaped.slice().sort((a, b) => {
    const ka = rankKey(a);
    const kb = rankKey(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return String(a.name).localeCompare(String(b.name));
  });

  return { suggested_hub_id: ranked.length ? ranked[0].id : null, hubs: ranked };
}

module.exports = { suggestDeliveryHubs };
