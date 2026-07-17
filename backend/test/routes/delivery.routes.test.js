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

// ── Hub dispatch location ───────────────────────────────────────────────────────
// Dispatching an At-Hub order (hub route, stage 5 → Out for Delivery) stamps the
// hub's location.
const HUB = { id: 'h1', role: 'admin', admin_role: 'Hub Incharge', fname: 'Hub' };

function atHub() {
  return { id: 'o1', code: 'ORD1', stage: 5, status: 'At Hub', route: 'hub', cancelled: false, pay_method: 'UPI' };
}

test('hub dispatch stores the hub location as dispatched_lat/lng', async () => {
  const db = fakeSupabase({
    'orders:select': { data: [atHub()] },
    'orders:update': { data: { id: 'o1', status: 'Out for Delivery' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: HUB });
  const res = await app.post('/o1/scan', { lat: 10.5, lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.equal(update.status, 'Out for Delivery');
  assert.equal(update.dispatched_lat, 10.5);
  assert.equal(update.dispatched_lng, 78.8);
});

test('hub dispatch without a location still succeeds and stores no coordinates', async () => {
  const db = fakeSupabase({
    'orders:select': { data: [atHub()] },
    'orders:update': { data: { id: 'o1', status: 'Out for Delivery' } },
  });
  app = await mountRoute('delivery', { supabase: db, user: HUB });
  const res = await app.post('/o1/scan', {});

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.ok(!('dispatched_lat' in update), 'no lat when none was sent');
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

// THE ONE THAT MATTERS. A hub dispatch (stage 5) replayed after the order reached
// Out for Delivery (6) misses the hub branch and falls through to `stage >= 3`,
// which advances 6 → 7 = Delivered — and advanceStage marks a COD order PAID on
// delivery. That is cash recorded as collected that nobody collected.
test('a hub dispatch replayed one stage late cannot deliver a COD order', async () => {
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
