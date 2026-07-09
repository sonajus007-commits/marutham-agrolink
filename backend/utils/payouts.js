// What a farmer is owed for an order. Pure, so the settlement batch
// (POST /payouts/run) and the per-order figure on GET /orders cannot drift.
//
// All paise. The farmer is paid their own `farmer_price`, not the consumer
// price — the difference is the platform's margin.

/** Σ round(farmer_price × qty) over the given order_items rows, in paise. */
function farmerPayoutPaise(items) {
  return (items || []).reduce(
    (sum, i) => sum + Math.round(Number(i.farmer_price || 0) * Number(i.qty || 0)),
    0,
  );
}

/**
 * Group order_items into one payout per (order, farmer).
 * Returns [{ order_id, farmer_id, amount }] with amount in paise.
 */
function groupPayouts(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const key = `${item.order_id}::${item.farmer_id}`;
    if (!byKey.has(key)) byKey.set(key, { order_id: item.order_id, farmer_id: item.farmer_id, amount: 0 });
    byKey.get(key).amount += Math.round(Number(item.farmer_price || 0) * Number(item.qty || 0));
  }
  return [...byKey.values()];
}

/** { [order_id]: paise } for a single farmer's items across many orders. */
function payoutByOrder(items) {
  const out = {};
  for (const item of items || []) {
    out[item.order_id] = (out[item.order_id] || 0) + Math.round(Number(item.farmer_price || 0) * Number(item.qty || 0));
  }
  return out;
}

module.exports = { farmerPayoutPaise, groupPayouts, payoutByOrder };
