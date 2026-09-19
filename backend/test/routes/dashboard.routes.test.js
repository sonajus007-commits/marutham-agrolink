// Route tests for GET /dashboard/hub — the per-hub in/out attribution dashboard
// (Hub Management, Phase 3).
//
// These pin three things that only show up through the real request path:
//  1. SCOPE — a Hub Manager sees their own hub; a District Manager rolls up the
//     district's taluk hubs.
//  2. ATTRIBUTION — IN counts pickup_hub_id, OUT counts delivery_hub_id, and a
//     split-parent CONTAINER (route='split') is excluded from OUT so a split order
//     is not counted twice.
//  3. THE MONEY-MIDDLEWARE COLLISION — the app wraps res.json to coerce every
//     MONEY_FIELDS key (which includes `total`) from paise to a rupee string. The
//     count field is deliberately NOT called `total`; this asserts it comes back an
//     integer, which is exactly what breaks if someone renames it back.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const HUB_A = 'hub-alangudi';
const HUB_B = 'hub-thirumayam';

// Orders spanning both hubs, a split parent, and a cancelled row.
const ORDERS = [
  // IN to A (seller in A's taluk), delivered OUT of B.
  { id: 'o1', total: 10000, status: 'Delivered', cancelled: false, route: '', pickup_hub_id: HUB_A, delivery_hub_id: HUB_B, created_at: '2026-08-01T00:00:00Z', delivered_at: '2026-08-02T00:00:00Z' },
  // OUT to A, active.
  { id: 'o2', total: 5000, status: 'Packaged', cancelled: false, route: '', pickup_hub_id: HUB_B, delivery_hub_id: HUB_A, created_at: '2026-08-03T00:00:00Z', delivered_at: null },
  // A SPLIT PARENT delivered to A — must NOT count as OUT (the children do).
  { id: 'o3p', total: 8000, status: 'Order Placed', cancelled: false, route: 'split', pickup_hub_id: null, delivery_hub_id: HUB_A, created_at: '2026-08-04T00:00:00Z', delivered_at: null },
  // Its child parcel, delivered to A — the real OUT parcel.
  { id: 'o3c', total: 8000, status: 'Packaged', cancelled: false, route: '', pickup_hub_id: HUB_B, delivery_hub_id: HUB_A, created_at: '2026-08-04T00:00:00Z', delivered_at: null },
  // Cancelled OUT to A — counts in `count` but never in revenue/active.
  { id: 'o4', total: 9000, status: 'Cancelled', cancelled: true, route: '', pickup_hub_id: HUB_B, delivery_hub_id: HUB_A, created_at: '2026-08-05T00:00:00Z', delivered_at: null },
  // Unrelated hub — never in scope here.
  { id: 'o5', total: 3000, status: 'Packaged', cancelled: false, route: '', pickup_hub_id: 'hub-else', delivery_hub_id: 'hub-else', created_at: '2026-08-06T00:00:00Z', delivered_at: null },
];

const HUB_ROW_A = { id: HUB_A, name: 'Alangudi Hub', taluk: 'Alangudi', district: 'Pudukkottai', state: 'Tamil Nadu', hub_type: 'taluk' };
const HUB_ROW_B = { id: HUB_B, name: 'Thirumayam Hub', taluk: 'Thirumayam', district: 'Pudukkottai', state: 'Tamil Nadu', hub_type: 'taluk' };

