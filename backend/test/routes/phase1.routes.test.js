// Regression suite for the Phase 1 gaps of the 2026-11-01 role audits. Each test names
// the tracker id it closes. These walk the handoffs BETWEEN roles, which is where every
// one of those gaps lived: each step worked alone and the journey did not.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');
const { runSubscriptionSweep } = require('../../utils/subscriptionSweep');
const { fetchAll, inChunks } = require('../../utils/paging');

let app, mute;
beforeEach(() => { mute = muteConsoleError(); });
afterEach(async () => { mute.restore(); if (app) { await app.close(); app = null; } });

const AGENT_A = { id: 'agent-a', role: 'admin', admin_role: 'Delivery Agent', fname: 'A', district: 'Chennai' };
const AGENT_B = { id: 'agent-b', role: 'admin', admin_role: 'Delivery Agent', fname: 'B', district: 'Chennai' };
const HR = { id: 'hr', role: 'admin', admin_role: 'HR Admin', fname: 'H', district: 'Chennai' };
const HO = { id: 'ho', role: 'admin', admin_role: 'Head Office', fname: 'HO', district: 'Chennai', state: 'Tamil Nadu' };
const DM = { id: 'dm', role: 'admin', admin_role: 'District Manager', fname: 'D', district: 'Chennai' };
const INCHARGE = { id: 'hi', role: 'admin', admin_role: 'Hub Incharge', fname: 'I', district: 'Chennai', hub_id: 'hub-chennai' };
const HUB_MGR = { id: 'hm', role: 'admin', admin_role: 'Hub Manager', fname: 'M', district: 'Chennai' };
const VCO = { id: 'vco', role: 'admin', admin_role: 'VCO', fname: 'V', district: 'Chennai', village_town: 'Tambaram' };
const FARMER = { id: 'f1', role: 'farmer', fname: 'Ravi', district: 'Madurai' };
const CONSUMER = { id: 'c1', role: 'consumer', fname: 'Asha', district: 'Chennai' };

const parcel = (o = {}) => ({
  id: 'o1', code: 'ORD1', consumer_id: 'c1', route: 'direct', stage: 6, status: 'Out for Delivery',
  cancelled: false, agent_id: 'agent-a', pay_method: 'Cash on Delivery', delivery_code: '1234',
  district: 'Chennai', ...o,
});
const orderDb = (order, extra = {}) => fakeSupabase({
  'orders:select': { data: [order] },
  'orders:update': { data: [{ ...order, status: 'next' }] },
  'order_items:select': { data: [{ id: 'l1', name: 'Tomato', qty: 5, farmer_id: 'f1' }] },
  'order_history:insert': { data: [] },
  'notifications:insert': { data: [] },
  'users:select': { data: [] },
  ...extra,
});

describe('AGT-01 · closing a parcel', () => {
  test('another agent cannot close it', async () => {
    const db = orderDb(parcel());
    app = await mountRoute('delivery', { supabase: db, user: AGENT_B });
    const res = await app.post('/o1/scan', { delivery_code: '1234' });
    assert.equal(res.status, 403);
    assert.equal(db.callsTo('orders', 'update').length, 0);
  });

  test('an office role cannot close it', async () => {
    const db = orderDb(parcel());
    app = await mountRoute('delivery', { supabase: db, user: HR });
    const res = await app.post('/o1/scan', { delivery_code: '1234' });
    assert.equal(res.status, 403);
    assert.equal(db.callsTo('orders', 'update').length, 0);
  });

  test('the assigned agent closes it with the code, and COD is booked', async () => {
    const db = orderDb(parcel());
    app = await mountRoute('delivery', { supabase: db, user: AGENT_A });
    const res = await app.post('/o1/scan', { delivery_code: '1234' });
    assert.equal(res.status, 200);
    const update = db.callsTo('orders', 'update')[0].payload;
    assert.equal(update.status, 'Delivered');
    assert.equal(update.pay_status, 'paid');
  });

  test('another agent cannot move a parcel that is Picked Up', async () => {
    const db = orderDb(parcel({ status: 'Picked Up', stage: 5 }));
    app = await mountRoute('delivery', { supabase: db, user: AGENT_B });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 403);
  });
});

