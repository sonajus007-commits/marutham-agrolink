// GET /ratings/mine — a seller's own customer-ratings summary.
// Server closed in afterEach, never inline: a failing assertion would otherwise leak
// the listener and hang `node --test` (see project_route_tests).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const FARMER = { id: 'f1', role: 'farmer' };
const CONSUMER = { id: 'c1', role: 'consumer' };

let app = null;
afterEach(async () => { if (app) { await app.close(); app = null; } });

test('GET /ratings/mine — averages across the seller\'s rated products', async () => {
  const db = fakeSupabase({
    'product_ratings:select': { data: [
      { product_id: 'p1', sum_stars: 18, num_ratings: 4, product: { name: 'Tomato', unit: 'kg' } }, // 4.5
      { product_id: 'p2', sum_stars: 5,  num_ratings: 1, product: { name: 'Onion',  unit: 'kg' } }, // 5.0
    ] },
  });
  app = await mountRoute('ratings', { supabase: db, user: FARMER });
  const res = await app.get('/mine');

  assert.equal(res.status, 200);
  assert.equal(res.body.total_ratings, 5);
  assert.equal(res.body.avg, 4.6);                       // 23 stars / 5 ratings
  assert.equal(res.body.products.length, 2);
  assert.equal(res.body.products[0].product, 'Onion');   // 5.0 sorts above Tomato's 4.5
});

test('GET /ratings/mine — a seller with no ratings gets a clean zero, not an error', async () => {
  const db = fakeSupabase({ 'product_ratings:select': { data: [] } });
  app = await mountRoute('ratings', { supabase: db, user: FARMER });
  const res = await app.get('/mine');

  assert.equal(res.status, 200);
  assert.equal(res.body.avg, 0);
  assert.equal(res.body.total_ratings, 0);
});

test('GET /ratings/mine — a consumer has no seller ratings (403)', async () => {
  app = await mountRoute('ratings', { supabase: fakeSupabase(), user: CONSUMER });
  const res = await app.get('/mine');
  assert.equal(res.status, 403);
});

test('GET /ratings/mine — a failed read is a 500, never a false "no ratings"', async () => {
  const db = fakeSupabase({ 'product_ratings:select': { error: { message: 'boom' } } });
  app = await mountRoute('ratings', { supabase: db, user: FARMER });
  const res = await app.get('/mine');
  assert.equal(res.status, 500);
});
