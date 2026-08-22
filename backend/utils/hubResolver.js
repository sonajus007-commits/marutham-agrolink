// Resolve the taluk hub responsible for a location.
//
// The hub network (db/migrations/038_hubs.sql) has exactly one TALUK hub per taluk,
// keyed on (state, district, taluk) with hub_type = 'taluk'. Given a location this
// returns that hub's id — the hub a seller's goods enter through (pickup) or a
// consumer's parcel leaves through (delivery). See utils order → hub attribution
// (orders route, Phase 2).
//
// BEST-EFFORT BY DESIGN. Attribution is reporting metadata, never a gate on placing
// an order, so every miss returns null rather than throwing: an incomplete location
// (missing taluk), a taluk with no hub yet, or a failed lookup all yield null and the
// caller stamps NULL. A failed READ is logged (a real fault should be visible) but
// still degrades to null — it must not fail the checkout it rides along with.

async function resolveTalukHubId(supabase, { state, district, taluk } = {}) {
  if (!state || !district || !taluk) return null;

  // maybeSingle: 0 rows is a legitimate answer (no hub for this taluk yet), not an
  // error. The (state, district, taluk) partial-unique index guarantees at most one
  // taluk hub, so this never trips maybeSingle's 2+-rows error.
  const { data, error } = await supabase
    .from('hubs')
    .select('id')
    .eq('state', state)
    .eq('district', district)
    .eq('taluk', taluk)
    .eq('hub_type', 'taluk')
    .maybeSingle();

  if (error) {
    console.error('resolveTalukHubId lookup failed:', error.message);
    return null;
  }
  return data ? data.id : null;
}

module.exports = { resolveTalukHubId };
