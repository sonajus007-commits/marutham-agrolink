// POST /orders/:id/scan — proof-of-delivery location capture (phase 1 of geolocation).
// Server closed in afterEach, never inline: a failing assertion would otherwise leak
// the listener and hang `node --test` (see project_route_tests).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const AGENT = { id: 'a1', role: 'admin', admin_role: 'Delivery Agent', fname: 'Agent' };
const CONSUMER = { id: 'c1', role: 'consumer', fname: 'Cust' };

// A direct-route order one scan away from Delivered (stage 4 → 5).
function outForDelivery(extra = {}) {
  return {
    id: 'o1',
    code: 'ORD1',
    stage: 4,
    status: 'Out for Delivery',
    route: 'direct',
    cancelled: false,
    pay_method: 'UPI',
    ...extra,
  };
}

function dbFor(order) {
  return fakeSupabase({
    'orders:select': { data: [order] },
    'orders:update': { data: { id: 'o1', status: 'Delivered' } },
  });
}

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('scan to Delivered stores the delivery coordinates', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { lat: 10.5, lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Delivered');
  assert.equal(update.delivered_lat, 10.5);
  assert.equal(update.delivered_lng, 78.8);
  assert.ok(update.delivered_at, 'delivered_at is still set');
});

test('delivery without coordinates still succeeds and writes no lat/lng', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Delivered');
  assert.ok(update.delivered_at);
  assert.ok(!('delivered_lat' in update), 'no lat when none was sent');
  assert.ok(!('delivered_lng' in update), 'no lng when none was sent');
});

