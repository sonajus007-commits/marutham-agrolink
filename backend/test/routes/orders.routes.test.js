// Route tests for POST /orders and POST /orders/:id/cancel.
//
// These exist because of specific bugs that shipped, not for coverage. Each test
// below fails against the code as it was before 466bbad. The point is that nobody
// can quietly put those bugs back.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const CONSUMER = {
  id: 'consumer-1', role: 'consumer', fname: 'Priya', lname: 'Nair',
  district: 'Chennai', village_town: 'Adyar',
};

const FARMER_ID  = 'farmer-1';
const PRODUCT_ID = 'product-1';

/** A supabase fake wired for a checkout that should succeed. */
function healthyCheckout(overrides = {}) {
  const supa = fakeSupabase({
    farmer_listings: undefined,
    'farmer_listings:select': { data: [{
      farmer_price: 2000, qty_available: 36, listed: true, confirmed: true,
      bulk_qty: null, bulk_disc_pct: null,
    }] },
    'farmer_listings:update': { data: [] },
    'products:select': { data: [{
      id: PRODUCT_ID, code: 'TOM', name: 'Tomato', unit: 'kg',
      platform_fee_pct: 5, available: true, exotic: false,
    }] },
    'users:select': { data: [{
      id: FARMER_ID, fname: 'Ravi', lname: 'K', village_town: 'Hosur',
      district: 'Krishnagiri', seller_type: 'Farmer',
    }] },
    'product_district_prices:select': { data: [{ market_price: 3000, handling: 0 }] },
    'rpc:next_code_seq:rpc': { data: 1 },
    'orders:insert': { data: [{ id: 'order-1', code: 'ORDCBE260714000001', consumer_name: 'Priya Nair' }] },
    'order_items:insert': { data: [] },
    'order_history:insert': { data: [] },
  });
  for (const [k, v] of Object.entries(overrides)) supa.on(...k.split('|'), v);
  return supa;
}

const CART = { items: [{ product_id: PRODUCT_ID, farmer_id: FARMER_ID, qty: 2 }], pay_method: 'Cash on Delivery' };