describe('AGT-14 · scan box', () => {
  test('a bare scan at the door hands off to the Deliver screen', async () => {
    const db = orderDb(parcel());
    app = await mountRoute('delivery', { supabase: db, user: AGENT_A });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 400);
    assert.equal(res.body.needs, 'deliver');
  });
});

describe('CON-18 · Confirm Received', () => {
  test('a customer cannot close a COD parcel, because that books cash nobody took', async () => {
    const db = orderDb(parcel());
    app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
    const res = await app.post('/o1/confirm-received', {});
    assert.equal(res.status, 400);
    assert.equal(db.callsTo('orders', 'update').length, 0);
  });

  test('a customer can still confirm a prepaid parcel', async () => {
    const db = orderDb(parcel({ pay_method: 'UPI' }));
    app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
    const res = await app.post('/o1/confirm-received', {});
    assert.equal(res.status, 200);
  });
});

describe('CON-02 · split orders, parcel by parcel', () => {
  test('one prepaid parcel can be confirmed on its own', async () => {
    const child = parcel({ id: 'child-1', code: 'ORD1-1', parent_order_id: 'p1', seller_id: 'f1', pay_method: 'UPI' });
    const db = orderDb(child);
    db.on('orders', 'select', (ctx) => {
      if (String(ctx.cols || '').includes('split_seq')) return { data: [child] };
      return { data: [child] };
    });
    app = await mountRoute('delivery', { supabase: db, user: CONSUMER });
    const res = await app.post('/child-1/confirm-received', {});
    assert.equal(res.status, 200);
  });
});

