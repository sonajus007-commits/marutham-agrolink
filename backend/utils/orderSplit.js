/**
 * Multi-vendor order splitting — the pure arithmetic and status rules.
 *
 * A cart holding produce from two or more sellers becomes one PARENT order (what
 * the customer pays for and tracks) plus one CHILD order per seller (what actually
 * moves: verified by that seller's own VCO, routed Direct or Via Hub on its own).
 * See migrations/036_order_split_parent_child.sql for the shape and the rationale.
 *
 * Everything here is pure so it can be tested without a database — the route code
 * does the reading and writing, this decides the numbers.
 */

// The rollup ladder. This is the HUB map from routes/delivery.js, which is the
// SUPERSET of both routes (direct is the same list with 'In Transit' and 'At Hub'
// skipped), so it can rank a direct child and a hub child against each other.
//
// Ranking by STATUS is the whole point: `orders.stage` is an index into the route's
// OWN map, so stage 3 means 'Picked Up' on direct and 'In Transit' on hub. Comparing
// two children by stage would silently mis-order them. Never rank children by stage.
const ROLLUP_ORDER = [
  'Order Placed',
  'Packaged',
  'VCO Verified',
  'In Transit',
  'At Hub',
  'Picked Up',
  'Out for Delivery',
  'Delivered',
];

// A parent is a container, not a parcel: no VCO verifies it and no agent carries it.
// It still needs a route whose map its `stage` indexes into, so it gets its own —
// the superset, which can hold whatever rollup status the children produce. Every
// pipeline mutation refuses a row whose route is this.
const SPLIT_ROUTE = 'split';

const rollupRank = (status) => ROLLUP_ORDER.indexOf(status);

/** Flat ₹10, charged once, when the cart spans 2+ sellers. Mirrors POST /orders. */
const MULTI_VENDOR_FEE = 1000;

/**
 * Group resolved cart items by seller, preserving the order the sellers first
 * appear in the cart — that ordering becomes split_seq, so the child codes read in
 * the same order the customer built the basket.
 *
 * Returns [{ seller_id, seller_name, village, district, items }], one per seller.
 */
function groupItemsBySeller(resolvedItems) {
  const bySeller = new Map();
  for (const item of resolvedItems) {
    let group = bySeller.get(item.farmer_id);
    if (!group) {
      group = {
        seller_id: item.farmer_id,
        seller_name: item.farmer_name,
        // Fulfilment location is the SELLER's, and now it is per child rather than
        // "whichever seller happened to be first in the cart" — that was the bug.
        village: item._sellerVillage ?? null,
        district: item._sellerDistrict ?? null,
        items: [],
      };
      bySeller.set(item.farmer_id, group);
    }
    group.items.push(item);
  }
  return [...bySeller.values()];
}

/** Per-seller money from that seller's own lines. All paise. */
function sellerTotals(items) {
  return {
    item_total: items.reduce((s, i) => s + i._lineTotal, 0),
    market_fee: items.reduce((s, i) => s + (i._lineTotal - i._lineFarmerTotal), 0),
    saved: items.reduce((s, i) => s + i._saved, 0),
  };
}

/**
 * The child code: the parent's code plus a 1-based suffix
 * (ORDPDK260724000001 → ORDPDK260724000001-1). Deliberately NOT a fresh draw from
 * the district's daily counter — the suffix shows at a glance that two parcels are
 * one customer order, and one basket does not burn several numbers out of the
 * day's sequence. It still starts with 'ORD', which is what GET /orders/:id and the
 * agent's scan bar test to tell a code from a UUID.
 */
function childCode(parentCode, seq) {
  return `${parentCode}-${seq}`;
}

/** True for a child order code; used to route a scanned code to the right row. */
function isChildCode(code) {
  return typeof code === 'string' && /-\d+$/.test(code);
}

/**
 * Allocate the charges the customer pays ONCE across the children, so that
 * sum(children.total) === parent.total exactly and a COD parcel can be collected
 * on at the door.
 *
 * All of it rides on the lowest-sequence LIVE child rather than being spread by
 * value: splitting ₹25 three ways invites rounding drift, and a delivery fee is not
 * really divisible anyway. If that child is later cancelled the charges move to the
 * next live one — which is why this is recomputed on every change rather than
 * stamped once at placement.
 *
 * `children` must already be filtered to the live (non-cancelled) ones, ordered by
 * split_seq. Returns a Map of child index → order-level charge in paise.
 */
