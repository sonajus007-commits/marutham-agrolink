/**
 * Push a child order's state up onto its parent.
 *
 * A split order's parent is a container: the customer's single view of a basket
 * whose parcels each move on their own. Nothing acts on the parent directly — a VCO
 * verifies a child, an agent carries a child, a cancellation lands on a child — so
 * every one of those has to leave the parent telling the truth afterwards.
 *
 * The arithmetic and the ordering rules are pure and live in utils/orderSplit.js;
 * this is the part that reads and writes.
 */

const supabase = require('../db/supabase');
const { recalcParent } = require('./orderSplit');

/**
 * Recompute one parent from its children and write the result.
 *
 * Call it after ANY write to a child. It is deliberately safe to call with an id
 * that is not a parent (an unsplit order has no children, and rolling up nothing
 * would be meaningless) — it returns `{ skipped: true }` rather than clearing the
 * row, so callers do not each have to test whether the order they touched was part
 * of a split.
 *
 * Failure is reported, never thrown. Every caller reaches this AFTER committing the
 * change the user asked for: the parcel really did move, and turning that into an
 * error would tell an agent their scan failed when it did not. A stale parent is a
 * display bug the next child event repairs; a rejected scan is a lorry waiting.
 */
async function rollupToParent(parentId) {
  if (!parentId) return { skipped: true };

  const { data: parent, error: parentErr } = await supabase
    .from('orders')
    .select('id, code, handling, delivery, total')
    .eq('id', parentId)
    .maybeSingle();

  if (parentErr) {
    console.error(`Order rollup: could not read parent ${parentId}:`, parentErr.message);
    return { error: parentErr.message };
  }
  if (!parent) return { skipped: true };

  const { data: children, error: childErr } = await supabase
    .from('orders')
    .select('id, split_seq, seller_id, status, stage, cancelled, pay_status, item_total, market_fee, saved')
    .eq('parent_order_id', parentId);

  if (childErr) {
    console.error(`Order rollup: could not read children of ${parent.code}:`, childErr.message);
    return { error: childErr.message };
  }
  if (!children || children.length === 0) return { skipped: true };

  const { parent: parentUpdates, childTotals } = recalcParent(children, {
    handling: parent.handling,
    delivery: parent.delivery,
  });

  const now = new Date().toISOString();
  const { error: writeErr } = await supabase
    .from('orders')
    .update({ ...parentUpdates, updated_at: now })
    .eq('id', parentId);

  if (writeErr) {
    console.error(`Order rollup: could not update parent ${parent.code}:`, writeErr.message);
    return { error: writeErr.message };
  }

  /* Re-seat the order-level charges (delivery, handling, multi-vendor fee). They
   * ride on the lowest live sequence, so cancelling that parcel moves them to the
   * next one — without this the customer would stop owing a delivery fee by
   * cancelling the parcel that happened to carry it. Only rows whose total actually
   * changed are written. */
  for (const ct of childTotals) {
    // `neq` makes this a no-op for the parts whose figure has not moved, so a
    // rollup triggered by an unrelated sibling does not stamp updated_at on
    // every part of the order.
    const { error: ctErr } = await supabase
      .from('orders')
      .update({ total: ct.total, updated_at: now })
      .eq('id', ct.id)
      .neq('total', ct.total);

    if (ctErr) {
      console.error(`Order rollup: could not re-total part ${ct.id}:`, ctErr.message);
    }
  }

  return { parent: parentUpdates };
}

module.exports = { rollupToParent };
