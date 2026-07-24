// Route tests for multi-vendor order splitting.
//
// A cart holding produce from two sellers becomes a parent order (what the customer
// pays for) plus one child per seller (what actually travels). These cover the
// places where getting it wrong costs money or strands a parcel: which row the
// items land on, which row each list shows, and what a part-cancellation does to
// the bill.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const CONSUMER = {
  id: 'consumer-1', role: 'consumer', fname: 'Priya', lname: 'Nair',
  district: 'Pudukkottai', village_town: 'Adyar',
};

const F1 = 'farmer-1';
const F2 = 'farmer-2';
const P1 = 'product-1';
const P2 = 'product-2';

const PARENT_CODE = 'ORDPDK260724000001';

/** Reads the value a route filtered a column on, e.g. which farmer it asked for. */
function filterValue(ctx, col) {
  const hit = (ctx.filters || []).find(([op, c]) => op === 'eq' && c === col);
  return hit ? hit[2] : undefined;
}

/**
 * A checkout with TWO sellers in DIFFERENT villages — the case a single order row
 * cannot represent, and the reason splitting exists.
 */
function twoSellerCheckout(overrides = {}) {
  const supa = fakeSupabase({
    'farmer_listings:select': { data: [{
      farmer_price: 2000, qty_available: 36, listed: true, confirmed: true,
      bulk_qty: null, bulk_disc_pct: null,
    }] },
    'farmer_listings:update': { data: [] },
    'products:select': (ctx) => ({ data: [{
      id: filterValue(ctx, 'id') || P1, code: 'TOM', name: 'Tomato', unit: 'kg',
      platform_fee_pct: 5, available: true, exotic: false,
    }] }),
    // Each seller answers with their OWN village, so the children must land in two
    // different VCO queues.
    'users:select': (ctx) => {
      const id = filterValue(ctx, 'id');
      return id === F2
        ? { data: [{ id: F2, fname: 'Meena', lname: 'S', village_town: 'Alangudi', district: 'Pudukkottai', seller_type: 'Retailer' }] }
        : { data: [{ id: F1, fname: 'Ravi', lname: 'K', village_town: 'Hosur', district: 'Krishnagiri', seller_type: 'Farmer' }] };
    },
    'product_district_prices:select': { data: [{ market_price: 3000, handling: 0 }] },
    'rpc:next_code_seq:rpc': { data: 1 },
    // The parent insert is a single object; the children go in as an array.
    'orders:insert': (ctx) => (Array.isArray(ctx.payload)
      ? { data: ctx.payload.map((row, i) => ({ ...row, id: `child-${i + 1}` })) }
      : { data: [{ ...ctx.payload, id: 'parent-1', code: PARENT_CODE, consumer_name: 'Priya Nair' }] }),
    'order_items:insert': { data: [] },
    'order_history:insert': { data: [] },
  });
  for (const [k, v] of Object.entries(overrides)) supa.on(...k.split('|'), v);
  return supa;
}

const TWO_SELLER_CART = {
  items: [
    { product_id: P1, farmer_id: F1, qty: 2 },
    { product_id: P2, farmer_id: F2, qty: 1 },
  ],
  pay_method: 'Cash on Delivery',
};

const ONE_SELLER_CART = {
  items: [{ product_id: P1, farmer_id: F1, qty: 2 }],
  pay_method: 'Cash on Delivery',
};

