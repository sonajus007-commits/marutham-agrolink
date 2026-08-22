/**
 * Backfill orders.pickup_hub_id / orders.delivery_hub_id (Hub Management, Phase 2).
 *
 *   node backend/db/backfill_order_hubs.js            # apply
 *   node backend/db/backfill_order_hubs.js --dry-run  # report only, write nothing
 *
 * New orders are stamped at checkout (routes/orders.js); this fills rows that
 * predate that. Idempotent and re-runnable — it only touches rows whose hub column
 * is still NULL, and resolving is the same lookup as checkout (utils/hubResolver).
 *
 * Attribution rules (mirror the checkout path exactly):
 *   • delivery_hub_id — the consumer's delivery taluk hub. The order's own
 *     delivery_address wins (it may ship to another taluk); else the consumer's
 *     profile taluk.
 *   • pickup_hub_id — the SELLER's taluk hub, by order shape:
 *       – a split PARENT (route='split') has many sellers → left NULL, as at checkout;
 *       – a child (parent_order_id set) → its seller_id's taluk hub;
 *       – an unsplit order → the taluk hub of the seller on its first order_item.
 *
 * Best-effort: a row we cannot resolve (missing taluk, no hub for that taluk) is
 * left NULL and counted — attribution is reporting metadata, never a gate.
 */
require('dotenv').config();
const supabase = require('./supabase');
const { resolveTalukHubId } = require('../utils/hubResolver');
const { SPLIT_ROUTE } = require('../utils/orderSplit');

const DRY_RUN = process.argv.includes('--dry-run');

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(`FAIL  ${label}: ${error.message}`);
    process.exit(1);
  }
  return data;
}

/** Read every row of a query, paged. */
async function fetchAllOrders(columns) {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const rows = await must(
      `orders page ${from}`,
      supabase.from('orders').select(columns).range(from, from + pageSize - 1),
    );
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function main() {
  console.log(`Backfilling order → hub attribution${DRY_RUN ? '  (DRY RUN)' : ''}…`);

  const orders = await fetchAllOrders(
    'id, code, parent_order_id, route, seller_id, consumer_id, ' +
      'district, delivery_address, pickup_hub_id, delivery_hub_id',
  );

  // Small caches so a run costs one lookup per distinct user / location, not per row.
  const userCache = new Map();   // user id → { state, district, taluk } | null
  const hubCache = new Map();    // `${state}|${district}|${taluk}` → hub id | null

  async function getUser(id) {
    if (!id) return null;
    if (userCache.has(id)) return userCache.get(id);
    const rows = await must(
      `user ${id}`,
      supabase.from('users').select('state, district, taluk').eq('id', id).limit(1),
    );
    const u = rows && rows[0] ? rows[0] : null;
    userCache.set(id, u);
    return u;
  }

  async function hubFor(loc) {
    if (!loc || !loc.state || !loc.district || !loc.taluk) return null;
    const key = `${loc.state}|${loc.district}|${loc.taluk}`;
    if (hubCache.has(key)) return hubCache.get(key);
    const id = await resolveTalukHubId(supabase, loc);
    hubCache.set(key, id);
    return id;
  }

  // The seller on an unsplit order lives on its items; fetch first-item farmer lazily.
  async function unsplitSellerId(orderId) {
    const rows = await must(
      `order_items ${orderId}`,
      supabase.from('order_items').select('farmer_id').eq('order_id', orderId).limit(1),
    );
    return rows && rows[0] ? rows[0].farmer_id : null;
  }

  const stats = {
    scanned: orders.length,
    updated: 0,
    pickupSet: 0,
    deliverySet: 0,
    pickupUnresolved: 0,
    deliveryUnresolved: 0,
    splitParents: 0,
    alreadyDone: 0,
  };

  for (const o of orders) {
    const patch = {};

    // ── delivery hub ─────────────────────────────────────────────────────────
    if (!o.delivery_hub_id) {
      const da = o.delivery_address || {};
      let loc = da.state && da.district && da.taluk
        ? { state: da.state, district: da.district, taluk: da.taluk }
        : null;
      if (!loc) loc = await getUser(o.consumer_id);
      const id = await hubFor(loc);
      if (id) { patch.delivery_hub_id = id; stats.deliverySet++; }
      else stats.deliveryUnresolved++;
    }

    // ── pickup hub ───────────────────────────────────────────────────────────
    const isSplitParent = !o.parent_order_id && o.route === SPLIT_ROUTE;
    if (isSplitParent) {
      stats.splitParents++; // no single seller — stays NULL, as at checkout
    } else if (!o.pickup_hub_id) {
      const sellerId = o.parent_order_id ? o.seller_id : await unsplitSellerId(o.id);
      const seller = await getUser(sellerId);
      const id = await hubFor(seller);
      if (id) { patch.pickup_hub_id = id; stats.pickupSet++; }
      else stats.pickupUnresolved++;
    }

    if (Object.keys(patch).length === 0) {
      if (o.pickup_hub_id && o.delivery_hub_id) stats.alreadyDone++;
      continue;
    }

    if (!DRY_RUN) {
      await must(`update order ${o.code}`, supabase.from('orders').update(patch).eq('id', o.id));
    }
    stats.updated++;
  }

  console.log('\nDone.');
  console.log(`  scanned            ${stats.scanned}`);
  console.log(`  rows ${DRY_RUN ? 'to update' : 'updated  '}       ${stats.updated}`);
  console.log(`  pickup hub set     ${stats.pickupSet}`);
  console.log(`  delivery hub set   ${stats.deliverySet}`);
  console.log(`  split parents      ${stats.splitParents}   (pickup left NULL by design)`);
  console.log(`  pickup unresolved  ${stats.pickupUnresolved}`);
  console.log(`  delivery unresolved${stats.deliveryUnresolved}`);
  if (DRY_RUN) console.log('\n(DRY RUN — nothing was written.)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
