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