describe('POST /orders — splitting a multi-vendor cart', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  test('a single-seller cart is NOT split — one row, exactly as before', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', ONE_SELLER_CART);

    assert.equal(res.status, 201);
    const inserts = supa.callsTo('orders', 'insert');
    assert.equal(inserts.length, 1, 'a single-seller order must not grow a child');
    assert.equal(inserts[0].payload.parent_order_id, undefined);
    assert.equal(res.body.parts, undefined, 'no parts on an unsplit order');
  });

  test('two sellers produce a parent plus one child each', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', TWO_SELLER_CART);

    assert.equal(res.status, 201);
    const [parentInsert, childInsert] = supa.callsTo('orders', 'insert');
    const children = childInsert.payload;

    assert.equal(children.length, 2);
    assert.equal(res.body.parts.length, 2);
    assert.equal(parentInsert.payload.route, 'split');
    for (const c of children) assert.equal(c.parent_order_id, 'parent-1');
  });

  test('each child carries its OWN seller\'s village — the bug that started this', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/', TWO_SELLER_CART);
    const children = supa.callsTo('orders', 'insert')[1].payload;

    assert.equal(children[0].village, 'Hosur');
    assert.equal(children[1].village, 'Alangudi');
    // Before splitting, the whole order took the FIRST seller's village and the
    // second seller's produce never reached their own VCO.
    assert.notEqual(children[0].village, children[1].village);
  });

  test('the parent has NO village, so it cannot sit in a VCO queue beside the real parcel', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/', TWO_SELLER_CART);
    const parent = supa.callsTo('orders', 'insert')[0].payload;

    assert.equal(parent.village, null);
    // District still comes from the customer, so revenue-by-district still buckets it.
    assert.equal(parent.district, 'Pudukkottai');
  });

  test('the child codes are the parent code plus a suffix', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/', TWO_SELLER_CART);
    const children = supa.callsTo('orders', 'insert')[1].payload;

    assert.equal(children[0].code, `${PARENT_CODE}-1`);
    assert.equal(children[1].code, `${PARENT_CODE}-2`);
  });

  test('items land on the CHILD that carries them, never on the parent', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/', TWO_SELLER_CART);
    const items = supa.callsTo('order_items', 'insert')[0].payload;

    assert.equal(items.length, 2);
    // Duplicating a line onto the parent as well would pay its seller twice —
    // farmer payouts group order_items by order_id.
    for (const it of items) {
      assert.notEqual(it.order_id, 'parent-1');
    }
    assert.equal(items.find(i => i.farmer_id === F1).order_id, 'child-1');
    assert.equal(items.find(i => i.farmer_id === F2).order_id, 'child-2');
  });

  test('the parts add up to exactly the parent total', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/', TWO_SELLER_CART);
    const parent = supa.callsTo('orders', 'insert')[0].payload;
    const children = supa.callsTo('orders', 'insert')[1].payload;

    const summed = children.reduce((s, c) => s + c.total, 0);
    assert.equal(summed, parent.total, 'a COD customer must not be asked for a different sum');
  });

  test('the once-only charges are on ONE part, not repeated on every part', async () => {
    const supa = twoSellerCheckout({
      // Make handling non-zero so there is something to double-charge.
      'product_district_prices|select': { data: [{ market_price: 3000, handling: 700 }] },
      'products|select': (ctx) => ({ data: [{
        id: filterValue(ctx, 'id') || P1, code: 'TOM', name: 'Tomato', unit: 'kg',
        platform_fee_pct: 5, available: true, exotic: true,
      }] }),
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/', TWO_SELLER_CART);
    const children = supa.callsTo('orders', 'insert')[1].payload;

    assert.equal(children[0].handling, 700);
    assert.equal(children[1].handling, 0);
    assert.equal(children[1].delivery, 0);
  });

  test('a failed child insert rolls the parent back rather than leaving a stub', async () => {
    const supa = twoSellerCheckout({
      'orders|insert': (ctx) => (Array.isArray(ctx.payload)
        ? { error: { message: 'child insert exploded' } }
        : { data: [{ ...ctx.payload, id: 'parent-1', code: PARENT_CODE }] }),
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', TWO_SELLER_CART);

    assert.equal(res.status, 500);
    // An order row with no contents still counts on every dashboard.
    assert.equal(supa.callsTo('orders', 'delete').length, 1);
  });

  test('each part gets its own opening timeline entry', async () => {
    const supa = twoSellerCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/', TWO_SELLER_CART);
    const history = supa.callsTo('order_history', 'insert')[0].payload;

    // The parent plus both parcels — a VCO reads the child's timeline, not the parent's.
    assert.equal(history.length, 3);
    assert.deepEqual(
      history.map(h => h.order_id).sort(),
      ['child-1', 'child-2', 'parent-1'],
    );
  });
});

describe('GET /orders — which rows each role sees', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  const ROWS = [
    { id: 'parent-1', code: PARENT_CODE, route: 'split', stage: 2, status: 'VCO Verified', village: null, district: 'Pudukkottai', total: 15000, parent_order_id: null },
    { id: 'child-1', code: `${PARENT_CODE}-1`, route: '', stage: 2, status: 'VCO Verified', village: 'Hosur', district: 'Krishnagiri', total: 10000, parent_order_id: 'parent-1' },
    { id: 'child-2', code: `${PARENT_CODE}-2`, route: '', stage: 2, status: 'VCO Verified', village: 'Alangudi', district: 'Pudukkottai', total: 5000, parent_order_id: 'parent-1' },
    { id: 'plain-1', code: 'ORDPDK260724000002', route: '', stage: 2, status: 'VCO Verified', village: 'Hosur', district: 'Krishnagiri', total: 4000, parent_order_id: null },
  ];

  const listing = () => fakeSupabase({ 'orders:select': { data: ROWS } });

  test('the customer sees the order they placed, not its internal parcels', async () => {
    const supa = listing();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.get('/');
    const ids = res.body.orders.map(o => o.id);

    assert.ok(ids.includes('parent-1'));
    assert.ok(ids.includes('plain-1'));
    assert.ok(!ids.includes('child-1'), 'a customer must not see one basket as several orders');
  });

  test('the agent\'s pickup queue excludes the container', async () => {
    const supa = listing();
    const agent = { id: 'agent-1', role: 'admin', admin_role: 'Delivery Agent', fname: 'Selvam' };
    app = await mountRoute('orders', { supabase: supa, user: agent });

    const res = await app.get('/');
    const ids = res.body.orders.map(o => o.id);

    // The parent rolls up to stage 2 as well, so without the parcel filter it would
    // appear in the queue as something to collect — and there is nothing to collect.
    assert.ok(!ids.includes('parent-1'));
    assert.ok(ids.includes('child-1'));
  });

  test('a senior admin sees one row per customer order, so money is not counted twice', async () => {
    const supa = listing();
    const ho = { id: 'ho-1', role: 'admin', admin_role: 'Head Office', fname: 'Lakshmi' };
    app = await mountRoute('orders', { supabase: supa, user: ho });

    const res = await app.get('/');
    const ids = res.body.orders.map(o => o.id);

    assert.ok(ids.includes('parent-1'));
    assert.ok(!ids.includes('child-1'), 'parent + children would double-count the basket');
  });

  test('?parts=1 drops a senior admin into the parcel view', async () => {
    const supa = listing();
    const ho = { id: 'ho-1', role: 'admin', admin_role: 'Head Office', fname: 'Lakshmi' };
    app = await mountRoute('orders', { supabase: supa, user: ho });

    const res = await app.get('/?parts=1');
    const ids = res.body.orders.map(o => o.id);

    assert.ok(ids.includes('child-1'));
    assert.ok(!ids.includes('parent-1'));
  });
});

describe('the parent is a container, not a parcel', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  const PARENT = {
    id: 'parent-1', code: PARENT_CODE, consumer_id: CONSUMER.id, parent_order_id: null,
    route: 'split', stage: 2, status: 'VCO Verified', cancelled: false, total: 15000,
  };

  test('GET /:id/track ANSWERS for a split parent instead of hanging', async () => {
    /* It used to throw: the container's route has no entry in STAGE_MAP, and
     * `STAGE_MAP[route].map(...)` on undefined raises inside an ASYNC handler —
     * which Express 4 does not catch. The response never went out, so the customer's
     * order sheet sat on a spinner for ever while the API "worked". */
    const supa = fakeSupabase({
      'orders:select': { data: [PARENT] },
      'order_history:select': { data: [] },
    });
    app = await mountRoute('delivery', { supabase: supa, user: CONSUMER });

    const res = await app.get('/parent-1/track');

    assert.equal(res.status, 200);
    assert.equal(res.body.order.route, 'split');
    // The rollup can report a hub-only status, so the container's map must be the
    // superset that contains one.
    assert.ok(res.body.routeMap.some(n => n.label === 'At Hub'));
  });

  test('an agent cannot scan the container', async () => {
    const supa = fakeSupabase({ 'orders:select': { data: [PARENT] } });
    const agent = { id: 'agent-1', role: 'admin', admin_role: 'Delivery Agent', fname: 'Selvam' };
    app = await mountRoute('delivery', { supabase: supa, user: agent });

    const res = await app.post('/parent-1/scan', {});

    assert.equal(res.status, 400);
    assert.match(res.body.error, /split across several sellers/);
    assert.equal(supa.callsTo('orders', 'update').length, 0);
  });

  test('a senior admin cannot set the container\'s status by hand', async () => {
    const supa = fakeSupabase({ 'orders:select': { data: [PARENT] } });
    const ho = { id: 'ho-1', role: 'admin', admin_role: 'Head Office', fname: 'Lakshmi' };
    app = await mountRoute('delivery', { supabase: supa, user: ho });

    const res = await app.post('/parent-1/status', { status: 'Delivered' });

    assert.equal(res.status, 400);
    assert.equal(supa.callsTo('orders', 'update').length, 0);
  });
});