test('malformed coordinates are a 400, and nothing is written', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { lat: 999, lng: 78.8 });

  assert.equal(res.status, 400);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('coordinates on a non-final scan are ignored (only stored on delivery)', async () => {
  // stage 3 (Picked Up) → 4 (Out for Delivery): not the Delivered transition.
  const db = dbFor(outForDelivery({ stage: 3, status: 'Picked Up' }));
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { lat: 10.5, lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.notEqual(update.status, 'Delivered');
  assert.ok(!('delivered_lat' in update), 'lat is not written before delivery');
});

test('a consumer cannot scan', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
  const res = await app.post('/o1/scan', { lat: 10.5, lng: 78.8 });
  assert.equal(res.status, 403);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

// ── Geofencing ────────────────────────────────────────────────────────────────
// The order carries a pinned delivery address; delivery compares the agent's fix
// to it and stores the distance, flagging deliveries beyond the geofence radius.
const PINNED = { delivery_address: { village_town: 'Illupur', lat: 10.5, lng: 78.8 } };

test('a delivery near the pin stores a small distance and adds no off-site note', async () => {
  const db = dbFor(outForDelivery(PINNED));
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  // ~110 m north of the pin — inside the 500 m geofence.
  const res = await app.post('/o1/scan', { lat: 10.501, lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.ok(update.delivery_distance_m < 500, `near delivery, got ${update.delivery_distance_m}`);
  const notes = db.callsTo('order_history', 'insert').map((c) => c.payload.label);
  assert.ok(!notes.includes('Off-site delivery'), 'no off-site note within the geofence');
});

test('a delivery far from the pin stores the distance and flags it off-site', async () => {
  const db = dbFor(outForDelivery(PINNED));
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  // ~1.1 km north of the pin — outside the geofence.
  const res = await app.post('/o1/scan', { lat: 10.51, lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.ok(update.delivery_distance_m > 500, `far delivery, got ${update.delivery_distance_m}`);
  const notes = db.callsTo('order_history', 'insert').map((c) => c.payload.label);
  assert.ok(notes.includes('Off-site delivery'), 'an off-site note is added beyond the geofence');
});

test('a delivery on an order with no pinned address stores no distance', async () => {
  const db = dbFor(outForDelivery()); // no delivery_address
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { lat: 10.5, lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.ok(!('delivery_distance_m' in update), 'nothing to compare against → no distance');
});

// ── VCO verify location ─────────────────────────────────────────────────────────
// Verifying a Packaged order (stage 1 → VCO Verified) stamps the VCO's location.
const VCO = { id: 'v1', role: 'admin', admin_role: 'VCO', fname: 'Vco' };

function packaged() {
  return { id: 'o1', code: 'ORD1', stage: 1, status: 'Packaged', cancelled: false, pay_method: 'UPI' };
}

test('VCO verify stores the collection location as verified_lat/lng', async () => {
  const db = fakeSupabase({
    'orders:select': { data: [packaged()] },
    'orders:update': { data: { id: 'o1', status: 'VCO Verified' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: VCO });
  const res = await app.post('/o1/scan', { lat: 10.5, lng: 78.8, route: 'direct' });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'VCO Verified');
  assert.equal(update.verified_lat, 10.5);
  assert.equal(update.verified_lng, 78.8);
});

test('VCO verify without a location still succeeds and stores no coordinates', async () => {
  const db = fakeSupabase({
    'orders:select': { data: [packaged()] },
    'orders:update': { data: { id: 'o1', status: 'VCO Verified' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: VCO });
  const res = await app.post('/o1/scan', { route: 'direct' });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.ok(!('verified_lat' in update), 'no lat when none was sent');
});

// ── The hub lane ────────────────────────────────────────────────────────────────
// The hub map is  … VCO Verified(2) → In Transit(3) → At Hub(4) → Picked Up(5) →
// Out for Delivery(6) → Delivered(7). Note 'Picked Up' sits AFTER 'At Hub' here and
// at 3 on the direct map, so stage NUMBERS are not comparable across routes — the
// scan branches key off the status for exactly that reason.
const HUB = { id: 'h1', role: 'admin', admin_role: 'Hub Incharge', fname: 'Hub' };

function inTransit() {
  return { id: 'o1', code: 'ORD1', stage: 3, status: 'In Transit', route: 'hub', cancelled: false, pay_method: 'UPI' };
}

function atHub(extra = {}) {
  return { id: 'o1', code: 'ORD1', stage: 4, status: 'At Hub', route: 'hub', cancelled: false, pay_method: 'UPI', ...extra };
}

test('the Hub Incharge accepts an In Transit order into the hub', async () => {
  const db = fakeSupabase({
    'orders:select': { data: [inTransit()] },
    'orders:update': { data: { id: 'o1', status: 'At Hub' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: HUB });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 200);
  assert.equal(db.callsTo('orders', 'update')[0].payload.status, 'At Hub');
});

// Accepting a parcel into a hub is a custody claim. An agent must not be able to
// book an order into a hub they are not standing in.
test('a Delivery Agent cannot accept an order into the hub', async () => {
  const db = fakeSupabase({ 'orders:select': { data: [inTransit()] } });
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 403);
  assert.match(res.body.error, /Hub Incharge/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('hub pickup stores the hub location as dispatched_lat/lng', async () => {
  const db = fakeSupabase({
    'orders:select': { data: [atHub()] },
    'orders:update': { data: { id: 'o1', status: 'Picked Up' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { lat: 10.5, lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Picked Up');
  assert.equal(update.dispatched_lat, 10.5);
  assert.equal(update.dispatched_lng, 78.8);
});

test('hub pickup without a location still succeeds and stores no coordinates', async () => {
  const db = fakeSupabase({
    'orders:select': { data: [atHub()] },
    'orders:update': { data: { id: 'o1', status: 'Picked Up' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.ok(!('dispatched_lat' in update), 'no lat when none was sent');
});

// The Hub Incharge names the agent via POST /assign, which does not move the status.
// Another agent walking past must not be able to take the parcel off them.
test('an agent cannot pick up an order assigned to a different agent', async () => {
  const db = fakeSupabase({ 'orders:select': { data: [atHub({ agent_id: 'someone-else' })] } });
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 403);
  assert.match(res.body.error, /another Delivery Agent/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

// A hub-bound parcel is a bulk movement to the hub; the last mile is assigned later.
// Claiming the scanner as its agent here would put the wrong name on the order.
test('a hub-routed order leaving the village does not claim the scanner as its agent', async () => {
  const verified = {
    id: 'o1', code: 'ORD1', stage: 2, status: 'VCO Verified', route: 'hub',
    cancelled: false, pay_method: 'UPI',
  };
  const db = fakeSupabase({
    'orders:select': { data: [verified] },
    'orders:update': { data: { id: 'o1', status: 'In Transit' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'In Transit');
  assert.ok(!('agent_id' in update), 'the hub assigns the agent, not this scan');
});

// ── from_stage: the guard that makes a DELAYED scan safe ────────────────────────
// A scan means "advance one from wherever this order is now", so a write parked
// offline and replayed later does not repeat the intended transition — it performs
// whichever one the order happens to be sitting on. `from_stage` states the stage the
// user was looking at, and the server refuses (409) if the order has moved. The
// offline queue drops a 4xx rather than retrying, so a superseded write dies here.

test('from_stage matching the order stage proceeds normally', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { from_stage: 4 });

  assert.equal(res.status, 200);
  assert.equal(db.callsTo('orders', 'update')[0].payload.status, 'Delivered');
});

test('a scan with no from_stage still works — the guard is opt-in', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 200);
});

test('a stale from_stage is refused with 409 and writes nothing', async () => {
  // Queued while the order was Picked Up (3); by replay time it is Out for Delivery (4).
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { from_stage: 3 });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /already moved on/);
  assert.equal(res.body.currentStatus, 'Out for Delivery');
  assert.equal(db.callsTo('orders', 'update').length, 0, 'the order must not be touched');
});

test('a non-integer from_stage is rejected as a bad request', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { from_stage: 'four' });

  assert.equal(res.status, 400);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

// THE ONE THAT MATTERS. A hub pickup (stage 5) replayed after the order reached
// Out for Delivery (6) no longer matches the branch it was written for — it lands on
// the Out-for-Delivery branch, which advances to Delivered, and advanceStage marks a
// COD order PAID on delivery. That is cash recorded as collected that nobody
// collected. from_stage is what stops it.
test('a hub pickup replayed one stage late cannot deliver a COD order', async () => {
  const movedOn = {
    id: 'o1', code: 'ORD1', stage: 6, status: 'Out for Delivery', route: 'hub',
    cancelled: false, pay_method: 'Cash on Delivery',
  };
  const db = fakeSupabase({
    'orders:select': { data: [movedOn] },
    'orders:update': { data: { id: 'o1', status: 'Delivered' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: HUB });
  const res = await app.post('/o1/scan', { from_stage: 5, agent_id: 'a1' });

  assert.equal(res.status, 409);
  assert.equal(db.callsTo('orders', 'update').length, 0, 'no delivery, and no cash marked paid');
});

// ── Compare-and-swap: the guard that makes a CONCURRENT scan safe ───────────────
// from_stage closes the gap between the user looking and the request arriving. This
// closes the gap between the route's own read and its write.

test('the stage update is pinned to the stage that was read', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  await app.post('/o1/scan', {});

  const { filters } = db.callsTo('orders', 'update')[0];
  assert.ok(
    filters.some(([op, col, val]) => op === 'eq' && col === 'stage' && val === 4),
    'the update must compare-and-swap on stage, or two scanners each advance it',
  );
});

test('losing the compare-and-swap answers 409, not a false success', async () => {
  // The update matches no row: someone else advanced the order in between.
  const db = fakeSupabase({
    'orders:select': { data: [outForDelivery()] },
    'orders:update': { data: [] },
  });
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 409);
  assert.match(res.body.error, /updated by someone else/);
});

// ── POST /:id/pack — the seller marks their order Packaged ──────────────────────
// The ONE status action a farmer owns: Order Placed (stage 0) → Packaged. The route
// re-checks farmer role, stage 0, and that the seller actually has items on the
// order — the UI button is only a mirror of these three guards.
const FARMER = { id: 'f1', role: 'farmer', fname: 'Murugan' };

function placed(extra = {}) {
  return {
    id: 'o1',
    code: 'ORD1',
    stage: 0,
    status: 'Order Placed',
    route: 'direct',
    cancelled: false,
    pay_method: 'UPI',
    ...extra,
  };
}

function packDb(order, items = [{ id: 'i1' }]) {
  return fakeSupabase({
    'orders:select': { data: [order] },
    'order_items:select': { data: items },
    'orders:update': { data: { id: 'o1', status: 'Packaged', stage: 1 } },
  });
}

test('a farmer with items packs a stage-0 order → Packaged', async () => {
  const db = packDb(placed());
  app = await mountRoute('delivery', { supabase: db, user: FARMER });
  const res = await app.post('/o1/pack', {});

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Packaged');
  assert.equal(update.stage, 1);
});

test('a non-farmer cannot pack, and nothing is written', async () => {
  const db = packDb(placed());
  app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
  const res = await app.post('/o1/pack', {});

  assert.equal(res.status, 403);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('packing is refused once the order has left stage 0', async () => {
  const db = packDb(placed({ stage: 2, status: 'VCO Verified' }));
  app = await mountRoute('delivery', { supabase: db, user: FARMER });
  const res = await app.post('/o1/pack', {});

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Cannot pack/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('a farmer with no items on the order cannot pack it', async () => {
  const db = packDb(placed(), []); // this seller has no line on the order
  app = await mountRoute('delivery', { supabase: db, user: FARMER });
  const res = await app.post('/o1/pack', {});

  assert.equal(res.status, 403);
  assert.match(res.body.error, /no items/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

// ── POST /:id/status — senior-admin manual override to ANY status ───────────────
// Unlike a scan or /advance (one step forward), this SETS the order to any status
// on its route — forward, backward, or a jump. Restricted to senior admins,
// validated against the order's route, and it keeps the delivery/pickup stamps
// consistent with the target.
const HO = { id: 'h9', role: 'admin', admin_role: 'Head Office', fname: 'Lakshmi' };

function statusDb(order, updated = { id: 'o1' }) {
  return fakeSupabase({
    'orders:select': { data: [order] },
    'orders:update': { data: updated },
  });
}

test('a senior admin can jump an order forward to any status on its route', async () => {
  const db = statusDb(placed({ stage: 1, status: 'Packaged' }));
  app = await mountRoute('delivery', { supabase: db, user: HO });
  const res = await app.post('/o1/status', { status: 'Picked Up' });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Picked Up');
  assert.equal(update.stage, 3); // a jump of two stages, which /advance could not do
});

test('moving to Delivered stamps delivered_at and banks a COD order', async () => {
  const order = placed({ stage: 4, status: 'Out for Delivery', pay_method: 'Cash on Delivery' });
  const db = statusDb(order);
  app = await mountRoute('delivery', { supabase: db, user: HO });
  const res = await app.post('/o1/status', { status: 'Delivered' });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Delivered');
  assert.ok(update.delivered_at, 'delivered_at is stamped');
  assert.equal(update.pay_status, 'paid', 'a COD order is marked paid on delivery');
});

test('reversing out of Delivered clears the delivery stamp', async () => {
  const db = statusDb(placed({ stage: 5, status: 'Delivered' }));
  app = await mountRoute('delivery', { supabase: db, user: HO });
  const res = await app.post('/o1/status', { status: 'Packaged' });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Packaged');
  assert.ok('delivered_at' in update && update.delivered_at === null, 'delivered_at is cleared');
  assert.equal(update.delivered_lat, null);
});

test('a hub-only status is rejected for a direct-route order, and nothing is written', async () => {
  const db = statusDb(placed({ stage: 1, status: 'Packaged' }));
  app = await mountRoute('delivery', { supabase: db, user: HO });
  const res = await app.post('/o1/status', { status: 'At Hub' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /not a valid status/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('setting the status the order is already at is a 400', async () => {
  const db = statusDb(placed({ stage: 1, status: 'Packaged' }));
  app = await mountRoute('delivery', { supabase: db, user: HO });
  const res = await app.post('/o1/status', { status: 'Packaged' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /already/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('a cancelled order cannot be moved by the override, and nothing is written', async () => {
  const db = statusDb(placed({ stage: 1, status: 'Packaged', cancelled: true }));
  app = await mountRoute('delivery', { supabase: db, user: HO });
  const res = await app.post('/o1/status', { status: 'Delivered' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /cancelled/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('a non-senior admin (Delivery Agent) cannot set status, and nothing is written', async () => {
  const db = statusDb(placed({ stage: 1, status: 'Packaged' }));
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/status', { status: 'Delivered' });

  assert.equal(res.status, 403);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('a missing target status is a 400 before any query runs', async () => {
  const db = statusDb(placed());
  app = await mountRoute('delivery', { supabase: db, user: HO });
  const res = await app.post('/o1/status', {});

  assert.equal(res.status, 400);
  assert.match(res.body.error, /required/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

// ── POST /:id/confirm-received — the customer confirms receipt → Delivered ──────
// The ONE status action a consumer owns: an Out-for-Delivery order they own can be
// confirmed received, which completes it and unlocks rating. Server re-checks role,
// ownership, and that the order is actually Out for Delivery.

test('a customer confirms receipt of their Out-for-Delivery order → Delivered', async () => {
  const db = dbFor(outForDelivery({ consumer_id: 'c1' })); // CONSUMER.id === 'c1'
  app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
  const res = await app.post('/o1/confirm-received', {});

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Delivered');
  assert.ok(update.delivered_at, 'delivered_at is stamped');
});

test('a delivery agent cannot confirm receipt, and nothing is written', async () => {
  const db = dbFor(outForDelivery({ consumer_id: 'c1' }));
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/confirm-received', {});

  assert.equal(res.status, 403);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('a customer cannot confirm someone else’s order', async () => {
  const db = dbFor(outForDelivery({ consumer_id: 'someone-else' }));
  app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
  const res = await app.post('/o1/confirm-received', {});

  assert.equal(res.status, 403);
  assert.match(res.body.error, /your own/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('confirmation is refused before the order is Out for Delivery', async () => {
  const db = dbFor(outForDelivery({ consumer_id: 'c1', stage: 3, status: 'Picked Up' }));
  app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
  const res = await app.post('/o1/confirm-received', {});

  assert.equal(res.status, 400);
  assert.match(res.body.error, /Cannot confirm receipt yet/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

// ── PATCH /route — the stage must be re-derived, not left dangling ──────────────
// `stage` is an index into the ROUTE'S OWN map, and the two maps disagree about what
// an index means ('Picked Up' is 3 on direct, 5 on hub). Writing `route` alone would
// leave the stage pointing at a different status than the order is actually in —
// silently relabelling it without anything having moved.

// Rerouting hub↔direct is the Delivery Assignment authority — Hub Incharge (+ Admin)
// under the RBAC matrix; the tiered managers are view-only here.
const SENIOR = { id: 's1', role: 'admin', admin_role: 'Hub Incharge', fname: 'Hub' };

test('switching a Picked Up order to the hub route re-derives its stage', async () => {
  const pickedUpDirect = {
    id: 'o1', code: 'ORD1', stage: 3, status: 'Picked Up', route: 'direct',
    cancelled: false, pay_method: 'UPI',
  };
  const db = fakeSupabase({
    'orders:select': { data: [pickedUpDirect] },
    'orders:update': { data: { id: 'o1', route: 'hub' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: SENIOR });
  const res = await app.patch('/o1/route', { route: 'hub' });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.route, 'hub');
  // 'Picked Up' is index 5 on the hub map — NOT the 3 it was on direct.
  assert.equal(update.stage, 5, 'the stage must follow the status into the new map');
});

test('an At Hub order cannot be switched to the direct route', async () => {
  const db = fakeSupabase({ 'orders:select': { data: [atHub()] } });
  app = await mountRoute('delivery', { supabase: db, user: SENIOR });
  const res = await app.patch('/o1/route', { route: 'direct' });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /cannot be switched/);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

// ── eligible-agents: VCO as a nearby delivery agent ───────────────────────────
// The delivery leg offers Delivery Agents (district-wide fallback) PLUS VCOs
// flagged can_deliver, but only where that VCO's service_areas actually cover the
// delivery village (nearby only). A plain VCO (no flag) is never offered, and a
// non-management/other role never enters the pool.
const REQ = { id: 'req1', role: 'admin', admin_role: 'VCO', fname: 'Requester' };

function eligibleDb() {
  const order = {
    id: 'o1',
    district: 'Pudukkottai',
    delivery_village: 'Alangudi',
    village: 'Alangudi',
    delivery_address: {},
  };
  const users = [
    { id: 'da1', fname: 'DA', admin_role: 'Delivery Agent', can_deliver: false,
      district: 'Pudukkottai', status: 'active', service_villages: ['Alangudi'], service_areas: [] },
    { id: 'vco_cov', fname: 'VcoCover', admin_role: 'VCO', can_deliver: true,
      district: 'Pudukkottai', status: 'active', service_villages: ['Alangudi'], service_areas: [] },
    { id: 'vco_far', fname: 'VcoFar', admin_role: 'VCO', can_deliver: true,
      district: 'Pudukkottai', status: 'active', service_villages: ['Somewhere'], service_areas: [] },
    { id: 'vco_plain', fname: 'VcoPlain', admin_role: 'VCO', can_deliver: false,
      district: 'Pudukkottai', status: 'active', service_villages: ['Alangudi'], service_areas: [] },
    { id: 'hub1', fname: 'Hub', admin_role: 'Hub Incharge', can_deliver: false,
      district: 'Pudukkottai', status: 'active', service_villages: ['Alangudi'], service_areas: [] },
  ];
  return fakeSupabase({ 'orders:select': { data: [order] }, 'users:select': { data: users } });
}

test('eligible-agents (delivery): a covering can_deliver VCO is offered, a far one is not', async () => {
  const db = eligibleDb();
  app = await mountRoute('delivery', { supabase: db, user: REQ });
  const res = await app.get('/o1/eligible-agents?leg=delivery');

  assert.equal(res.status, 200);
  const ids = res.body.all.map((a) => a.id).sort();
  // DA (fallback) + the covering can_deliver VCO — and nobody else.
  assert.deepEqual(ids, ['da1', 'vco_cov']);
  const matchedIds = res.body.matched.map((a) => a.id).sort();
  assert.deepEqual(matchedIds, ['da1', 'vco_cov']);
});

test('eligible-agents: a plain VCO (no can_deliver) is never offered for delivery', async () => {
  const db = eligibleDb();
  app = await mountRoute('delivery', { supabase: db, user: REQ });
  const res = await app.get('/o1/eligible-agents?leg=delivery');

  const ids = res.body.all.map((a) => a.id);
  assert.ok(!ids.includes('vco_plain'), 'a VCO without the flag must not appear');
  assert.ok(!ids.includes('hub1'), 'a non delivery/VCO role must not appear');
});

test('eligible-agents (collection): VCOs are never offered — Delivery Agents only', async () => {
  const db = eligibleDb();
  app = await mountRoute('delivery', { supabase: db, user: REQ });
  const res = await app.get('/o1/eligible-agents?leg=collection');

  const ids = res.body.all.map((a) => a.id);
  assert.ok(ids.includes('da1'), 'the Delivery Agent is offered for collection');
  assert.ok(!ids.some((i) => i.startsWith('vco')), 'no VCO on the collection leg');
});

// ── eligible-agents: same-hub agents rank first (Phase 2 hub routing) ──────────
// For a DIRECT pickup the agent should come from the SELLER's own hub. An agent
// whose home hub is the order's pickup hub is flagged same_hub and sorted ahead of
// everyone else — ahead even of a better coverer from another hub.
test('eligible-agents (collection): a same-hub agent is flagged and ranked first', async () => {
  const order = {
    id: 'o1',
    district: 'Pudukkottai',
    village: 'Alangudi',
    delivery_address: {},
    pickup_hub_id: 'hubA',
  };
  const users = [
    // Covers the village but belongs to a DIFFERENT hub.
    { id: 'da_other', fname: 'Other', admin_role: 'Delivery Agent', can_deliver: false,
      district: 'Pudukkottai', status: 'active', service_villages: ['Alangudi'], service_areas: [],
      hub_id: 'hubB' },
    // Same hub as the pickup, covers nothing — must still lead.
    { id: 'da_same', fname: 'Same', admin_role: 'Delivery Agent', can_deliver: false,
      district: 'Pudukkottai', status: 'active', service_villages: [], service_areas: [],
      hub_id: 'hubA' },
  ];
  const db = fakeSupabase({ 'orders:select': { data: [order] }, 'users:select': { data: users } });
  app = await mountRoute('delivery', { supabase: db, user: REQ });
  const res = await app.get('/o1/eligible-agents?leg=collection');

  assert.equal(res.status, 200);
  assert.equal(res.body.all[0].id, 'da_same', 'same-hub agent sorts first');
  assert.equal(res.body.all.find((a) => a.id === 'da_same').same_hub, true);
  assert.equal(res.body.all.find((a) => a.id === 'da_other').same_hub, false);
});

// ── delivery-hubs: destination-hub candidates + deterministic suggestion ───────
test('delivery-hubs: suggests the consumer’s own-taluk hub, lists all district hubs', async () => {
  const order = {
    id: 'o1',
    district: 'Pudukkottai',
    delivery_address: { district: 'Pudukkottai', taluk: 'Alangudi' },
    delivery_hub_id: null,
    delivered_lat: null,
    delivered_lng: null,
  };
  const hubs = [
    { id: 'h_thiru', name: 'Thirumayam Hub', taluk: 'Thirumayam', is_active: true },
    { id: 'h_alangudi', name: 'Alangudi Hub', taluk: 'Alangudi', is_active: true },
  ];
  const db = fakeSupabase({ 'orders:select': { data: [order] }, 'hubs:select': { data: hubs } });
  app = await mountRoute('delivery', { supabase: db, user: REQ });
  const res = await app.get('/o1/delivery-hubs');

  assert.equal(res.status, 200);
  assert.equal(res.body.suggested_hub_id, 'h_alangudi', 'the consumer’s own taluk hub is suggested');
  assert.equal(res.body.hubs.length, 2);
  assert.equal(res.body.hubs[0].id, 'h_alangudi', 'the suggestion sorts first');
});