describe('CON-03 · returning a split order', () => {
  test('the parent is refused with a pointer to the parcels', async () => {
    const parent = { id: 'p1', code: 'ORD1', consumer_id: 'c1', route: 'split', status: 'Delivered', cancelled: false, delivered_at: new Date().toISOString() };
    const db = fakeSupabase({ 'orders:select': { data: [parent] } });
    app = await mountRoute('returns', { supabase: db, user: CONSUMER });
    const res = await app.post('/p1/return', { lines: [{ order_item_id: 'l1', qty: 1, reason: 'bad' }] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /parcel/);
  });

  test('a delivered parcel can be returned against its own lines', async () => {
    const child = { id: 'c-1', code: 'ORDPDK260101000001-1', consumer_id: 'c1', route: 'direct', status: 'Delivered', cancelled: false, delivered_at: new Date().toISOString(), item_total: 1000, pay_method: 'UPI', parent_order_id: 'p1' };
    const db = fakeSupabase({
      'orders:select': { data: [child] },
      'returns:select': { data: [] },
      'order_items:select': { data: [{ id: 'l1', product_code: 'TOM', name: 'Tomato', farmer_name: 'R', qty: 2, unit: 'kg', price: 500 }] },
      'returns:insert': { data: [{ id: 'r1' }] },
      'return_lines:insert': { data: [] },
      'rpc:next_code_seq:rpc': { data: 1 },
    });
    app = await mountRoute('returns', { supabase: db, user: CONSUMER });
    const res = await app.post('/c-1/return', { lines: [{ order_item_id: 'l1', qty: 2, reason: 'bad' }] });
    assert.equal(res.status, 201, res.text);
  });
});

describe('SEL-01 · first listing', () => {
  const base = { product_id: 'p1', farmer_price: 0, qty_available: 0, time_available: '8:00 AM', cutoff_ts: new Date().toISOString(), listed: false };
  const listingDb = () => fakeSupabase({
    'products:select': { data: [{ id: 'p1', available: true, unit: 'kg' }] },
    'product_district_prices:select': { data: [] },
    'farmer_listings:insert': { data: [{ id: 'new' }] },
  });

  test('a seller can request a product before pricing it', async () => {
    const db = listingDb();
    app = await mountRoute('listings', { supabase: db, user: FARMER });
    const res = await app.post('/', base);
    assert.equal(res.status, 201, res.text);
    const row = db.callsTo('farmer_listings', 'insert')[0].payload;
    assert.equal(row.listing_status, 'pending');
    assert.equal(row.listed, false, 'a ₹0 row can never be on sale');
  });

  test('a ₹0 request cannot be pushed on sale by asking for listed', async () => {
    const db = listingDb();
    app = await mountRoute('listings', { supabase: db, user: FARMER });
    await app.post('/', { ...base, listed: true });
    assert.equal(db.callsTo('farmer_listings', 'insert')[0].payload.listed, false);
  });

  test('an unapproved listing cannot be confirmed for sale', async () => {
    const db = fakeSupabase({ 'farmer_listings:select': { data: [{ id: 'l1', farmer_id: 'f1', product_id: 'p1', listing_status: 'pending', farmer_price: 2000, qty_available: 5 }] } });
    app = await mountRoute('listings', { supabase: db, user: FARMER });
    const res = await app.patch('/l1', { confirmed: true, qty_available: 5 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /not approved/);
  });

  test('an approved listing with no price cannot be confirmed', async () => {
    const db = fakeSupabase({ 'farmer_listings:select': { data: [{ id: 'l1', farmer_id: 'f1', product_id: 'p1', listing_status: 'active', farmer_price: 0, qty_available: 5 }] } });
    app = await mountRoute('listings', { supabase: db, user: FARMER });
    const res = await app.patch('/l1', { confirmed: true, qty_available: 5 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /price/);
  });
});

describe('SEL-19 · placing an order', () => {
  const checkout = (listing = {}, seller = {}) => fakeSupabase({
    'farmer_listings:select': { data: [{ farmer_price: 2000, qty_available: 36, listed: true, confirmed: true, listing_status: 'active', ...listing }] },
    'farmer_listings:update': { data: [{ id: 'l' }] },
    'products:select': { data: [{ id: 'p1', code: 'TOM', name: 'Tomato', unit: 'kg', available: true }] },
    'users:select': { data: [{ id: 'f1', fname: 'Ravi', village_town: 'H', state: 'TN', district: 'K', taluk: 'H', seller_type: 'Farmer', status: 'active', ...seller }] },
    'product_district_prices:select': { data: [] },
    'hubs:select': { data: [] },
    'rpc:next_code_seq:rpc': { data: 1 },
    'orders:insert': { data: [{ id: 'order-1', code: 'ORD1' }] },
    'order_items:insert': { data: [] },
    'order_history:insert': { data: [] },
  });
  const CART = { items: [{ product_id: 'p1', farmer_id: 'f1', qty: 2 }], pay_method: 'Cash on Delivery' };

  for (const [name, listing, seller] of [
    ['a suspended seller', {}, { status: 'suspended' }],
    ['a blocked seller', {}, { status: 'blocked' }],
    ['a seller whose plan lapsed last night', {}, { subscription_expires_at: '2020-01-01T00:00:00Z' }],
    ['a listing that is not approved', { listing_status: 'pending' }, {}],
    ['a listing past its cutoff', { cutoff_ts: '2020-01-01T00:00:00Z' }, {}],
  ]) {
    test(`refuses ${name}`, async () => {
      const db = checkout(listing, seller);
      app = await mountRoute('orders', { supabase: db, user: { ...CONSUMER, state: 'TN' } });
      const res = await app.post('/', CART);
      assert.equal(res.status, 400);
      assert.equal(db.callsTo('orders', 'insert').length, 0);
    });
  }
});

describe('ADM-13 · order privacy', () => {
  test('a seller cannot read an order with none of their goods', async () => {
    const db = fakeSupabase({ 'orders:select': { data: [parcel()] }, 'order_items:select': { data: [] } });
    app = await mountRoute('orders', { supabase: db, user: FARMER });
    const res = await app.get('/o1');
    assert.equal(res.status, 403);
  });

  test('a seller reads their own parcel without the buyer contact or other lines', async () => {
    const db = fakeSupabase({
      'orders:select': { data: [parcel({ seller_id: 'f1', delivery_address: { street1: 'x' } })] },
      'users:select': { data: [{ phone: '999' }] },
      'order_items:select': { data: [{ id: 'a', farmer_id: 'f1' }, { id: 'b', farmer_id: 'f2' }] },
      'declined_order_items:select': { data: [] },
      'order_history:select': { data: [] },
      'returns:select': { data: [] },
    });
    app = await mountRoute('orders', { supabase: db, user: FARMER });
    const res = await app.get('/o1');
    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.order.consumer_phone, undefined);
    assert.equal(res.body.order.delivery_address, undefined);
    assert.deepEqual(res.body.items.map((i) => i.id), ['a']);
  });

  test('a delivery agent cannot read a job named for someone else', async () => {
    const db = fakeSupabase({ 'orders:select': { data: [parcel()] } });
    app = await mountRoute('orders', { supabase: db, user: AGENT_B });
    const res = await app.get('/o1');
    assert.equal(res.status, 403);
  });

  test('a manager cannot read an order from another district', async () => {
    const db = fakeSupabase({ 'orders:select': { data: [parcel({ district: 'Madurai' })] } });
    app = await mountRoute('orders', { supabase: db, user: DM });
    const res = await app.get('/o1');
    assert.equal(res.status, 403);
  });
});

describe('ADM-02 · status override', () => {
  const fresh = parcel({ status: 'Order Received', stage: 1 });

  test('a Hub Incharge can no longer force a status', async () => {
    const db = orderDb(fresh);
    app = await mountRoute('delivery', { supabase: db, user: INCHARGE });
    const res = await app.post('/o1/status', { status: 'Delivered', reason: 'x' });
    assert.equal(res.status, 403);
    assert.equal(db.callsTo('orders', 'update').length, 0);
  });

  test('a reason is required', async () => {
    const db = orderDb(fresh);
    app = await mountRoute('delivery', { supabase: db, user: HO });
    const res = await app.post('/o1/status', { status: 'Packed' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /reason/);
  });

  test('a District Manager is held to their district', async () => {
    const db = orderDb({ ...fresh, district: 'Madurai' });
    app = await mountRoute('delivery', { supabase: db, user: DM });
    const res = await app.post('/o1/status', { status: 'Packed', reason: 'x' });
    assert.equal(res.status, 403);
  });

  test('the reason lands in the timeline', async () => {
    const db = orderDb(fresh);
    app = await mountRoute('delivery', { supabase: db, user: DM });
    const res = await app.post('/o1/status', { status: 'Packed', reason: 'Seller phoned it in' });
    assert.equal(res.status, 200);
    assert.match(db.callsTo('order_history', 'insert')[0].payload.note, /Seller phoned it in/);
  });

  test('a delivery with a payout cannot be undone', async () => {
    const db = orderDb(parcel({ status: 'Delivered', stage: 7 }), { 'payouts:select': { data: [{ id: 'pay1' }] } });
    app = await mountRoute('delivery', { supabase: db, user: HO });
    const res = await app.post('/o1/status', { status: 'Packed', reason: 'Wrong scan' });
    assert.equal(res.status, 409);
    assert.equal(db.callsTo('orders', 'update').length, 0);
  });

  test('/advance cannot be used to mark a delivery', async () => {
    const db = orderDb(parcel());
    app = await mountRoute('delivery', { supabase: db, user: HO });
    const res = await app.post('/o1/advance', {});
    assert.equal(res.status, 400);
  });

  test('a Delivery Agent cannot use /advance, /route or cancel', async () => {
    const db = orderDb(parcel({ status: 'Packed', stage: 3 }));
    app = await mountRoute('delivery', { supabase: db, user: AGENT_A });
    assert.equal((await app.post('/o1/advance', {})).status, 403);
    assert.equal((await app.patch('/o1/route', { route: 'hub' })).status, 403);
    await app.close();
    app = await mountRoute('orders', { supabase: db, user: AGENT_A });
    assert.equal((await app.post('/o1/cancel', {})).status, 403);
  });
});

describe('HUB-03 + HMG-01 · hub check-in', () => {
  const inbound = (o = {}) => parcel({ status: 'In Transit', stage: 5, route: 'hub', agent_id: null, delivery_hub_id: 'hub-chennai', ...o });

  test('an Incharge cannot book in a parcel for another hub', async () => {
    const db = orderDb(inbound({ delivery_hub_id: 'hub-other' }));
    app = await mountRoute('delivery', { supabase: db, user: INCHARGE });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 403);
  });

  test('the destination Incharge can, even when the parcel started in another district', async () => {
    const db = orderDb(inbound({ district: 'Madurai' }));
    app = await mountRoute('delivery', { supabase: db, user: INCHARGE });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 200, res.text);
  });

  test('a Hub Manager can book in a parcel for the hub they run', async () => {
    const db = orderDb(inbound(), { 'hubs:select': { data: [{ id: 'hub-chennai' }] } });
    app = await mountRoute('delivery', { supabase: db, user: HUB_MGR });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 200, res.text);
  });

  test('a Hub Manager cannot book in a parcel for a hub they do not run', async () => {
    const db = orderDb(inbound(), { 'hubs:select': { data: [{ id: 'hub-other' }] } });
    app = await mountRoute('delivery', { supabase: db, user: HUB_MGR });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 403);
  });
});

