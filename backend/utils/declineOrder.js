// ── Seller declines: the whole parcel, or some of its lines ─────────────────
//
// Whole-parcel decline cancels + refunds + counts against reliability (via the
// shared cancelOrders). An item-level decline instead MOVES the chosen lines out
// of order_items into declined_order_items (migration 065), so every total built
// from order_items — payout, invoice, VCO verify, packing — stays right untouched;
// the route then re-prices the parcel and accepts the rest (routes/delivery.js).

const supabase = require('../db/supabase');
const { cancelOrders } = require('./cancelOrder');
const { rollupToParent } = require('./orderRollup');
const { notify } = require('./notifications');

/** The cancel_reason a seller decline stores (read back by the seller's Rejected view). */
function declineReasonText(reason) {
  const r = String(reason || '').trim().slice(0, 200);
  return r ? `Declined by seller: ${r}` : 'Declined by seller.';
}

/** Cancel the whole parcel as a seller decline. Returns { refunds }. */
async function declineWholeParcel(order, reason) {
  const { refunds } = await cancelOrders([order], { reason: declineReasonText(reason), sellerFault: true });
  if (order.consumer_id) {
    await notify(order.consumer_id, {
      type: 'order_cancelled',
      title: 'A seller could not fulfil your order',
      body: `${order.seller_name || 'A seller'} declined part of your order. Any prepayment is being refunded.`,
      data: { order_id: order.id, code: order.code },
    });
  }
  return { refunds };
}

/**
 * Move `lines` (full order_items rows) into declined_order_items.
 * Returns {} on success or { error } — on error nothing is left half-moved.
 */
async function moveLinesOut(order, lines, reason) {
  const ids = lines.map((l) => l.id);
  const copies = lines.map((l) => ({
    order_id: order.id,
    order_item_id: l.id,
    product_id: l.product_id,
    product_code: l.product_code,
    name: l.name,
    farmer_id: l.farmer_id,
    farmer_name: l.farmer_name,
    qty: l.qty,
    unit: l.unit,
    price: l.price,
    farmer_price: l.farmer_price,
    govt_price: l.govt_price,
    reason: reason || null,
  }));

  const { error: insErr } = await supabase.from('declined_order_items').insert(copies);
  if (insErr) return { error: insErr.message };

  const { error: delErr } = await supabase.from('order_items').delete().in('id', ids).eq('order_id', order.id);
  if (delErr) {
    const { error: undoErr } = await supabase
      .from('declined_order_items').delete().eq('order_id', order.id).in('order_item_id', ids);
    if (undoErr) console.error(`declineLines: could not undo copies for ${order.id}:`, undoErr.message);
    return { error: delErr.message };
  }
  return {};
}

/** Undo moveLinesOut — used when the order update that follows it fails. */
async function restoreLines(order, lines) {
  const ids = lines.map((l) => l.id);
  const { error: insErr } = await supabase.from('order_items').insert(lines);
  if (insErr) console.error(`declineLines: RESTORE FAILED for ${order.id} (${ids.join(',')}):`, insErr.message);
  const { error: delErr } = await supabase
    .from('declined_order_items').delete().eq('order_id', order.id).in('order_item_id', ids);
  if (delErr) console.error(`declineLines: could not drop copies for ${order.id}:`, delErr.message);
}

/**
 * Settle the refund a partial decline owes. A split child: re-roll the parent and
 * refund the drop in its total. An unsplit prepaid parcel: refund the declined goods.
 * `parentBefore` is the parent row read BEFORE any write. Returns { amount_paise, to } | null.
 */
async function refundDeclinedLines(order, parentBefore, lineTotal) {
  if (order.parent_order_id) {
    await rollupToParent(order.parent_order_id);
    if (!parentBefore || parentBefore.pay_status !== 'paid') return null;
    const { data: after, error } = await supabase
      .from('orders').select('total').eq('id', order.parent_order_id).maybeSingle();
    if (error || !after) {
      console.error('declineLines: parent re-read failed:', error ? error.message : 'missing');
      return null;
    }
    const drop = Math.max(0, parentBefore.total - after.total);
    if (drop <= 0) return null;
    const { error: upErr } = await supabase
      .from('orders')
      .update({ refund_amt: (parentBefore.refund_amt || 0) + drop, refund_to: parentBefore.pay_method })
      .eq('id', order.parent_order_id);
    if (upErr) console.error('declineLines: refund stamp failed:', upErr.message);
    return { amount_paise: drop, to: parentBefore.pay_method };
  }

  if (order.pay_status !== 'paid' || lineTotal <= 0) return null;
  const { error } = await supabase
    .from('orders')
    .update({ refund_amt: (order.refund_amt || 0) + lineTotal, refund_to: order.pay_method })
    .eq('id', order.id);
  if (error) console.error('declineLines: refund stamp failed:', error.message);
  return { amount_paise: lineTotal, to: order.pay_method };
}

module.exports = { declineReasonText, declineWholeParcel, moveLinesOut, restoreLines, refundDeclinedLines };