describe('POST /orders', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  test('places the order and DECREMENTS the stock', async () => {
    const supa = healthyCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', CART);

    assert.equal(res.status, 201);

    // The decrement is the whole point. 36 available − 2 ordered = 34.
    const update = supa.callsTo('farmer_listings', 'update')[0];
    assert.ok(update, 'stock was never updated');
    assert.equal(update.payload.qty_available, 34);
    // Still in stock, so it must NOT be unlisted.
    assert.equal(update.payload.listed, undefined);
  });

  test('auto-unlists the listing when the order takes the last of the stock', async () => {
    const supa = healthyCheckout({
      'farmer_listings|select': { data: [{
        farmer_price: 2000, qty_available: 2, listed: true, confirmed: true,
        bulk_qty: null, bulk_disc_pct: null,
      }] },
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', CART);

    assert.equal(res.status, 201);
    const update = supa.callsTo('farmer_listings', 'update')[0];
    assert.equal(update.payload.qty_available, 0);
    assert.equal(update.payload.listed, false, 'a sold-out listing must come off the shop');
  });

  // ── The regression. ────────────────────────────────────────────────────────
  // Before 466bbad, the stock read's error was discarded, `listing` came back
  // null, the `if (listing)` guard skipped the decrement — and the route still
  // answered 201. Stock never dropped and the next customer bought the same goods.
  test('OVERSELL: a failed stock read must not pass silently', async () => {
    const supa = healthyCheckout();
    // The pricing read succeeds; the later stock read (step 7) is the one that fails.
    let call = 0;
    supa.on('farmer_listings', 'select', () => {
      call += 1;
      return call === 1
        ? { data: [{ farmer_price: 2000, qty_available: 36, listed: true, confirmed: true, bulk_qty: null, bulk_disc_pct: null }] }
        : { error: { message: 'connection reset' } };
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', CART);

    // The order IS placed — it is committed by then and cannot be unwound.
    assert.equal(res.status, 201);
    // But the failure must be LOUD, not invisible. This is the assertion that
    // fails against the old code.
    assert.ok(
      mute.lines.some((l) => l.includes('OVERSELL RISK')),
      'a failed stock read left no trace — this is exactly the silent oversell',
    );
  });

  test('OVERSELL: a failed stock WRITE must not pass silently either', async () => {
    const supa = healthyCheckout({ 'farmer_listings|update': { error: { message: 'deadlock detected' } } });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', CART);

    assert.equal(res.status, 201);
    assert.ok(mute.lines.some((l) => l.includes('OVERSELL RISK')), 'a failed stock write left no trace');
  });

  test('a failed listing lookup is a 500, not "product not found"', async () => {
    const supa = healthyCheckout({ 'farmer_listings|select': { error: { message: 'timeout' } } });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', CART);

    // The old code reported every database fault to the customer as a missing
    // product — a 404 that sent them looking for a listing that was there.
    assert.equal(res.status, 500);
    assert.notEqual(res.status, 404);
    assert.equal(supa.callsTo('orders', 'insert').length, 0, 'no order may be created when pricing failed');
  });

  test('a failed district-price lookup does not silently drop the handling charge', async () => {
    const supa = healthyCheckout({ 'product_district_prices|select': { error: { message: 'timeout' } } });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', CART);

    // `handling` is a real charge. Unread, it defaulted to 0 and undercharged.
    assert.equal(res.status, 500);
    assert.equal(supa.callsTo('orders', 'insert').length, 0);
  });

  test('an itemless order is rolled back, and a failed rollback screams', async () => {
    const supa = healthyCheckout({
      'order_items|insert': { error: { message: 'null value in column "qty"' } },
      'orders|delete':      { error: { message: 'rollback failed too' } },
    });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/', CART);

    assert.equal(res.status, 500);
    assert.equal(supa.callsTo('orders', 'delete').length, 1, 'the order must be rolled back');
    assert.ok(
      mute.lines.some((l) => l.includes('ORPHANED ORDER')),
      'an order with no items and no rollback is a corruption; it must be reported',
    );
  });

  test('the stock is decremented BEFORE the response, not fire-and-forget', async () => {
    const supa = healthyCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });
    await app.post('/', CART);
    // If the decrement were not awaited, this would be empty by the time we got here.
    assert.equal(supa.callsTo('farmer_listings', 'update').length, 1);
  });
});

describe('POST /orders/:id/cancel', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  /** An order that is still cancellable (stage 0), owned by CONSUMER. */
  function cancellable(overrides = {}) {
    const supa = fakeSupabase({
      'orders:select': { data: [{
        id: 'order-1', code: 'ORD1', consumer_id: CONSUMER.id, stage: 0,
        status: 'Order Placed', cancelled: false, pay_method: 'Cash on Delivery',
        total: 6700, pay_status: 'pending',
      }] },
      'orders:update': { data: [{ id: 'order-1', status: 'Cancelled' }] },
      'order_history:insert': { data: [] },
      'order_items:select': { data: [{ farmer_id: FARMER_ID, product_id: PRODUCT_ID, qty: 2 }] },
      'farmer_listings:select': { data: [{ qty_available: 34, listed: true }] },
      'farmer_listings:update': { data: [] },
    });
    for (const [k, v] of Object.entries(overrides)) supa.on(...k.split('|'), v);
    return supa;
  }

  test('RESTORES the stock', async () => {
    const supa = cancellable();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/order-1/cancel', { cancel_reason: 'changed my mind' });

    assert.equal(res.status, 200);
    const update = supa.callsTo('farmer_listings', 'update')[0];
    assert.ok(update, 'the farmer never got their stock back');
    assert.equal(update.payload.qty_available, 36, '34 + 2 returned');
  });

  // The listing was auto-unlisted at zero when the order was placed. Restoring the
  // quantity without undoing that left the product invisible in the shop while
  // showing stock — a separate bug from the error handling, fixed alongside it.
  test('RE-LISTS a listing that the order had auto-unlisted at zero', async () => {
    const supa = cancellable({ 'farmer_listings|select': { data: [{ qty_available: 0, listed: false }] } });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/order-1/cancel', { cancel_reason: 'x' });

    const update = supa.callsTo('farmer_listings', 'update')[0];
    assert.equal(update.payload.qty_available, 2);
    assert.equal(update.payload.listed, true, 'stock is back, so the product must be back on the shop');
  });

  test('does NOT re-list a listing the farmer unlisted deliberately', async () => {
    // Unlisted but still holding stock — that is a choice, not the auto-unlist.
    const supa = cancellable({ 'farmer_listings|select': { data: [{ qty_available: 10, listed: false }] } });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/order-1/cancel', { cancel_reason: 'x' });

    const update = supa.callsTo('farmer_listings', 'update')[0];
    assert.equal(update.payload.qty_available, 12);
    assert.equal(update.payload.listed, undefined, "a farmer's deliberate unlisting must not be overridden");
  });

  test('a failed stock restore must not pass silently', async () => {
    const supa = cancellable({ 'farmer_listings|update': { error: { message: 'deadlock' } } });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    const res = await app.post('/order-1/cancel', { cancel_reason: 'x' });

    assert.equal(res.status, 200);   // the cancellation itself did land
    assert.ok(
      mute.lines.some((l) => l.includes('STOCK NOT RESTORED')),
      'the farmer silently lost their inventory',
    );
  });

  test('a failed order_items read must not silently skip the restore', async () => {
    const supa = cancellable({ 'order_items|select': { error: { message: 'timeout' } } });
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });

    await app.post('/order-1/cancel', { cancel_reason: 'x' });

    // Old code: `for (… of orderItems || [])` iterated nothing, in total silence.
    assert.equal(supa.callsTo('farmer_listings', 'update').length, 0);
    assert.ok(mute.lines.some((l) => l.includes('STOCK NOT RESTORED')));
  });
});