describe('GET /dashboard/hub', () => {
  let app;
  afterEach(async () => { if (app) await app.close(); });

  test('Hub Manager sees ONLY their own hub, with IN/OUT attributed', async () => {
    const supa = fakeSupabase({
      'hubs:select': { data: [HUB_ROW_A] }, // .eq('hub_manager_id', self)
      'orders:select': { data: ORDERS },
    });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'hm1', role: 'admin', role_key: 'hub_manager', admin_role: 'Hub Manager', dashboards: { hub: true } },
    });

    const res = await app.get('/hub');
    assert.equal(res.status, 200);
    assert.equal(res.body.scope.level, 'hub');
    assert.equal(res.body.scope.name, 'Alangudi Hub');
    assert.equal(res.body.hubs.length, 1);

    // IN to A: only o1 (pickup_hub_id === A). OUT to A: o2 + o3c + o4(cancelled) = 3
    // parcels; the split PARENT o3p is excluded.
    assert.equal(res.body.totals.in.count, 1);
    assert.equal(res.body.totals.out.count, 3, 'split parent must not inflate OUT');
    assert.equal(res.body.totals.out.active, 2, 'cancelled is not active');
    // OUT revenue = o2 + o3c (o4 cancelled excluded) = (5000 + 8000)/100 = 130.
    assert.equal(res.body.totals.out.revenue, 130);
  });

  test('the count field survives the money middleware as an INTEGER', async () => {
    // The app wraps res.json to convert MONEY_FIELDS (incl. `total`) paise→rupee
    // string. If the count were named `total`, one order would come back "0.01".
    const supa = fakeSupabase({
      'hubs:select': { data: [HUB_ROW_A] },
      'orders:select': { data: [ORDERS[1]] }, // one OUT parcel to A
    });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'hm1', role: 'admin', role_key: 'hub_manager', admin_role: 'Hub Manager', dashboards: { hub: true } },
    });

    const res = await app.get('/hub');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.totals.out.count, 'number');
    assert.equal(res.body.totals.out.count, 1);
    assert.equal(res.body.totals.out.total, undefined, 'must not carry a money-named `total` key');
  });

  test('District Manager rolls up every taluk hub in the district', async () => {
    const supa = fakeSupabase({
      'hubs:select': { data: [HUB_ROW_A, HUB_ROW_B] }, // .eq('district').eq('hub_type','taluk')
      'orders:select': { data: ORDERS },
    });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'dm1', role: 'admin', role_key: 'district_manager', admin_role: 'District Manager', district: 'Pudukkottai', dashboards: { hub: true } },
    });

    const res = await app.get('/hub');
    assert.equal(res.status, 200);
    assert.equal(res.body.scope.level, 'district');
    assert.equal(res.body.scope.name, 'Pudukkottai');
    assert.equal(res.body.hubs.length, 2);

    // Across A and B: IN = o1(A) + o2(B) + o3c(B) + o4(B) = 4 (o3p parent has null
    // pickup). OUT = o1(B) + o2(A) + o3c(A) + o4(A) = 4 (o3p parent excluded).
    assert.equal(res.body.totals.in.count, 4);
    assert.equal(res.body.totals.out.count, 4, 'split parent excluded from the roll-up too');

    const byId = Object.fromEntries(res.body.hubs.map((h) => [h.id, h]));
    assert.equal(byId[HUB_A].out.count, 3); // o2 + o3c + o4
    assert.equal(byId[HUB_B].out.count, 1); // o1
  });

  test('transit: parcels at the hub, inbound, aging alert, and staff on duty', async () => {
    const oldTs = new Date(Date.now() - 8 * 3600 * 1000).toISOString(); // >6h → aging
    const freshTs = new Date().toISOString();
    const supa = fakeSupabase({
      'hubs:select': { data: [HUB_ROW_A] },
      'orders:select': {
        data: [
          { id: 'a1', total: 1000, status: 'At Hub', cancelled: false, route: '', pickup_hub_id: HUB_B, delivery_hub_id: HUB_A, created_at: oldTs, delivered_at: null, updated_at: oldTs },
          { id: 'a2', total: 1000, status: 'At Hub', cancelled: false, route: '', pickup_hub_id: HUB_B, delivery_hub_id: HUB_A, created_at: freshTs, delivered_at: null, updated_at: freshTs },
          { id: 'a3', total: 1000, status: 'In Transit', cancelled: false, route: '', pickup_hub_id: HUB_B, delivery_hub_id: HUB_A, created_at: freshTs, delivered_at: null, updated_at: freshTs },
        ],
      },
      'staff_attendance:select': {
        data: [
          { admin_role: 'VCO', checked_in_at: 't', checked_out_at: null },
          { admin_role: 'Delivery Agent', checked_in_at: 't', checked_out_at: null },
        ],
      },
    });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'hm1', role: 'admin', role_key: 'hub_manager', admin_role: 'Hub Manager', district: 'Pudukkottai', dashboards: { hub: true } },
    });

    const res = await app.get('/hub');
    assert.equal(res.status, 200);
    assert.equal(res.body.transit.at_hub, 2);
    assert.equal(res.body.transit.inbound, 1);
    assert.equal(res.body.transit.aging, 1, 'only the stale At-Hub parcel is aging');
    assert.equal(res.body.staff.on_duty, 2);
    assert.equal(res.body.staff.vcos, 1);
    assert.equal(res.body.staff.agents, 1);
    assert.ok(res.body.alerts.some((a) => a.type === 'hub_aging'), 'an aging alert is raised');
  });

  test('403 for a role without the hub dashboard flag', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [] }, 'orders:select': { data: [] } });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'v1', role: 'admin', role_key: 'vco', admin_role: 'VCO', dashboards: {} },
    });

    const res = await app.get('/hub');
    assert.equal(res.status, 403);
  });

  // ── GET /dashboard/finance (Phase 4 — the Finance role home) ──────────────────
  test('finance dashboard returns the real money cuts in RUPEES', async () => {
    const today = new Date().toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    const supa = fakeSupabase({
      'orders:select': {
        data: [
          // paid order: counts toward GMV + commission + delivery, NOT receivables
          { total: 10000, market_fee: 2000, delivery: 3000, cancelled: false, pay_status: 'paid', status: 'Delivered', created_at: today },
          // COD in flight: counts toward receivables
          { total: 5000, market_fee: 1000, delivery: 0, cancelled: false, pay_status: 'cod', status: 'Out for Delivery', created_at: today },
          // cancelled: excluded everywhere
          { total: 9999, market_fee: 9999, delivery: 9999, cancelled: true, pay_status: 'paid', status: 'Cancelled', created_at: today },
        ],
      },
      'payouts:select': {
        data: [
          { amount: 4000, status: 'paid', paid_at: today, created_at: today },
          { amount: 6000, status: 'pending', paid_at: null, created_at: tenDaysAgo }, // stale (>7d)
        ],
      },
      'users:select': { data: [] },
    });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'fin1', role: 'admin', role_key: 'finance', admin_role: 'Finance Manager', dashboards: { finance: true } },
    });

    const res = await app.get('/finance');
    assert.equal(res.status, 200);
    // paise → rupees, cancelled excluded
    assert.equal(res.body.financial.platform_commission, 30); // (2000+1000)/100
    assert.equal(res.body.financial.delivery_income, 30); // (3000+0)/100
    assert.equal(res.body.financial.settlement_today, 40); // the paid-today payout
    assert.equal(res.body.financial.payouts_pending, 60);
    assert.equal(res.body.financial.receivables, 50); // only the unpaid COD order
    assert.equal(res.body.gmv.month, 150); // (10000+5000)/100, cancelled excluded
    assert.equal(res.body.payouts_aging.pending_count, 1);
    assert.equal(res.body.payouts_aging.stale_count, 1);
  });

  test('finance dashboard 403s a role without the finance flag', async () => {
    const supa = fakeSupabase({ 'orders:select': { data: [] }, 'payouts:select': { data: [] }, 'users:select': { data: [] } });
    app = await mountRoute('dashboard', {
      supabase: supa,
      // A district manager has payments:view but is geo-scoped — no company-wide finance.
      user: { id: 'dm1', role: 'admin', role_key: 'district_manager', admin_role: 'District Manager', dashboards: {} },
    });
    const res = await app.get('/finance');
    assert.equal(res.status, 403);
  });

  // ── GET /dashboard/category (Phase 4 — the Category role home) ─────────────────
  test('category dashboard rolls up the catalogue and the review queues', async () => {
    const supa = fakeSupabase({
      'products:select': {
        data: [
          { product_group: 'Vegetables', available: true },
          { product_group: 'Vegetables', available: true },
          { product_group: 'Fruits', available: false },
        ],
      },
      'farmer_listings:select': {
        data: [
          { listing_status: 'active' },
          { listing_status: 'active' },
          { listing_status: 'pending' },
          { listing_status: 'rejected' },
        ],
      },
      'product_requests:select': {
        data: [{ status: 'pending' }, { status: 'approved' }],
      },
    });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'cat1', role: 'admin', role_key: 'category', admin_role: 'Category Manager', dashboards: { category: true } },
    });

    const res = await app.get('/category');
    assert.equal(res.status, 200);
    assert.equal(res.body.catalogue.count, 3);
    assert.equal(res.body.catalogue.available, 2); // the unavailable Fruits row is excluded
    assert.equal(res.body.catalogue.groups, 2);
    // by_group is ranked, biggest first
    assert.equal(res.body.catalogue.by_group[0].group, 'Vegetables');
    assert.equal(res.body.catalogue.by_group[0].count, 2);
    assert.equal(res.body.listings.active, 2);
    assert.equal(res.body.listings.pending, 1);
    assert.equal(res.body.requests.pending, 1);
    assert.equal(res.body.catalogue.total, undefined, 'no money-named `total` key');
  });

  test('category dashboard 403s a role without the category flag', async () => {
    const supa = fakeSupabase({ 'products:select': { data: [] }, 'farmer_listings:select': { data: [] }, 'product_requests:select': { data: [] } });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'v1', role: 'admin', role_key: 'vco', admin_role: 'VCO', dashboards: {} },
    });
    const res = await app.get('/category');
    assert.equal(res.status, 403);
  });
});
