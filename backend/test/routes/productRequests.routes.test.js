// Seller product requests (migration 054): a seller proposes an off-catalogue
// product, a reviewer approves (creating the catalogue row) or rejects. These lock
// the role gates, the create-on-approve, and the pending-only transitions.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const FARMER = { id: 'f1', role: 'farmer', fname: 'Asha' };
const CONSUMER = { id: 'c1', role: 'consumer' };
const HO = { id: 'ho1', role: 'admin', admin_role: 'Head Office', fname: 'HO' };

const pendingReq = (over = {}) => ({
  id: 'r1',
  requested_by: 'f1',
  name: 'Millet Flour',
  unit: 'packet',
  regional_name: null,
  category: 'Groceries',
  note: 'Packaged 1kg',
  status: 'pending',
  ...over,
});

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('POST / — a seller submits a request, scoped to themselves', async () => {
  const db = fakeSupabase({ 'product_requests:insert': { data: pendingReq() } });
  app = await mountRoute('productRequests', { supabase: db, user: FARMER });
  const res = await app.post('/', { name: 'Millet Flour', unit: 'packet', category: 'Groceries' });

  assert.equal(res.status, 201);
  const ins = db.callsTo('product_requests', 'insert')[0].payload;
  assert.equal(ins.requested_by, 'f1'); // the caller, never a client claim
  assert.equal(ins.name, 'Millet Flour');
  assert.equal(ins.status, 'pending');
});

test('POST / — a consumer cannot request a product (403)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('productRequests', { supabase: db, user: CONSUMER });
  const res = await app.post('/', { name: 'X', unit: 'kg' });

  assert.equal(res.status, 403);
  assert.equal(db.callsTo('product_requests', 'insert').length, 0);
});

test('POST / — a missing name is a 400', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('productRequests', { supabase: db, user: FARMER });
  const res = await app.post('/', { unit: 'kg' });
  assert.equal(res.status, 400);
});

test('GET / — a seller sees only their own requests', async () => {
  const db = fakeSupabase({ 'product_requests:select': { data: [pendingReq()] } });
  app = await mountRoute('productRequests', { supabase: db, user: FARMER });
  const res = await app.get('/');

  assert.equal(res.status, 200);
  const read = db.callsTo('product_requests', 'select')[0];
  assert.ok(read.filters.some((f) => f[0] === 'eq' && f[1] === 'requested_by' && f[2] === 'f1'));
});

test('POST /:id/approve — creates the catalogue product and closes the request', async () => {
  const db = fakeSupabase({
    'product_requests:select': { data: [pendingReq()] },
    'products:insert': { data: { id: 'p1', code: 'g01', name: 'Millet Flour', unit: 'packet' } },
    'product_requests:update': { data: [] },
  });
  app = await mountRoute('productRequests', { supabase: db, user: HO });
  const res = await app.post('/r1/approve', { code: 'g01' });

  assert.equal(res.status, 200);
  const prod = db.callsTo('products', 'insert')[0].payload;
  assert.equal(prod.code, 'g01');
  assert.equal(prod.name, 'Millet Flour'); // carried from the request
  assert.equal(prod.unit, 'packet');
  const upd = db.callsTo('product_requests', 'update')[0].payload;
  assert.equal(upd.status, 'approved');
  assert.equal(upd.product_id, 'p1');
});

test('POST /:id/approve — a duplicate code is a 409, not a 500', async () => {
  const db = fakeSupabase({
    'product_requests:select': { data: [pendingReq()] },
    'products:insert': { error: { code: '23505', message: 'dup' } },
  });
  app = await mountRoute('productRequests', { supabase: db, user: HO });
  const res = await app.post('/r1/approve', { code: 'p07' });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /already exists/i);
});

test('POST /:id/approve — an already-decided request is a 409', async () => {
  const db = fakeSupabase({ 'product_requests:select': { data: [pendingReq({ status: 'approved' })] } });
  app = await mountRoute('productRequests', { supabase: db, user: HO });
  const res = await app.post('/r1/approve', { code: 'g01' });

  assert.equal(res.status, 409);
  assert.equal(db.callsTo('products', 'insert').length, 0);
});

test('POST /:id/approve — a seller cannot approve (403)', async () => {
  const db = fakeSupabase({ 'product_requests:select': { data: [pendingReq()] } });
  app = await mountRoute('productRequests', { supabase: db, user: FARMER });
  const res = await app.post('/r1/approve', { code: 'g01' });

  assert.equal(res.status, 403);
  assert.equal(db.callsTo('products', 'insert').length, 0);
});

test('POST /:id/reject — records the reason and closes the request', async () => {
  const db = fakeSupabase({
    'product_requests:select': { data: [pendingReq()] },
    'product_requests:update': { data: [] },
  });
  app = await mountRoute('productRequests', { supabase: db, user: HO });
  const res = await app.post('/r1/reject', { reason: 'Already in the catalogue as Ragi Flour.' });

  assert.equal(res.status, 200);
  const upd = db.callsTo('product_requests', 'update')[0].payload;
  assert.equal(upd.status, 'rejected');
  assert.match(upd.review_reason, /Ragi Flour/);
});

test('POST /:id/reject — a missing reason is a 400', async () => {
  const db = fakeSupabase({ 'product_requests:select': { data: [pendingReq()] } });
  app = await mountRoute('productRequests', { supabase: db, user: HO });
  const res = await app.post('/r1/reject', {});
  assert.equal(res.status, 400);
});