// Body validation (Zod) on POST /orders. A rejected cart must never reach the DB.
describe('POST /orders — cart validation', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  const badCarts = [
    ['an empty items array',        { items: [], pay_method: 'Cash on Delivery' }],
    ['no pay_method',               { items: [{ product_id: PRODUCT_ID, farmer_id: FARMER_ID, qty: 1 }] }],
    ['an item missing product_id',  { items: [{ farmer_id: FARMER_ID, qty: 1 }], pay_method: 'UPI' }],
    ['a zero quantity',             { items: [{ product_id: PRODUCT_ID, farmer_id: FARMER_ID, qty: 0 }], pay_method: 'UPI' }],
    ['a negative quantity',         { items: [{ product_id: PRODUCT_ID, farmer_id: FARMER_ID, qty: -3 }], pay_method: 'UPI' }],
  ];
  for (const [label, cart] of badCarts) {
    test(`rejects ${label} at the edge (400, no listing read)`, async () => {
      const supa = healthyCheckout();
      app = await mountRoute('orders', { supabase: supa, user: CONSUMER });
      const res = await app.post('/', cart);
      assert.equal(res.status, 400);
      assert.equal(supa.callsTo('farmer_listings').length, 0);   // stopped before any DB work
    });
  }

  test('coerces a numeric-string qty and prices the order numerically', async () => {
    // "2" as a JSON string used to flow through untyped; it is now a real 2, so the
    // stock decrement (36 − 2) stays numeric.
    const supa = healthyCheckout();
    app = await mountRoute('orders', { supabase: supa, user: CONSUMER });
    const res = await app.post('/', { items: [{ product_id: PRODUCT_ID, farmer_id: FARMER_ID, qty: '2' }], pay_method: 'UPI' });
    assert.equal(res.status, 201);
    assert.equal(supa.callsTo('farmer_listings', 'update')[0].payload.qty_available, 34);
  });

  test('a non-consumer is turned away (403) before cart validation', async () => {
    const supa = healthyCheckout();
    app = await mountRoute('orders', { supabase: supa, user: { id: 'farmer-x', role: 'farmer' } });
    const res = await app.post('/', { items: [], pay_method: '' });   // also an invalid body
    assert.equal(res.status, 403);
  });
});