function allocateOrderCharges(children, orderCharges) {
  const alloc = new Map();
  children.forEach((_, i) => alloc.set(i, 0));
  if (children.length > 0) alloc.set(0, orderCharges);
  return alloc;
}

/**
 * Roll the live children up into the parent's headline status.
 *
 * The parent is only as far along as its LEAST advanced live parcel: while one
 * seller's goods are still being packaged the customer's order is not "out for
 * delivery", whatever the other parcel is doing. All live children Delivered is
 * therefore the only way a parent reads Delivered, which falls out of taking the
 * minimum.
 *
 * Cancelled children are ignored — a scrapped parcel must not hold the order at
 * 'Order Placed' forever. If EVERY child is cancelled the parent is cancelled too.
 */
function rollupStatus(children) {
  const live = children.filter((c) => !c.cancelled);
  if (live.length === 0) return { status: 'Cancelled', stage: 0, allCancelled: true };

  let least = live[0].status;
  for (const child of live) {
    // An unknown status ranks -1, which would win the minimum and drag the parent
    // back to nothing. Rank it as "not yet started" instead so it still holds the
    // parent back without erasing the ladder.
    const rank = rollupRank(child.status);
    if (rank < 0) return { status: ROLLUP_ORDER[0], stage: 0, allCancelled: false };
    if (rank < rollupRank(least)) least = child.status;
  }

  return { status: least, stage: rollupRank(least), allCancelled: false };
}

/**
 * The parent's payment state rolled up from its live children. COD is collected
 * parcel by parcel, so an order with two parcels is only fully paid once BOTH have
 * been handed over; until then it is still 'pending'. Prepaid orders are marked
 * paid at placement on every row and roll up to paid immediately.
 */
function rollupPayStatus(children) {
  const live = children.filter((c) => !c.cancelled);
  if (live.length === 0) return 'pending';
  return live.every((c) => c.pay_status === 'paid') ? 'paid' : 'pending';
}

/**
 * Recompute a parent's money and status from its children. Pure: takes the child
 * rows, returns the fields to write on the parent and on each child.
 *
 * `original` carries the charges as first quoted — delivery and handling are NOT
 * recomputed from the surviving basket. A cancellation must never make the bill go
 * up, and re-running the free-delivery threshold on a smaller basket would do
 * exactly that: drop below ₹150 by cancelling one seller and the customer suddenly
 * owes ₹25 they were never quoted. The multi-vendor fee is the one exception — it
 * exists only because the cart spanned sellers, so it is dropped when it no longer
 * does, which can only ever reduce the total.
 */
function recalcParent(children, original) {
  const ordered = [...children].sort((a, b) => (a.split_seq || 0) - (b.split_seq || 0));
  const live = ordered.filter((c) => !c.cancelled);

  const item_total = live.reduce((s, c) => s + (c.item_total || 0), 0);
  const market_fee = live.reduce((s, c) => s + (c.market_fee || 0), 0);
  const saved = live.reduce((s, c) => s + (c.saved || 0), 0);

  const distinctSellers = new Set(live.map((c) => c.seller_id)).size;
  const multiVendorFee = distinctSellers >= 2 ? MULTI_VENDOR_FEE : 0;

  // Nothing left to deliver: no delivery or handling is owed on an order that will
  // never arrive.
  const handling = live.length > 0 ? original.handling : 0;
  const delivery = live.length > 0 ? original.delivery : 0;

  const orderCharges = handling + delivery + multiVendorFee;
  const alloc = allocateOrderCharges(live, orderCharges);

  const { status, stage, allCancelled } = rollupStatus(ordered);

  return {
    parent: {
      item_total,
      market_fee,
      saved,
      handling,
      delivery,
      total: item_total + orderCharges,
      status,
      stage,
      cancelled: allCancelled,
      pay_status: rollupPayStatus(ordered),
    },
    // Only the live children are re-totalled; a cancelled child keeps the figures it
    // was cancelled at, which is what the refund was calculated from.
    childTotals: live.map((c, i) => ({
      id: c.id,
      total: (c.item_total || 0) + alloc.get(i),
      order_charges: alloc.get(i),
    })),
  };
}

module.exports = {
  ROLLUP_ORDER,
  SPLIT_ROUTE,
  MULTI_VENDOR_FEE,
  rollupRank,
  groupItemsBySeller,
  sellerTotals,
  childCode,
  isChildCode,
  allocateOrderCharges,
  rollupStatus,
  rollupPayStatus,
  recalcParent,
};
