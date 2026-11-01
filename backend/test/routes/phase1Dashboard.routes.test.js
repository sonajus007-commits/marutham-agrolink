// ADM-01: a multi-seller order is a parent plus a child per seller, and each row holds
// money. These pin the rule that keeps it from being counted twice on every dashboard.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

let app;
afterEach(async () => { if (app) { await app.close(); app = null; } });

const NOW = new Date().toISOString();
const rows = [
  { id: 'p1', total: 30000, market_fee: 1000, status: 'Order Received', cancelled: false, district: 'Chennai', created_at: NOW, route: 'split', parent_order_id: null },
  { id: 'c1', total: 20000, market_fee: 700, status: 'Order Received', cancelled: false, district: 'Madurai', created_at: NOW, route: '', parent_order_id: 'p1' },
  { id: 'c2', total: 10000, market_fee: 300, status: 'Order Received', cancelled: false, district: 'Salem', created_at: NOW, route: '', parent_order_id: 'p1' },
  { id: 's1', total: 5000, market_fee: 200, status: 'Delivered', cancelled: false, district: 'Madurai', created_at: NOW, route: 'direct', parent_order_id: null },
];
const db = (extra = {}) => fakeSupabase({
  'orders:select': { data: rows },
  'order_items:select': { data: [{ product_id: 'p', qty: 1, price: 20000, product: { name: 'Tomato', unit: 'kg' } }] },
  'users:select': { data: [], count: 0 },
  'returns:select': { data: [], count: 0 },
  ...extra,
});

test('the company view counts one order, not parent plus children', async () => {
  app = await mountRoute('dashboard', { supabase: db(), user: { id: 'h', role: 'admin', admin_role: 'Head Office' } });
  const res = await app.get('/');
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.kpis.total_orders, 2);
  assert.equal(res.body.kpis.gmv_rupees, '350.00');
  assert.equal(res.body.kpis.platform_fee_rupees, '12.00');
});

test('top products still see the lines, which live on the parcels', async () => {
  const d = db();
  app = await mountRoute('dashboard', { supabase: d, user: { id: 'h', role: 'admin', admin_role: 'Head Office' } });
  const res = await app.get('/');
  assert.equal(res.body.top_products.length, 1);
  const ask = d.callsTo('order_items', 'select')[0].filters.find((f) => f[0] === 'in');
  assert.deepEqual(ask[2].sort(), ['c1', 'c2', 's1']);
});

test('a district view counts the parcels in that district', async () => {
  const d = db();
  d.on('orders', 'select', { data: rows.filter((r) => r.district === 'Madurai') });
  app = await mountRoute('dashboard', { supabase: d, user: { id: 'dm', role: 'admin', admin_role: 'District Manager', district: 'Madurai' } });
  const res = await app.get('/');
  assert.equal(res.body.kpis.total_orders, 2);
  assert.equal(res.body.kpis.gmv_rupees, '250.00');
});
