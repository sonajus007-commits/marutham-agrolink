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

  test('403 for a role without the hub dashboard flag', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [] }, 'orders:select': { data: [] } });
    app = await mountRoute('dashboard', {
      supabase: supa,
      user: { id: 'v1', role: 'admin', role_key: 'vco', admin_role: 'VCO', dashboards: {} },
    });

    const res = await app.get('/hub');
    assert.equal(res.status, 403);
  });
});
