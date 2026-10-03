// POST /orders/:id/decline-items — decline some lines of a parcel, accept the rest.
// The rules locked here: a partial decline accepts the parcel (status stays
// 'Order Accepted', flagged partially_accepted), takes ONLY the declined goods off
// the bill, moves the lines out of order_items, and refunds a prepaid customer;
// declining every line is a whole-parcel decline; nothing is written for lines that
// are not the seller's, or once the parcel has moved past acceptance.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const FARMER = { id: 'f1', role: 'farmer', fname: 'Murugan' };

const LINES = [
  { id: 'i1', order_id: 'o1', farmer_id: 'f1', product_id: 'p1', name: 'Carrot', qty: 2, unit: 'kg', price: 5000, farmer_price: 4760, govt_price: null },
  { id: 'i2', order_id: 'o1', farmer_id: 'f1', product_id: 'p2', name: 'Potato', qty: 1, unit: 'kg', price: 10000, farmer_price: 9520, govt_price: null },
];

function order(extra = {}) {
  return {
    id: 'o1', code: 'ORD1', status: 'Order Received', stage: 1, route: 'direct', cancelled: false,
    item_total: 20000, market_fee: 960, saved: 0, total: 23500, handling: 1000, delivery: 2500,
    pay_status: 'pending', pay_method: 'Cash on Delivery', consumer_id: 'c1', seller_name: 'Murugan',
    accept_deadline: new Date(Date.now() + 3600e3).toISOString(),
    ...extra,
  };
}

function db(o, overrides = {}) {
  const supa = fakeSupabase({
    'orders:select': { data: [o] },
    'orders:update': { data: { ...o, status: 'Order Accepted', stage: 2 } },
    'order_items:select': { data: LINES },
    'farmer_listings:select': { data: [{ qty_available: 5, listed: true }] },
  });
  for (const [k, v] of Object.entries(overrides)) supa.on(...k.split('|'), v);
  return supa;
}

let app = null;
let mute = null;
afterEach(async () => {
  if (mute) { mute.restore(); mute = null; }
  if (app) { await app.close(); app = null; }
});

test('declining one of two lines accepts the parcel as Partially Accepted, minus only that line', async () => {
  const supa = db(order());
  app = await mountRoute('delivery', { supabase: supa, user: FARMER });
  const res = await app.post('/o1/decline-items', { item_ids: ['i1'], reason: 'sold out' });

  assert.equal(res.status, 200);
  assert.equal(res.body.partially_accepted, true);
  const upd = supa.callsTo('orders', 'update')[0].payload;
  assert.equal(upd.status, 'Order Accepted');
  assert.equal(upd.partially_accepted, true);
  assert.equal(upd.item_total, 10000);
  assert.equal(upd.total, 13500, 'handling + delivery are not re-priced');
  assert.ok(upd.accepted_at);
  const copy = supa.callsTo('declined_order_items', 'insert')[0].payload;
  assert.equal(copy.length, 1);
  assert.equal(copy[0].order_item_id, 'i1');
  assert.equal(copy[0].reason, 'sold out');
  assert.equal(supa.callsTo('order_items', 'delete').length, 1);
  const hist = supa.callsTo('order_history', 'insert').map((c) => c.payload.label);
  assert.ok(hist.includes('Partially Accepted'));
  assert.ok(!('refund' in res.body), 'cash on delivery: nothing to refund');
});

test('a prepaid customer is refunded the declined goods', async () => {
  const supa = db(order({ pay_status: 'paid', pay_method: 'UPI' }));
  app = await mountRoute('delivery', { supabase: supa, user: FARMER });
  const res = await app.post('/o1/decline-items', { item_ids: ['i2'] });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.refund, { amount_paise: 10000, to: 'UPI' });
  const refundWrite = supa.callsTo('orders', 'update').map((c) => c.payload).find((p) => 'refund_amt' in p);
  assert.equal(refundWrite.refund_amt, 10000);
});

test('declining every line is a whole-parcel decline', async () => {
  const supa = db(order());
  app = await mountRoute('delivery', { supabase: supa, user: FARMER });
  const res = await app.post('/o1/decline-items', { item_ids: ['i1', 'i2'], reason: 'flood' });

  assert.equal(res.status, 200);
  assert.equal(res.body.declined, 'all');
  const upd = supa.callsTo('orders', 'update')[0].payload;
  assert.equal(upd.status, 'Cancelled');
  assert.equal(upd.cancel_reason, 'Declined by seller: flood');
  assert.equal(supa.callsTo('declined_order_items', 'insert').length, 0);
});

test("another seller's line is refused and nothing is written", async () => {
  const supa = db(order(), { 'order_items|select': { data: [...LINES, { ...LINES[0], id: 'x9', farmer_id: 'f2' }] } });
  app = await mountRoute('delivery', { supabase: supa, user: FARMER });
  const res = await app.post('/o1/decline-items', { item_ids: ['x9'] });

  assert.equal(res.status, 400);
  assert.equal(supa.callsTo('orders', 'update').length, 0);
  assert.equal(supa.callsTo('declined_order_items', 'insert').length, 0);
});

test('a packed parcel can no longer have items declined', async () => {
  const supa = db(order({ status: 'Packed', stage: 3 }));
  app = await mountRoute('delivery', { supabase: supa, user: FARMER });
  const res = await app.post('/o1/decline-items', { item_ids: ['i1'] });
  assert.equal(res.status, 409);
  assert.equal(supa.callsTo('order_items', 'delete').length, 0);
});

test('a lost race on an accepted parcel restores the lines and answers 409', async () => {
  mute = muteConsoleError();
  const supa = db(order({ status: 'Order Accepted', stage: 2 }), { 'orders|update': { data: null } });
  app = await mountRoute('delivery', { supabase: supa, user: FARMER });
  const res = await app.post('/o1/decline-items', { item_ids: ['i1'] });

  assert.equal(res.status, 409);
  const restored = supa.callsTo('order_items', 'insert')[0];
  assert.ok(restored, 'the moved line is put back');
  assert.equal(restored.payload[0].id, 'i1');
});
