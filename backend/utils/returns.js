// Pure return-request logic, extracted from routes/returns.js so it can be
// unit-tested without a database. Everything here is money-critical:
//
//   * All money is PAISE (integers), as stored. The convertMoney() response
//     middleware turns paise into rupees on the way out but nothing converts
//     back on the way in, so a client's `price` is never trusted here.
//   * Quantities are clamped to what was actually purchased.
//   * `full_return` is derived from the resolved lines, never asserted by the
//     caller — it selects the refund path, so a lie would be a payout.

const RETURN_WINDOW_HOURS = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

/** Hours elapsed since delivery; Infinity when the order has no delivered_at. */
function hoursSinceDelivery(deliveredAt, now = Date.now()) {
  if (!deliveredAt) return Infinity;
  const t = new Date(deliveredAt).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (now - t) / MS_PER_HOUR;
}

function isWithinReturnWindow(deliveredAt, now = Date.now()) {
  return hoursSinceDelivery(deliveredAt, now) <= RETURN_WINDOW_HOURS;
}

/**
 * Match a client-supplied line to the order_items row it refers to.
 * Prefers order_item_id (what the React app sends); falls back to product_code
 * then name, which is what the legacy consumer page sends.
 */
function matchItem(line, items) {
  if (line.order_item_id) return items.find(i => i.id === line.order_item_id);
  if (line.product_code)  return items.find(i => i.product_code === line.product_code);
  if (line.name)          return items.find(i => i.name === line.name);
  return undefined;
}

/**
 * Resolve requested lines against the order's real items.
 *
 * An empty `lines` array means "return everything". Returns
 * `{ error }` on any bad input, else `{ resolved: [{ item, qty, reason }] }`.
 * Note only `item` and `qty` are trusted downstream; every other field on the
 * request line is discarded.
 */
function resolveReturnLines(items, lines, fallbackReason = null) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Order has no items to return.' };
  }

  if (!lines || lines.length === 0) {
    return { resolved: items.map(item => ({ item, qty: Number(item.qty), reason: fallbackReason })) };
  }

  const resolved = [];
  for (const line of lines) {
    const item = matchItem(line, items);
    if (!item) {
      const label = line.order_item_id || line.product_code || line.name;
      return { error: `Item "${label}" is not part of this order.` };
    }
    if (resolved.some(r => r.item.id === item.id)) {
      return { error: `Item "${item.name}" listed more than once.` };
    }
    const qty = line.qty == null ? Number(item.qty) : Number(line.qty);
    if (!(qty > 0) || qty > Number(item.qty)) {
      return { error: `Invalid return quantity for "${item.name}" (ordered ${item.qty} ${item.unit}).` };
    }
    resolved.push({ item, qty, reason: line.reason || null });
  }
  return { resolved };
}

/** True only when every item is being returned in its full quantity. */
function deriveFullReturn(items, resolved) {
  return (
    resolved.length === items.length &&
    resolved.every(r => Number(r.qty) === Number(r.item.qty))
  );
}

/**
 * Refund in PAISE. Product value only — delivery and handling are not refunded.
 * A full return refunds the order's stored item_total rather than re-summing,
 * so it cannot drift from what the customer was charged.
 */
function computeRefundPaise(order, resolved, isFull) {
  if (isFull) return Number(order.item_total);
  return resolved.reduce((sum, r) => sum + Math.round(Number(r.item.price) * r.qty), 0);
}

/** The rows to write to return_lines — item details copied from order_items. */
function buildReturnLineRows(returnId, resolved) {
  return resolved.map(r => ({
    return_id:    returnId,
    product_code: r.item.product_code,
    name:         r.item.name,
    farmer_name:  r.item.farmer_name,
    qty:          r.qty,
    unit:         r.item.unit,
    price:        r.item.price, // paise, as stored
    reason:       r.reason,
  }));
}

module.exports = {
  RETURN_WINDOW_HOURS,
  hoursSinceDelivery,
  isWithinReturnWindow,
  resolveReturnLines,
  deriveFullReturn,
  computeRefundPaise,
  buildReturnLineRows,
};