describe('VCO-01 + VCO-08 + VCO-10 · VCO limits', () => {
  test('a VCO cannot verify a parcel in another district', async () => {
    const db = orderDb(parcel({ status: 'Packed', stage: 3, district: 'Madurai', village: 'Melur', agent_id: null }));
    app = await mountRoute('delivery', { supabase: db, user: VCO });
    const res = await app.post('/o1/scan', { items: [{ id: 'l1', verified_qty: 5 }] });
    assert.equal(res.status, 403);
  });

  test('a parcel where everything weighs zero cannot be verified', async () => {
    const db = orderDb(parcel({ status: 'Packed', stage: 3, agent_id: null, village: 'Tambaram' }));
    app = await mountRoute('delivery', { supabase: db, user: VCO });
    const res = await app.post('/o1/scan', { items: [{ id: 'l1', verified_qty: 0 }] });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /zero/);
    assert.equal(db.callsTo('orders', 'update').length, 0);
  });

  test('one short line still verifies, because the seller is told', async () => {
    const db = orderDb(parcel({ status: 'Packed', stage: 3, agent_id: null, village: 'Tambaram' }));
    app = await mountRoute('delivery', { supabase: db, user: VCO });
    const res = await app.post('/o1/scan', { items: [{ id: 'l1', verified_qty: 2 }] });
    assert.equal(res.status, 200, res.text);
  });

  test('Pick Up with no agent no longer turns a VCO into the delivery agent', async () => {
    const db = orderDb(parcel({ status: 'VCO Verified', stage: 4, agent_id: null, village: 'Tambaram' }));
    app = await mountRoute('delivery', { supabase: db, user: VCO });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Assign a delivery agent/);
  });

  test('a delivery-capable VCO can still take it', async () => {
    const db = orderDb(parcel({ status: 'VCO Verified', stage: 4, agent_id: null, village: 'Tambaram' }));
    app = await mountRoute('delivery', { supabase: db, user: { ...VCO, can_deliver: true } });
    const res = await app.post('/o1/scan', {});
    assert.equal(res.status, 200, res.text);
  });

  test('a VCO cannot reach the registration queue', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ id: 's1', role: 'farmer', approval_status: 'pending_review' }] } });
    app = await mountRoute('registrations', { supabase: db, user: VCO });
    assert.equal((await app.post('/s1/approve', {})).status, 403);
    assert.equal((await app.get('/?status=all')).status, 403);
  });

  test('a District Manager cannot approve a seller in another district', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ id: 's1', role: 'farmer', district: 'Madurai', approval_status: 'pending_review' }] } });
    app = await mountRoute('registrations', { supabase: db, user: DM });
    assert.equal((await app.post('/s1/approve', {})).status, 403);
    assert.equal(db.callsTo('users', 'update').length, 0);
  });
});

