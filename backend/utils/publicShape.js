// ─────────────────────────────────────────────────────────────────────────────
// What a stranger may see.
//
// GET /products/:id is PUBLIC (no auth) and embeds the grower behind each
// listing. It returned that grower's full name and village to anybody who asked
// — and the public marketplace is about to server-render this page, which would
// have published real farmers' names and villages into Google with no consent
// ever recorded.
//
// Policy (approved 2026-07-12): anonymous callers see the DISTRICT and nothing
// else. A district is a coarse, non-identifying geography — enough to say "grown
// in Pudukkottai", useless for finding a person. A signed-in customer still sees
// who they are buying from; that is a relationship, not a broadcast.
//
// Pure and dependency-free so it can be unit-tested, and so that the rule lives
// in ONE place rather than being re-derived at each call site.
// ─────────────────────────────────────────────────────────────────────────────

/** Fields that identify a person. Never sent to an anonymous caller. */
const IDENTIFYING_FIELDS = ['fname', 'lname', 'village_town', 'phone', 'email', 'login_id', 'id'];

/**
 * Shape a grower for the audience.
 * @param farmer  the joined users row (may be null/undefined)
 * @param viewer  req.user, or null/undefined for an anonymous caller
 */
function publicFarmer(farmer, viewer) {
  if (!farmer) return null;

  // Signed in → unchanged. The customer is in a transaction with this grower.
  if (viewer) return farmer;

  // Anonymous → district only. Built by allow-list, not by deleting keys, so a
  // column added to the query later cannot silently start leaking.
  return { district: farmer.district ?? null };
}

module.exports = { publicFarmer, IDENTIFYING_FIELDS };
