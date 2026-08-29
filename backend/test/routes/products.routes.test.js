// routes/products.js — the product catalogue: public browse + detail (with the
// anonymous-viewer farmer-shaping rule), Head-Office CRUD, per-district govt prices
// (rupees→paise upsert + delete), and the price-sync trigger/status.
//
// priceSync is stubbed in require.cache (like the harness stubs supabase): its
// syncPrices() makes a live HTTPS call to data.gov.in, which a route test must not.
//
// Server closed in afterEach, never inline: a failing assertion would otherwise leak
// the listener and hang `node --test` (see project_route_tests).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const HO = { id: 'ho1', role: 'admin', admin_role: 'Head Office', fname: 'Deepa' };
const DM = { id: 'dm1', role: 'admin', admin_role: 'District Manager' };
const CONSUMER = { id: 'c1', role: 'consumer' };

const PRICESYNC = path.join(__dirname, '..', '..', 'utils', 'priceSync.js');
function stubPriceSync(impl) {
  require.cache[PRICESYNC] = {
    id: PRICESYNC, filename: PRICESYNC, path: path.dirname(PRICESYNC),
    loaded: true, children: [], paths: [], exports: impl,
  };
}

let app = null;
afterEach(async () => {
  if (app) { await app.close(); app = null; }
});

const find = (calls, table, op) => calls.filter((c) => c.table === table && c.op === op);
const hasFilter = (call, wanted) =>
  call.filters.some((f) => JSON.stringify(f) === JSON.stringify(wanted));

// ── GET /products (public) ────────────────────────────────────────────────────
test('GET /products — computes avg_rating and keeps the full price array (admin view)', async () => {
  const db = fakeSupabase({
    'products:select': {
      data: [{
        id: 'p1', name: 'Tomato', product_group: 'Vegetables',
        product_district_prices: [{ district: 'Pudukkottai', market_price: 5000, handling: 100 }],
        product_ratings: [{ farmer_id: 'f1', sum_stars: 9, num_ratings: 2 }, { farmer_id: 'f2', sum_stars: 5, num_ratings: 1 }],
      }],
    },
  });
  app = await mountRoute('products', { supabase: db, user: null });
  const res = await app.get('/');
  assert.equal(res.status, 200);
  const p = res.body.products[0];
  assert.equal(p.avg_rating, '4.7');          // (9+5)/(2+1) = 4.67 → 4.7
  assert.equal(p.product_ratings, undefined);  // internal aggregate is stripped
  assert.ok(Array.isArray(p.product_district_prices), 'full price array kept with no district filter');
});

test('GET /products — ?district= attaches only that district and drops the array', async () => {
  const db = fakeSupabase({
    'products:select': {
      data: [{
        id: 'p1', name: 'Tomato',
        product_district_prices: [
          { district: 'Pudukkottai', market_price: 5000, handling: 100 },
          { district: 'Trichy', market_price: 6000, handling: 120 },
        ],
        product_ratings: [],
      }],
    },
  });
  app = await mountRoute('products', { supabase: db, user: null });
  const res = await app.get('/?district=pudukkottai'); // case-insensitive match
  const p = res.body.products[0];
  assert.equal(p.district_price.district, 'Pudukkottai');
  assert.equal(p.product_district_prices, undefined, 'the full array is hidden from the district view');
});

test('GET /products — no ratings yields a null avg_rating', async () => {
  const db = fakeSupabase({ 'products:select': { data: [{ id: 'p1', name: 'Okra', product_district_prices: [], product_ratings: [] }] } });
  app = await mountRoute('products', { supabase: db, user: null });
  const res = await app.get('/');
  assert.equal(res.body.products[0].avg_rating, null);
});

test('GET /products — group and available query params become filters', async () => {
  const db = fakeSupabase({ 'products:select': { data: [] } });
  app = await mountRoute('products', { supabase: db, user: null });
  await app.get('/?group=Vegetables&available=true');
  const call = find(db.calls, 'products', 'select')[0];
  assert.ok(hasFilter(call, ['eq', 'product_group', 'Vegetables']));
  assert.ok(hasFilter(call, ['eq', 'available', true]), 'the string "true" is coerced to a boolean');
});

test('GET /products — a query error is a 500', async () => {
  const db = fakeSupabase({ 'products:select': { error: { message: 'boom' } } });
  app = await mountRoute('products', { supabase: db, user: null });
  assert.equal((await app.get('/')).status, 500);
});