describe('MGR-01 + HR-01 · creating staff logins', () => {
  const body = { fname: 'X', phone: '9000000001', password: 'Temp@1234', emp_id: 'E1', gender: 'Female', state: 'TN', district: 'Chennai', pincode: '600001', aadhar: '123412341234', village_town: 'T' };
  const dbFor = (designation) => fakeSupabase({
    'employees:select': { data: [{ emp_id: 'E1', designation, status: 'active', approval_status: 'approved' }] },
    'users:select': { data: [] },
    'users:insert': { data: [{ id: 'n', login_id: 'E1' }] },
  });

  for (const d of ['Finance Manager', 'Finance Executive', 'Support Agent', 'Support Executive', 'Category Manager', 'Hub Manager', 'Zonal Manager']) {
    test(`Head Office can create ${d}`, async () => {
      app = await mountRoute('auth', { supabase: dbFor(d), user: HO });
      const res = await app.post('/create-staff', body);
      assert.equal(res.status, 201, res.text);
    });
  }

  test('HR can create a field login', async () => {
    app = await mountRoute('auth', { supabase: dbFor('Delivery Associate'), user: HR });
    const res = await app.post('/create-staff', body);
    assert.equal(res.status, 201, res.text);
  });

  for (const d of ['Head Office', 'CEO']) {
    test(`HR cannot create ${d}`, async () => {
      app = await mountRoute('auth', { supabase: dbFor(d), user: HR });
      const res = await app.post('/create-staff', body);
      assert.equal(res.status, 403);
    });
  }
});

