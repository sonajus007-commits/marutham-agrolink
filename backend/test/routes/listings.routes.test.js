// Route tests for PATCH /listings/:id/status — the admin approval queue.
//
// The rule these lock in (from 27416d1): A REJECTION MUST SAY WHY. The legacy admin
// page prompted for a reason labelled "(shown to farmer)", sent it, and the route
// threw it away — there was no column. Until now that rule was proven only by
// somebody driving it by hand once, which means nothing stopped the next edit from
// quietly removing it.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const ADMIN  = { id: 'admin-1', role: 'admin', admin_role: 'Head Office', fname: 'HO' };
const FARMER = { id: 'farmer-1', role: 'farmer', fname: 'Ravi' };

function queue(overrides = {}) {
  const supa = fakeSupabase({
    'farmer_listings:update': { data: [{ id: 'listing-1', listing_status: 'rejected' }] },
    'farmer_listings:select': { data: [{
      farmer: { id: 'farmer-1', fname: 'Ravi', email: 'r@x.com', phone: '91', login_id: 'F1' },
      product: { id: 'p1', name: 'Tomato' },
    }] },
  });
  for (const [k, v] of Object.entries(overrides)) supa.on(...k.split('|'), v);
  return supa;
}

describe('PATCH /listings/:id/status', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  test('a rejection WITHOUT a reason is refused', async () => {
    const supa = queue();
    app = await mountRoute('listings', { supabase: supa, user: ADMIN });

    const res = await app.patch('/listing-1/status', { status: 'rejected' });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /reason/i);
    assert.equal(supa.callsTo('farmer_listings', 'update').length, 0, 'nothing may be rejected without a reason');
  });

  test('a rejection whose reason is only whitespace is refused', async () => {
    const supa = queue();
    app = await mountRoute('listings', { supabase: supa, user: ADMIN });

    const res = await app.patch('/listing-1/status', { status: 'rejected', rejection_reason: '   \n  ' });

    assert.equal(res.status, 400, 'whitespace is not a reason');
    assert.equal(supa.callsTo('farmer_listings', 'update').length, 0);
  });

  test('a rejection WITH a reason is accepted, and the reason is persisted', async () => {
    const supa = queue();
    app = await mountRoute('listings', { supabase: supa, user: ADMIN });

    const res = await app.patch('/listing-1/status', {
      status: 'rejected', rejection_reason: '  Photo does not show the produce.  ',
    });

    assert.equal(res.status, 200);
    const update = supa.callsTo('farmer_listings', 'update')[0];
    assert.equal(update.payload.listing_status, 'rejected');
    assert.equal(
      update.payload.rejection_reason, 'Photo does not show the produce.',
      'stored trimmed — the seller is shown this',
    );
  });

  // A live listing must never carry a stale objection from a previous rejection.
  test('approving CLEARS any rejection reason left from a previous rejection', async () => {
    const supa = queue({ 'farmer_listings|update': { data: [{ id: 'listing-1', listing_status: 'active' }] } });
    app = await mountRoute('listings', { supabase: supa, user: ADMIN });

    const res = await app.patch('/listing-1/status', { status: 'active' });

    assert.equal(res.status, 200);
    const update = supa.callsTo('farmer_listings', 'update')[0];
    assert.equal(update.payload.rejection_reason, null, 'an approved listing carries no objection');
  });

  test('a farmer cannot approve their own listing', async () => {
    const supa = queue();
    app = await mountRoute('listings', { supabase: supa, user: FARMER });

    const res = await app.patch('/listing-1/status', { status: 'active' });

    assert.equal(res.status, 403);
    assert.equal(supa.callsTo('farmer_listings', 'update').length, 0);
  });

  test('an unknown status is refused', async () => {
    const supa = queue();
    app = await mountRoute('listings', { supabase: supa, user: ADMIN });

    const res = await app.patch('/listing-1/status', { status: 'banished' });

    assert.equal(res.status, 400);
    assert.equal(supa.callsTo('farmer_listings', 'update').length, 0);
  });
});

describe('GET /listings', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  // Unread, a failed farmer lookup produced an EMPTY farmer list, which produced an
  // empty listing list — a shop with nothing in it, for a whole district, with a 200
  // and no sign anything was wrong.
  test('a failed district-farmer lookup is a 500, not an empty shop', async () => {
    const supa = fakeSupabase({ 'users:select': { error: { message: 'timeout' } } });
    app = await mountRoute('listings', { supabase: supa, user: FARMER });

    const res = await app.get('/?district=Chennai');

    assert.equal(res.status, 500);
    assert.notEqual(res.status, 200);
  });
});

// Body validation (Zod) on POST /listings. Price and stock are the numeric bug class
// the ratings schema first closed: a raw `< 0` check let a bad value through untyped.
describe('POST /listings — create validation', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  const bad = [
    ['no product_id',          { farmer_price: 20, qty_available: 5 }],
    ['a negative price',       { product_id: 'p1', farmer_price: -1, qty_available: 5 }],
    ['a negative stock',       { product_id: 'p1', farmer_price: 20, qty_available: -5 }],
    ['a non-numeric price',    { product_id: 'p1', farmer_price: 'cheap', qty_available: 5 }],
  ];
  for (const [label, body] of bad) {
    test(`rejects ${label} at the edge (400, no product lookup)`, async () => {
      const supa = fakeSupabase();
      app = await mountRoute('listings', { supabase: supa, user: FARMER });
      const res = await app.post('/', body);
      assert.equal(res.status, 400);
      assert.equal(supa.callsTo('products').length, 0);   // rejected before verifying the product
    });
  }

  test('a non-farmer is turned away (403) before create validation', async () => {
    app = await mountRoute('listings', { supabase: fakeSupabase(), user: ADMIN });
    const res = await app.post('/', { farmer_price: -1 });   // also an invalid body
    assert.equal(res.status, 403);
  });

  test('coerces a numeric-string price and creates the listing', async () => {
    const supa = fakeSupabase({
      'products:select': { data: [{ id: 'p1', available: true }] },
      'farmer_listings:insert': { data: [{ id: 'listing-9', listing_status: 'pending' }] },
    });
    app = await mountRoute('listings', { supabase: supa, user: FARMER });
    const res = await app.post('/', { product_id: 'p1', farmer_price: '20', qty_available: '5' });
    assert.equal(res.status, 201);
    const insert = supa.callsTo('farmer_listings', 'insert')[0];
    assert.equal(insert.payload.farmer_price, 20);   // stored as a number, not "20"
    assert.equal(insert.payload.qty_available, 5);
  });
});
