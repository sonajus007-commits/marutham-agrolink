// ── Seller reliability counters ───────────────────────────────────────────────
// Reliability is derived live from two plain counters on the seller:
//   reliability = orders_fulfilled / (orders_fulfilled + orders_cancelled)
// A seller with no history reads as fully reliable. `orders_fulfilled` is bumped when
// the seller packs an accepted order; `orders_cancelled` when they cause a
// cancellation (missed acceptance or decline). Reliability drives whether the
// seller's offers surface in the consumer's initial (best-selling) view.
//
// Read-modify-write because PostgREST exposes no atomic increment. Best-effort and
// logged: a missed counter must never fail the order action that triggered it.

const supabase = require('../db/supabase');

async function bump(sellerId, column) {
  if (!sellerId) return;
  const { data: u, error } = await supabase
    .from('users')
    .select(column)
    .eq('id', sellerId)
    .maybeSingle();
  if (error || !u) {
    console.error(`reliability: read miss for ${sellerId}.${column}: ${error ? error.message : 'no user'}`);
    return;
  }
  const { error: upErr } = await supabase
    .from('users')
    .update({ [column]: (u[column] || 0) + 1 })
    .eq('id', sellerId);
  if (upErr) console.error(`reliability: bump ${column} failed for ${sellerId}: ${upErr.message}`);
}

const bumpFulfilled = (sellerId) => bump(sellerId, 'orders_fulfilled');
const bumpCancelled = (sellerId) => bump(sellerId, 'orders_cancelled');

/** Live reliability ratio in [0,1]; 1 when there is no history. */
function reliabilityScore(fulfilled = 0, cancelled = 0) {
  const total = (fulfilled || 0) + (cancelled || 0);
  return total === 0 ? 1 : (fulfilled || 0) / total;
}

module.exports = { bumpFulfilled, bumpCancelled, reliabilityScore };