describe('PLT-01 + ADM-05 · getting back in without SMS', () => {
  const hash = bcrypt.hashSync('Temp@1234', 4);
  const account = (o = {}) => ({ id: 'u1', login_id: 'E1', role: 'admin', admin_role: 'VCO', phone: '9000000001', password_hash: hash, status: 'active', approval_status: 'approved', ...o });
  const dbFor = (user) => fakeSupabase({ 'users:select': { data: [user] }, 'users:update': { data: [{ id: 'u1' }] } });

  for (const [name, flags] of [
    ['a temporary password', { must_change_password: true }],
    ['an expired password', { password_changed_at: '2020-01-01T00:00:00Z' }],
    ['an inactivity lock', { login_locked_at: '2020-01-01T00:00:00Z' }],
  ]) {
    test(`${name} can be replaced by proving the current password`, async () => {
      const db = dbFor(account(flags));
      app = await mountRoute('auth', { supabase: db, user: null });
      const res = await app.post('/set-password', { phone: '9000000001', current_password: 'Temp@1234', new_password: 'BrandNew@1' });
      assert.equal(res.status, 200, res.text);
      const upd = db.callsTo('users', 'update')[0].payload;
      assert.equal(upd.must_change_password, false);
      assert.equal(upd.login_locked_at, null);
    });
  }

  test('a wrong current password changes nothing', async () => {
    const db = dbFor(account({ must_change_password: true }));
    app = await mountRoute('auth', { supabase: db, user: null });
    const res = await app.post('/set-password', { phone: '9000000001', current_password: 'nope', new_password: 'BrandNew@1' });
    assert.equal(res.status, 401);
    assert.equal(db.callsTo('users', 'update').length, 0);
  });

  test('it cannot be used to get past a block', async () => {
    const db = dbFor(account({ status: 'blocked', must_change_password: true }));
    app = await mountRoute('auth', { supabase: db, user: null });
    const res = await app.post('/set-password', { phone: '9000000001', current_password: 'Temp@1234', new_password: 'BrandNew@1' });
    assert.equal(res.status, 403);
    assert.equal(db.callsTo('users', 'update').length, 0);
  });

  test('it cannot be used to get past a pending approval', async () => {
    const db = dbFor(account({ role: 'farmer', approval_status: 'pending_review', must_change_password: true }));
    app = await mountRoute('auth', { supabase: db, user: null });
    const res = await app.post('/set-password', { phone: '9000000001', current_password: 'Temp@1234', new_password: 'BrandNew@1' });
    assert.equal(res.status, 403);
  });

  test('a healthy account is told to just sign in', async () => {
    const db = dbFor(account());
    app = await mountRoute('auth', { supabase: db, user: null });
    const res = await app.post('/set-password', { phone: '9000000001', current_password: 'Temp@1234', new_password: 'BrandNew@1' });
    assert.equal(res.status, 409);
  });

  test('Head Office can reset someone who forgot their password', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ role: 'admin', admin_role: 'VCO' }] }, 'users:update': { data: [{ id: 'u1', status: 'active' }] }, 'user_status_history:insert': { data: [] } });
    app = await mountRoute('users', { supabase: db, user: HO });
    const res = await app.post('/u1/reset-password', { temp_password: 'Temp@1234' });
    assert.equal(res.status, 200, res.text);
    const upd = db.callsTo('users', 'update')[0].payload;
    assert.equal(upd.must_change_password, true, 'they must choose their own next');
    assert.equal(upd.login_locked_at, null);
  });

  test('HR cannot reset a Head Office login', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ role: 'admin', admin_role: 'Head Office' }] } });
    app = await mountRoute('users', { supabase: db, user: HR });
    const res = await app.post('/u1/reset-password', { temp_password: 'Temp@1234' });
    assert.equal(res.status, 403);
    assert.equal(db.callsTo('users', 'update').length, 0);
  });
});

