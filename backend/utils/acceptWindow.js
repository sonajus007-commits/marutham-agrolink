// ── Order acceptance window ───────────────────────────────────────────────────
// A seller must ACCEPT an order within 2 hours of their ordering cutoff, or the
// order is auto-cancelled and refunded. The cutoff is per seller:
//   • Farmer  — the latest `cutoff_ts` among the listings in that seller's parcel
//               (an absolute instant; see farmer_listings.cutoff_ts).
//   • Retailer— that day's `shop_close_hour` (IST, 24h; users.shop_close_hour).
// With no cutoff configured, we fall back to the next 8 AM IST cycle close — the
// same daily boundary the seller-facing cutoff picker uses (packages/lib farmer.ts).
//
// The deadline is computed ONCE at placement and frozen onto the order, so the
// sweep and the reminder scheduler read a plain timestamp instead of re-deriving it.
// Pure and dependency-free so it can be unit-tested without a database or clock.

const ACCEPT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const IST_OFFSET_MIN = 330; // IST = UTC+5:30, no DST — a fixed offset
const CYCLE_CLOSE_HOUR_IST = 8; // 8 AM IST closes the selling cycle (fallback)

const isRetailer = (sellerType) => /retail/i.test(String(sellerType || ''));

// The UTC instant of a given whole-hour IST wall-clock time on the IST calendar day
// that `ref` falls on. Mirrors the conversion in packages/lib/src/farmer.ts.
function istHourInstant(ref, hourIST) {
  const istWall = new Date(ref.getTime() + IST_OFFSET_MIN * 60_000);
  return new Date(
    Date.UTC(istWall.getUTCFullYear(), istWall.getUTCMonth(), istWall.getUTCDate(), hourIST) -
      IST_OFFSET_MIN * 60_000,
  );
}

// The next occurrence of `hourIST` at or after `ref`.
function nextIstHour(ref, hourIST) {
  const today = istHourInstant(ref, hourIST);
  return today > ref ? today : new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * The instant by which the seller must have accepted, or null when it cannot be
 * determined (treated by callers as "no deadline" — never auto-cancelled).
 *
 * @param {object} o
 * @param {string} [o.sellerType]      users.seller_type
 * @param {number} [o.shopCloseHour]   users.shop_close_hour (retailer, IST 24h)
 * @param {Array<string|Date|null>} [o.listingCutoffs] farmer_listings.cutoff_ts values
 * @param {Date}   [o.now]             current time (injectable for tests)
 * @returns {Date|null}
 */
function computeAcceptDeadline({ sellerType, shopCloseHour, listingCutoffs = [], now = new Date() } = {}) {
  let cutoff;

  if (isRetailer(sellerType) && shopCloseHour != null) {
    cutoff = istHourInstant(now, shopCloseHour);
  } else {
    const instants = listingCutoffs
      .filter(Boolean)
      .map((t) => new Date(t))
      .filter((d) => !Number.isNaN(d.getTime()));
    cutoff = instants.length
      ? new Date(Math.max(...instants.map((d) => d.getTime())))
      : nextIstHour(now, CYCLE_CLOSE_HOUR_IST);
  }

  return new Date(cutoff.getTime() + ACCEPT_WINDOW_MS);
}

module.exports = { computeAcceptDeadline, ACCEPT_WINDOW_MS, isRetailer };