// ── GET /products/:id (optionalAuth) ──────────────────────────────────────────
test('GET /:id — a missing product is a 404', async () => {
  const db = fakeSupabase({ 'products:select': { data: [] } }); // .single() → PGRST116
  app = await mountRoute('products', { supabase: db, user: null });
  assert.equal((await app.get('/nope')).status, 404);
});

test('GET /:id — a signed-in customer sees the full grower and a computed rating', async () => {
  const db = fakeSupabase({
    'products:select': { data: [{ id: 'p1', name: 'Tomato' }] },
    'farmer_listings:select': { data: [{ id: 'l1', farmer_price: 3000, farmer: { id: 'f1', fname: 'Ram', lname: 'K', village_town: 'Alangudi', district: 'Pudukkottai' } }] },
    'product_ratings:select': { data: [{ farmer_id: 'f1', sum_stars: 8, num_ratings: 2 }] },
  });
  app = await mountRoute('products', { supabase: db, user: CONSUMER });
  const res = await app.get('/p1');
  assert.equal(res.status, 200);
  const l = res.body.listings[0];
  assert.equal(l.farmer.fname, 'Ram', 'a customer sees who they buy from');
  assert.equal(l.farmer_avg_rating, '4.0'); // 8/2
});

test('GET /:id — an anonymous caller sees only the grower district (no identity leak)', async () => {
  const db = fakeSupabase({
    'products:select': { data: [{ id: 'p1', name: 'Tomato' }] },
    'farmer_listings:select': { data: [{ id: 'l1', farmer: { id: 'f1', fname: 'Ram', village_town: 'Alangudi', district: 'Pudukkottai' } }] },
    'product_ratings:select': { data: [] },
  });
  app = await mountRoute('products', { supabase: db, user: null });
  const res = await app.get('/p1');
  const farmer = res.body.listings[0].farmer;
  assert.equal(farmer.district, 'Pudukkottai');
  assert.equal(farmer.fname, undefined, 'no name to an anonymous caller');
  assert.equal(farmer.village_town, undefined);
});

test('GET /:id — a failed listings read is a 500 (not a silent empty list)', async () => {
  const db = fakeSupabase({
    'products:select': { data: [{ id: 'p1', name: 'Tomato' }] },
    'farmer_listings:select': { error: { message: 'boom' } },
  });
  app = await mountRoute('products', { supabase: db, user: null });
  assert.equal((await app.get('/p1')).status, 500);
});

test('GET /:id — a failed ratings read is a 500', async () => {
  const db = fakeSupabase({
    'products:select': { data: [{ id: 'p1', name: 'Tomato' }] },
    'farmer_listings:select': { data: [{ id: 'l1', farmer: { id: 'f1', district: 'PDK' } }] },
    'product_ratings:select': { error: { message: 'boom' } },
  });
  app = await mountRoute('products', { supabase: db, user: null });
  assert.equal((await app.get('/p1')).status, 500);
});

// ── POST /products (Head Office only) ─────────────────────────────────────────
test('POST /products — a non-Head-Office admin is refused (403)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: DM });
  const res = await app.post('/', { code: 'X', name: 'Y', unit: 'kg' });
  assert.equal(res.status, 403);
  assert.equal(find(db.calls, 'products', 'insert').length, 0);
});

test('POST /products — an anonymous caller is turned away (401)', async () => {
  app = await mountRoute('products', { supabase: fakeSupabase(), user: null });
  assert.equal((await app.post('/', { code: 'X', name: 'Y', unit: 'kg' })).status, 401);
});

test('POST /products — missing code/name/unit is a 400', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.post('/', { code: 'X', name: 'Y' }); // no unit
  assert.equal(res.status, 400);
  assert.equal(find(db.calls, 'products', 'insert').length, 0);
});

test('POST /products — creates with sensible defaults (201)', async () => {
  const db = fakeSupabase({ 'products:insert': { data: [{ id: 'p9', code: 'TOM', name: 'Tomato' }] } });
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.post('/', { code: 'TOM', name: 'Tomato', unit: 'kg' });
  assert.equal(res.status, 201);
  const ins = find(db.calls, 'products', 'insert')[0].payload;
  assert.equal(ins.exotic, false);
  assert.equal(ins.platform_fee_pct, 5);
  assert.equal(ins.available, true);
});

test('POST /products — a duplicate code is a 409', async () => {
  const db = fakeSupabase({ 'products:insert': { error: { code: '23505', message: 'dup' } } });
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.post('/', { code: 'TOM', name: 'Tomato', unit: 'kg' });
  assert.equal(res.status, 409);
});