describe('ADM-14 · OTP guessing', () => {
  test('a code dies after five wrong guesses, even if the sixth is right', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ id: 'u1', status: 'active' }] }, 'users:update': { data: [{ id: 'u1' }] } });
    app = await mountRoute('auth', { supabase: db, user: null });
    const sent = await app.post('/send-otp', { phone: '9000000002' });
    const wrong = sent.body.otp === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await app.post('/reset-password', { phone: '9000000002', otp: wrong, new_password: 'BrandNew@1' });
    const res = await app.post('/reset-password', { phone: '9000000002', otp: sent.body.otp, new_password: 'BrandNew@1' });
    assert.equal(res.status, 400);
    assert.equal(db.callsTo('users', 'update').length, 0);
  });
});

describe('PLT-01 · OTP in production', () => {
  test('with no SMS the route says so rather than claiming a code was sent', async () => {
    const was = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const db = fakeSupabase({ 'users:select': { data: [{ id: 'u1', status: 'active' }] } });
      app = await mountRoute('auth', { supabase: db, user: null });
      const res = await app.post('/send-otp', { phone: '9000000003' });
      assert.equal(res.status, 503);
      assert.equal(res.body.otp, undefined);
    } finally {
      process.env.NODE_ENV = was;
    }
  });
});

describe('ADM-12 + ADM-15 · own-record limits', () => {
  test('a Delivery Agent cannot list or edit employees', async () => {
    const db = fakeSupabase({ 'employees:select': { data: [{ id: 'e1' }] } });
    app = await mountRoute('employees', { supabase: db, user: AGENT_A });
    assert.equal((await app.get('/')).status, 403);
    assert.equal((await app.patch('/e1', { designation: 'State Head' })).status, 403);
  });

  test('staff cannot move their own district, state or hub', async () => {
    const db = fakeSupabase({ 'users:update': { data: [{ id: 'hi' }] }, 'users:select': { data: [{}] } });
    app = await mountRoute('auth', { supabase: db, user: INCHARGE });
    await app.patch('/me', { district: 'Madurai', state: 'Kerala', hub_id: 'hub-other', village_town: 'X', email: 'a@b.co' });
    const upd = db.callsTo('users', 'update')[0].payload;
    for (const k of ['district', 'state', 'hub_id', 'village_town']) assert.equal(upd[k], undefined, k);
    assert.equal(upd.email, 'a@b.co', 'their own contact details still save');
  });

  test('a consumer can still edit their own address', async () => {
    const db = fakeSupabase({ 'users:update': { data: [{ id: 'c1' }] }, 'users:select': { data: [{}] } });
    app = await mountRoute('auth', { supabase: db, user: CONSUMER });
    await app.patch('/me', { village_town: 'Adyar' });
    assert.equal(db.callsTo('users', 'update')[0].payload.village_town, 'Adyar');
  });
});

