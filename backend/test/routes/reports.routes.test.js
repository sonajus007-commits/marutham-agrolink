// CSV report export (routes/reports). Gated on reports_export:view; returns a real
// text/csv attachment. These lock the gate and the CSV shape (money as rupees).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const STAFF = { id: 's1', role: 'admin', admin_role: 'District Manager', fname: 'DM' };
const CONSUMER = { id: 'c1', role: 'consumer' };

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('GET /reports/orders.csv — returns a CSV attachment with headers and rupee money', async () => {
  const db = fakeSupabase({
    'orders:select': {
      data: [
        { code: 'ORD1', consumer_name: 'Asha', district: 'Pudukkottai', status: 'Delivered', pay_method: 'UPI', pay_status: 'paid', item_total: 4200, delivery: 0, total: 4200, created_at: '2026-08-01', delivered_at: '2026-08-02' },
      ],
    },
  });
  app = await mountRoute('reports', { supabase: db, user: STAFF });
  const res = await app.get('/orders.csv');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/csv/);
  assert.match(res.headers['content-disposition'] || '', /attachment; filename="orders.csv"/);
  assert.match(res.text, /Order Code,Customer/); // header line
  assert.match(res.text, /ORD1,Asha/);
  assert.match(res.text, /42\.00/); // paise 4200 → rupees
});

test('GET /reports/users.csv — a consumer is refused (403)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('reports', { supabase: db, user: CONSUMER });
  const res = await app.get('/users.csv');

  assert.equal(res.status, 403);
});

test('GET /reports/payouts.csv — staff get a CSV (empty is still a valid file)', async () => {
  const db = fakeSupabase({ 'payouts:select': { data: [] } });
  app = await mountRoute('reports', { supabase: db, user: STAFF });
  const res = await app.get('/payouts.csv');

  assert.equal(res.status, 200);
  assert.match(res.text, /Seller,District/);
});
