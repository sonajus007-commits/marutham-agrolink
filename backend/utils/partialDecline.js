// ── Item-level decline: the money arithmetic (pure) ─────────────────────────
//
// A seller may decline some lines of a parcel and accept the rest (migration 065).
// The declined lines leave order_items, so the parcel's money must drop by exactly
// what those lines contributed at placement (routes/orders.js POST /):
//
//   line total   = round(price × qty)                  consumer price, paise
//   seller total = round(farmer_price × qty)
//   market_fee   = line total − seller total            platform markup
//   saved        = round((govt_price − price) × qty)    when a govt price exists, ≥ 0
//
// Order-level charges (handling, delivery, the multi-vendor fee) are deliberately
// NOT re-priced. A seller's decline must never make the customer pay MORE — e.g.
// losing free delivery because the basket dipped under ₹400 — so those stay as
// charged, and only the declined goods come off the bill.

function lineSums(items) {
  let line = 0;
  let seller = 0;
  let saved = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    line += Math.round(price * qty);
    seller += Math.round((Number(it.farmer_price) || 0) * qty);
    if (it.govt_price != null) {
      saved += Math.max(0, Math.round((Number(it.govt_price) - price) * qty));
    }
  }
  return { line, seller, saved };
}

/** The orders-row money after removing `sums` (from lineSums) from it. */
function moneyAfterDecline(order, sums) {
  const n = (v) => Number(v) || 0;
  return {
    item_total: Math.max(0, n(order.item_total) - sums.line),
    market_fee: Math.max(0, n(order.market_fee) - (sums.line - sums.seller)),
    saved: Math.max(0, n(order.saved) - sums.saved),
    total: Math.max(0, n(order.total) - sums.line),
  };
}

module.exports = { lineSums, moneyAfterDecline };