describe('ADM-11 · area limits on other routes', () => {
  test('a Hub Manager cannot export another district', async () => {
    app = await mountRoute('reports', { supabase: fakeSupabase({}), user: HUB_MGR });
    const res = await app.get('/users.csv?district=Madurai');
    assert.equal(res.status, 403);
  });

  test('a Hub Manager cannot decide a return for another hub', async () => {
    const db = fakeSupabase({
      'returns:select': { data: [{ id: 'r1', decision: null, order: parcel({ pickup_hub_id: 'x', delivery_hub_id: 'y' }) }] },
      'hubs:select': { data: [{ id: 'hub-mine' }] },
    });
    app = await mountRoute('returns', { supabase: db, user: HUB_MGR });
    const res = await app.patch('/r1/decide', { decision: 'accepted' });
    assert.equal(res.status, 403);
  });

  test('a manager cannot block a seller in another district', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ district: 'Madurai', state: 'TN' }] } });
    app = await mountRoute('farmers', { supabase: db, user: DM });
    const res = await app.patch('/s1/block', {});
    assert.equal(res.status, 403);
    assert.equal(db.callsTo('users', 'update').length, 0);
  });

  test('a Delivery Agent only sees their own support tickets', async () => {
    const db = fakeSupabase({ 'support_tickets:select': { data: [] } });
    app = await mountRoute('support', { supabase: db, user: AGENT_A });
    await app.get('/');
    const read = db.callsTo('support_tickets', 'select')[0];
    assert.ok(read.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'agent-a'));
  });
});

describe('SEL-02 · subscription sweep', () => {
  const sweep = (db, now = new Date('2026-11-01T00:00:00Z')) => runSubscriptionSweep({
    db,
    notifyEmail: { notifySubscriptionExpired: async () => {}, notifySubscriptionExpiring: async () => {} },
    notifyInApp: async () => {},
    now,
  });

  test('an expired seller is suspended so they can sign in and renew', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ id: 's1', role: 'farmer', status: 'active', subscription_expires_at: '2026-10-01T00:00:00Z' }] }, 'users:update': { data: [] }, 'user_status_history:insert': { data: [] } });
    const r = await sweep(db);
    assert.equal(r.suspended, 1);
    assert.equal(db.callsTo('users', 'update')[0].payload.status, 'suspended');
  });

  test('a seller the old sweep blocked is repaired, and an admin block is left alone', async () => {
    const db = fakeSupabase({
      'users:select': { data: [
        { id: 'old', role: 'farmer', status: 'blocked', block_reason: null, subscription_expires_at: '2026-10-01T00:00:00Z' },
        { id: 'admin-block', role: 'farmer', status: 'blocked', block_reason: 'Fraud', subscription_expires_at: '2026-10-01T00:00:00Z' },
      ] },
      'users:update': { data: [] },
      'user_status_history:insert': { data: [] },
    });
    const r = await sweep(db);
    assert.equal(r.repaired, 1);
  });

  test('a failed write is not counted as done', async () => {
    const db = fakeSupabase({ 'users:select': { data: [{ id: 's1', role: 'farmer', status: 'active', subscription_expires_at: '2026-10-01T00:00:00Z' }] }, 'users:update': { error: { message: 'x' } } });
    assert.equal((await sweep(db)).suspended, 0);
  });
});

describe('FIN-06 · reading past 1,000 rows', () => {
  const pages = (total) => {
    const calls = [];
    return { calls, build: () => ({ range: async (from, to) => { calls.push([from, to]); const n = Math.max(0, Math.min(to + 1, total) - from); return { data: Array.from({ length: n }, (_, i) => ({ i: from + i })), error: null }; } }) };
  };

  test('fetchAll keeps going past a full page', async () => {
    const p = pages(2500);
    const { data, error } = await fetchAll(p.build);
    assert.equal(error, null);
    assert.equal(data.length, 2500);
    assert.equal(p.calls.length, 3);
  });

  test('an exact multiple of the page size still ends', async () => {
    const p = pages(2000);
    assert.equal((await fetchAll(p.build)).data.length, 2000);
  });

  test('a failed page fails the whole read', async () => {
    const res = await fetchAll(() => ({ range: async () => ({ data: null, error: { message: 'x' } }) }));
    assert.ok(res.error);
  });

  test('inChunks splits long id lists', async () => {
    const seen = [];
    const { data } = await inChunks(Array.from({ length: 450 }, (_, i) => i), (ids) => {
      seen.push(ids.length);
      return { range: async () => ({ data: ids.map((id) => ({ id })), error: null }) };
    });
    assert.deepEqual(seen, [200, 200, 50]);
    assert.equal(data.length, 450);
  });
});