test('POST /products — any other insert error is a 500', async () => {
  const db = fakeSupabase({ 'products:insert': { error: { code: '42P01', message: 'boom' } } });
  app = await mountRoute('products', { supabase: db, user: HO });
  assert.equal((await app.post('/', { code: 'TOM', name: 'Tomato', unit: 'kg' })).status, 500);
});

// ── PATCH /products/:id (Head Office only) ────────────────────────────────────
test('PATCH /:id — a non-Head-Office admin is refused (403)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: DM });
  assert.equal((await app.patch('/p1', { name: 'New' })).status, 403);
});

test('PATCH /:id — no editable fields is a 400', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: HO });
  assert.equal((await app.patch('/p1', { id: 'hack', not_a_field: 1 })).status, 400);
});

test('PATCH /:id — updates whitelisted fields and stamps updated_at', async () => {
  const db = fakeSupabase({ 'products:update': { data: [{ id: 'p1', name: 'New Name' }] } });
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.patch('/p1', { name: 'New Name', available: false });
  assert.equal(res.status, 200);
  const upd = find(db.calls, 'products', 'update')[0].payload;
  assert.equal(upd.name, 'New Name');
  assert.equal(upd.available, false);
  assert.ok(upd.updated_at);
});

test('PATCH /:id — a missing product is a 404', async () => {
  const db = fakeSupabase({ 'products:update': { data: [] } }); // .single() → PGRST116
  app = await mountRoute('products', { supabase: db, user: HO });
  assert.equal((await app.patch('/nope', { name: 'X' })).status, 404);
});

// ── PUT /products/:id/prices (Head Office only) ───────────────────────────────
test('PUT /:id/prices — a missing/empty prices array is a 400', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: HO });
  assert.equal((await app.request('PUT', '/p1/prices', { prices: [] })).status, 400);
  assert.equal(find(db.calls, 'product_district_prices', 'upsert').length, 0);
});

test('PUT /:id/prices — rows with no district or non-positive price are dropped (400 if none remain)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.request('PUT', '/p1/prices', { prices: [{ district: '', market_price_rs: 10 }, { district: 'Trichy', market_price_rs: 0 }] });
  assert.equal(res.status, 400);
  assert.equal(find(db.calls, 'product_district_prices', 'upsert').length, 0);
});

test('PUT /:id/prices — converts rupees to paise and upserts (handling defaults to 0)', async () => {
  const db = fakeSupabase({ 'product_district_prices:upsert': {} });
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.request('PUT', '/p1/prices', { prices: [{ district: 'Pudukkottai', market_price_rs: 150.5 }] });
  assert.equal(res.status, 200);
  const rows = find(db.calls, 'product_district_prices', 'upsert')[0].payload;
  assert.equal(rows[0].product_id, 'p1');
  assert.equal(rows[0].district, 'Pudukkottai');
  assert.equal(rows[0].market_price, 15050); // 150.50 → paise
  assert.equal(rows[0].handling, 0);
});

test('PUT /:id/prices — a failed upsert is a 500', async () => {
  const db = fakeSupabase({ 'product_district_prices:upsert': { error: { message: 'boom' } } });
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.request('PUT', '/p1/prices', { prices: [{ district: 'Trichy', market_price_rs: 50 }] });
  assert.equal(res.status, 500);
});

test('PUT /:id/prices — a non-Head-Office admin is refused (403)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: DM });
  assert.equal((await app.request('PUT', '/p1/prices', { prices: [{ district: 'Trichy', market_price_rs: 50 }] })).status, 403);
});

// ── DELETE /products/:id/prices/:district (Head Office only) ───────────────────
test('DELETE /:id/prices/:district — removes exactly that product+district row', async () => {
  const db = fakeSupabase({ 'product_district_prices:delete': {} });
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.request('DELETE', '/p1/prices/Pudukkottai');
  assert.equal(res.status, 200);
  const del = find(db.calls, 'product_district_prices', 'delete')[0];
  assert.ok(hasFilter(del, ['eq', 'product_id', 'p1']));
  assert.ok(hasFilter(del, ['eq', 'district', 'Pudukkottai']));
});

test('DELETE /:id/prices/:district — a failed delete is a 500', async () => {
  const db = fakeSupabase({ 'product_district_prices:delete': { error: { message: 'boom' } } });
  app = await mountRoute('products', { supabase: db, user: HO });
  assert.equal((await app.request('DELETE', '/p1/prices/Trichy')).status, 500);
});