describe('POST /orders/:id/cancel — cancelling one seller\'s part', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  const CHILD = {
    id: 'child-1', code: `${PARENT_CODE}-1`, consumer_id: CONSUMER.id,
    parent_order_id: 'parent-1', split_seq: 1, seller_id: F1, seller_name: 'Ravi K',
    route: '', stage: 0, status: 'Order Placed', cancelled: false,
    item_total: 10000, total: 13500, pay_status: 'paid', pay_method: 'UPI',
  };

  test('cancels only that part and tells the customer the rest is still coming', async () => {
    const supa = fakeSupabase({
      'orders:select': { data: [CHILD] },
      'orders:update': { data: [] },
      'order_history:insert': { data: [] },
      'order_items:select': { data: [] },
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/child-1/cancel', { cancel_reason: 'changed my mind' });

    assert.equal(res.status, 200);
    assert.match(res.body.message, /still on its way/);
    const cancelWrite = supa.callsTo('orders', 'update')[0];
    assert.equal(cancelWrite.payload.cancelled, true);
  });

  test('restocks from the PART, not from the parent that holds no items', async () => {
    const supa = fakeSupabase({
      'orders:select': { data: [CHILD] },
      'orders:update': { data: [] },
      'order_history:insert': { data: [] },
      'order_items:select': { data: [{ farmer_id: F1, product_id: P1, qty: 2 }] },
      'farmer_listings:select': { data: [{ qty_available: 5, listed: true }] },
      'farmer_listings:update': { data: [] },
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/child-1/cancel', {});

    const restock = supa.callsTo('farmer_listings', 'update')[0];
    assert.ok(restock, 'the seller never got their stock back');
    assert.equal(restock.payload.qty_available, 7);
  });

  test('a part already picked up cannot be cancelled', async () => {
    const supa = fakeSupabase({
      'orders:select': { data: [{ ...CHILD, stage: 3, status: 'Picked Up' }] },
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/child-1/cancel', {});

    assert.equal(res.status, 400);
    assert.equal(supa.callsTo('orders', 'update').length, 0);
  });
});
