// ── Cancel one or more parcels (child or unsplit orders) + settle the refund ──
//
// Shared by the seller-decline endpoint and the acceptance-deadline sweep. It is
// the SAME cancel/restock/refund shape the consumer/admin route (POST /orders/:id/
// cancel) performs, factored out so the automatic paths cannot drift from it.
//
// Scope: each element of `parcels` is a standalone order — an unsplit order, or a
// CHILD of a split order. It is NOT for cancelling a split PARENT (that route marks
// the parent row itself and cancels every child together); pass the children here.
//
// `sellerFault` marks a cancellation the seller caused (missed acceptance, or an
// explicit decline). Those lower the seller's reliability (users.orders_cancelled),
// which demotes their offers in the consumer's initial view.

const supabase = require('../db/supabase');
const { rollupToParent } = require('./orderRollup');
const { bumpCancelled } = require('./reliability');

// Restore the quantity each cancelled line took, and undo an auto-unlist caused by
// that same line hitting zero — the mirror of the decrement at placement. Best
// effort: the cancellation is already committed, so a restock miss is logged, not
// thrown. Returns the seller ids touched (for the reliability bump on unsplit orders,
// which carry no seller_id column of their own).
async function restockParcel(orderId) {
  const sellerIds = new Set();
  const { data: items, error } = await supabase
    .from('order_items')
    .select('farmer_id, product_id, qty')
    .eq('order_id', orderId);

  if (error) {
    console.error(`cancelOrders: could not read items for ${orderId}: ${error.message}`);
    return sellerIds;
  }

  for (const item of items || []) {
    if (item.farmer_id) sellerIds.add(item.farmer_id);
    const { data: listing, error: readErr } = await supabase
      .from('farmer_listings')
      .select('qty_available, listed')
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id)
      .maybeSingle();

    if (readErr || !listing) {
      console.error(`cancelOrders: restock read miss ${item.product_id}/${item.farmer_id}: ` +
                    `${readErr ? readErr.message : 'no listing'}`);
      continue;
    }

    const restock = { qty_available: listing.qty_available + item.qty };
    if (listing.qty_available === 0 && !listing.listed) restock.listed = true;

    const { error: writeErr } = await supabase
      .from('farmer_listings')
      .update(restock)
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id);
    if (writeErr) console.error(`cancelOrders: restock write miss ${item.product_id}: ${writeErr.message}`);
  }
  return sellerIds;
}

// Refund settlement, identical in shape to the cancel route: a child re-prices its
// parent and the customer is owed the DROP (accumulated across parts); an unsplit
// paid order is refunded in full. Returns { amount_paise, to } or null.
async function settleRefund(parcel) {
  if (parcel.parent_order_id) {
    const { data: before, error: beforeErr } = await supabase
      .from('orders')
      .select('total, pay_status, pay_method, refund_amt')
      .eq('id', parcel.parent_order_id)
      .maybeSingle();
    if (beforeErr) console.error('cancelOrders: parent re-price read failed:', beforeErr.message);

    await rollupToParent(parcel.parent_order_id);

    const { data: after, error: afterErr } = await supabase
      .from('orders')
      .select('total')
      .eq('id', parcel.parent_order_id)
      .maybeSingle();
    if (afterErr) console.error('cancelOrders: parent re-price read failed:', afterErr.message);

    if (before && after && before.pay_status === 'paid') {
      const drop = Math.max(0, before.total - after.total);
      if (drop > 0) {
        const { error } = await supabase
          .from('orders')
          .update({ refund_amt: (before.refund_amt || 0) + drop, refund_to: before.pay_method })
          .eq('id', parcel.parent_order_id);
        if (error) console.error('cancelOrders: refund stamp failed:', error.message);
        return { amount_paise: drop, to: before.pay_method };
      }
    }
    return null;
  }

  if (parcel.pay_status === 'paid') {
    const { error } = await supabase
      .from('orders')
      .update({ refund_amt: parcel.total, refund_to: parcel.pay_method })
      .eq('id', parcel.id);
    if (error) console.error('cancelOrders: refund stamp failed:', error.message);
    return { amount_paise: parcel.total, to: parcel.pay_method };
  }
  return null;
}

/**
 * Cancel each parcel (child or unsplit order), restock, settle refunds, and — when
 * sellerFault — lower the seller's reliability.
 * @param {object[]} parcels order rows to cancel (already-cancelled rows are skipped)
 * @param {object} opts
 * @param {string} opts.reason        cancel_reason stored on the row + timeline note
 * @param {boolean} [opts.sellerFault] the seller caused it (decline / missed acceptance)
 * @returns {Promise<{cancelled: string[], refunds: object[]}>}
 */
async function cancelOrders(parcels, { reason, sellerFault = false } = {}) {
  const now = new Date().toISOString();
  const cancelled = [];
  const refunds = [];

  for (const parcel of parcels) {
    if (!parcel || parcel.cancelled) continue;

    const { error: upErr } = await supabase
      .from('orders')
      .update({ cancelled: true, cancel_reason: reason || null, cancelled_at: now, status: 'Cancelled', updated_at: now })
      .eq('id', parcel.id);
    if (upErr) {
      console.error(`cancelOrders: could not cancel ${parcel.id}: ${upErr.message}`);
      continue;
    }

    const { error: histErr } = await supabase
      .from('order_history')
      .insert({ order_id: parcel.id, label: 'Cancelled', note: reason || 'Cancelled.' });
    if (histErr) console.error(`cancelOrders: history entry failed for ${parcel.id}: ${histErr.message}`);

    const sellerIds = await restockParcel(parcel.id);
    const refund = await settleRefund(parcel);
    if (refund) refunds.push({ order_id: parcel.id, ...refund });

    if (sellerFault) {
      // A child carries seller_id directly; an unsplit order's seller comes from its
      // (single-seller) lines, gathered during restock.
      const seller = parcel.seller_id || [...sellerIds][0];
      await bumpCancelled(seller);
    }

    cancelled.push(parcel.id);
  }

  return { cancelled, refunds };
}

module.exports = { cancelOrders };