test('DELETE /:id/prices/:district — a non-Head-Office admin is refused (403)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: DM });
  assert.equal((await app.request('DELETE', '/p1/prices/Trichy')).status, 403);
});

// ── GET /products/sync-prices/status (admin only) ─────────────────────────────
test('GET /sync-prices/status — a non-admin is refused (403)', async () => {
  stubPriceSync({ getLastSync: () => null, syncPrices: async () => ({}) });
  app = await mountRoute('products', { supabase: fakeSupabase(), user: CONSUMER });
  assert.equal((await app.get('/sync-prices/status')).status, 403);
});

test('GET /sync-prices/status — an admin gets the last-sync state (routed past /:id)', async () => {
  stubPriceSync({ getLastSync: () => ({ status: 'ok', updated: 5 }), syncPrices: async () => ({}) });
  app = await mountRoute('products', { supabase: fakeSupabase(), user: HO });
  const res = await app.get('/sync-prices/status');
  assert.equal(res.status, 200);
  assert.equal(res.body.sync.status, 'ok');
});

// ── POST /products/sync-prices (Head Office only) ─────────────────────────────
test('POST /sync-prices — a non-Head-Office admin is refused (403)', async () => {
  stubPriceSync({ getLastSync: () => null, syncPrices: async () => ({ status: 'ok' }) });
  app = await mountRoute('products', { supabase: fakeSupabase(), user: DM });
  assert.equal((await app.post('/sync-prices', {})).status, 403);
});

test('POST /sync-prices — Head Office triggers a sync and gets the result', async () => {
  stubPriceSync({ getLastSync: () => null, syncPrices: async () => ({ status: 'ok', updated: 3 }) });
  app = await mountRoute('products', { supabase: fakeSupabase(), user: HO });
  const res = await app.post('/sync-prices', {});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.updated, 3);
});

test('POST /sync-prices — a sync failure is a 500, not a crash', async () => {
  stubPriceSync({ getLastSync: () => null, syncPrices: async () => { throw new Error('data.gov down'); } });
  app = await mountRoute('products', { supabase: fakeSupabase(), user: HO });
  const res = await app.post('/sync-prices', {});
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'data.gov down');
});

// ── DELETE /products/:id (Head Office only) ───────────────────────────────────
test('DELETE /:id — Head Office deletes the product', async () => {
  const db = fakeSupabase({ 'products:delete': {} });
  app = await mountRoute('products', { supabase: db, user: HO });
  const res = await app.request('DELETE', '/p1');
  assert.equal(res.status, 200);
  assert.ok(hasFilter(find(db.calls, 'products', 'delete')[0], ['eq', 'id', 'p1']));
});

test('DELETE /:id — a failed delete is a 404', async () => {
  const db = fakeSupabase({ 'products:delete': { error: { message: 'boom' } } });
  app = await mountRoute('products', { supabase: db, user: HO });
  assert.equal((await app.request('DELETE', '/p1')).status, 404);
});

test('DELETE /:id — a non-Head-Office admin is refused (403)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('products', { supabase: db, user: DM });
  assert.equal((await app.request('DELETE', '/p1')).status, 403);
});

// ── GET /products/categories (facets) + the paginated shape ───────────────────
test('GET /products/categories — distinct categories with counts, blanks skipped', async () => {
  const db = fakeSupabase({
    'products:select': {
      data: [
        { category: 'Vegetables' }, { category: 'Vegetables' }, { category: 'Fruits' },
        { category: null }, { category: '   ' },
      ],
    },
  });
  app = await mountRoute('products', { supabase: db, user: null });
  const res = await app.get('/categories'); // router is mounted at /, so /api/products/categories
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.categories, [
    { name: 'Fruits', count: 1 },
    { name: 'Vegetables', count: 2 },
  ]);
});

test('GET /products — returns a numeric count (not coerced to a rupee string)', async () => {
  const db = fakeSupabase({
    'products:select': {
      data: [{ id: 'p1', name: 'Okra', product_district_prices: [], product_ratings: [] }],
      count: 22,
    },
  });
  app = await mountRoute('products', { supabase: db, user: null });
  const res = await app.get('/');
  assert.equal(res.status, 200);
  // count MUST stay the integer 22 — the money middleware coerces fields named
  // like money (total/amount/...); this pins that `count` is not one of them.
  assert.strictEqual(res.body.count, 22);
  assert.ok('limit' in res.body && 'offset' in res.body, 'paging metadata present');
});
