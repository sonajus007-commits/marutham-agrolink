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
  const res = await app.post('/o1/scan', { delivered_lat: 10.5, delivered_lng: 78.8 });

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
  const res = await app.post('/o1/scan', { delivered_lat: 999, delivered_lng: 78.8 });

  assert.equal(res.status, 400);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});

test('coordinates on a non-final scan are ignored (only stored on delivery)', async () => {
  // stage 3 (Picked Up) → 4 (Out for Delivery): not the Delivered transition.
  const db = dbFor(outForDelivery({ stage: 3, status: 'Picked Up' }));
  app = await mountRoute('delivery', { supabase: db, user: AGENT });
  const res = await app.post('/o1/scan', { delivered_lat: 10.5, delivered_lng: 78.8 });

  assert.equal(res.status, 200);
  const update = db.callsTo('orders', 'update')[0].payload;
  assert.notEqual(update.status, 'Delivered');
  assert.ok(!('delivered_lat' in update), 'lat is not written before delivery');
});

test('a consumer cannot scan', async () => {
  const db = dbFor(outForDelivery());
  app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
  const res = await app.post('/o1/scan', { delivered_lat: 10.5, delivered_lng: 78.8 });
  assert.equal(res.status, 403);
  assert.equal(db.callsTo('orders', 'update').length, 0);
});
