// Consumer wishlist (migration 056): a buyer saves products for later, scoped to
// themselves. Locks the consumer-only gate, the scoping, and the idempotent add.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const CONSUMER = { id: 'c1', role: 'consumer' };
const FARMER = { id: 'f1', role: 'farmer' };

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('GET /wishlist — returns the caller\'s saved items, scoped to them', async () => {
  const db = fakeSupabase({ 'wishlists:select': { data: [{ product_id: 'p1', product: { id: 'p1', name: 'Tomato' } }] } });
  app = await mountRoute('wishlist', { supabase: db, user: CONSUMER });
  const res = await app.get('/');

  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  const read = db.callsTo('wishlists', 'select')[0];
  assert.ok(read.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'c1'));
});

test('POST /wishlist — saves (upserts) a product for the caller', async () => {
  const db = fakeSupabase({ 'wishlists:upsert': { data: [] } });
  app = await mountRoute('wishlist', { supabase: db, user: CONSUMER });
  const res = await app.post('/', { product_id: '11111111-1111-4111-8111-111111111111' });

  assert.equal(res.status, 201);
  const up = db.callsTo('wishlists', 'upsert')[0].payload;
  assert.equal(up.user_id, 'c1');
  assert.equal(up.product_id, '11111111-1111-4111-8111-111111111111');
});

test('POST /wishlist — a non-uuid product_id is a 400', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('wishlist', { supabase: db, user: CONSUMER });
  const res = await app.post('/', { product_id: 'nope' });
  assert.equal(res.status, 400);
});

test('DELETE /wishlist/:productId — removes only the caller\'s row', async () => {
  const db = fakeSupabase({ 'wishlists:delete': { data: [] } });
  app = await mountRoute('wishlist', { supabase: db, user: CONSUMER });
  const res = await app.request('DELETE', '/p1');

  assert.equal(res.status, 200);
  const del = db.callsTo('wishlists', 'delete')[0];
  assert.ok(del.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'c1'));
  assert.ok(del.filters.some((f) => f[0] === 'eq' && f[1] === 'product_id' && f[2] === 'p1'));
});

test('a non-consumer has no wishlist (403)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('wishlist', { supabase: db, user: FARMER });
  assert.equal((await app.get('/')).status, 403);
  assert.equal((await app.post('/', { product_id: '11111111-1111-4111-8111-111111111111' })).status, 403);
});
