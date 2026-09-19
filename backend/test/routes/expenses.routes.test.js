// Operating-expense ledger (migration 062): the Finance role records expenses; the
// dashboards turn revenue − expenses into EBITDA / net profit. These lock the
// permission gate, the rupees→paise conversion + server-set attribution, the closed
// category list, and the period summary (operating vs below-the-line).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');
const { expenseSummary } = require('../../utils/expenses');

const FIN = { id: 'fin1', role: 'admin', role_key: 'finance', admin_role: 'Finance Manager', fname: 'Bhavani', lname: 'R' };
const CONSUMER = { id: 'c1', role: 'consumer' };

let app = null;
afterEach(async () => { if (app) { await app.close(); app = null; } });

test('POST / — Finance records an expense; rupees→paise, attribution from the caller', async () => {
  const db = fakeSupabase({ 'expenses:insert': { data: { id: 'e1', category: 'fuel', amount: 150000 } } });
  app = await mountRoute('expenses', { supabase: db, user: FIN });
  const res = await app.post('/', { category: 'fuel', amount: 1500, vendor: 'HP Petrol', note: 'Van refuel' });

  assert.equal(res.status, 201);
  const ins = db.callsTo('expenses', 'insert')[0].payload;
  assert.equal(ins.amount, 150000); // ₹1500 → paise
  assert.equal(ins.category, 'fuel');
  assert.equal(ins.created_by, 'fin1'); // the caller, never a body field
  assert.equal(ins.created_by_name, 'Bhavani R');
  assert.equal(ins.vendor, 'HP Petrol');
});

test('POST / — a role without payments:create is refused (403, no insert)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('expenses', { supabase: db, user: CONSUMER });
  const res = await app.post('/', { category: 'fuel', amount: 1500 });
  assert.equal(res.status, 403);
  assert.equal(db.callsTo('expenses', 'insert').length, 0);
});

test('POST / — an unknown category is rejected before any DB call (400)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('expenses', { supabase: db, user: FIN });
  const res = await app.post('/', { category: 'bribes', amount: 100 });
  assert.equal(res.status, 400);
  assert.equal(db.callsTo('expenses', 'insert').length, 0);
});

test('POST / — a non-positive amount is rejected (400)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('expenses', { supabase: db, user: FIN });
  const res = await app.post('/', { category: 'salary', amount: 0 });
  assert.equal(res.status, 400);
});

test('GET / — returns the month list with an operating / below-the-line summary', async () => {
  const db = fakeSupabase({
    'expenses:select': {
      data: [
        { id: 'e1', category: 'salary', amount: 5000000, incurred_on: '2026-09-03' },
        { id: 'e2', category: 'fuel', amount: 200000, incurred_on: '2026-09-10' },
        { id: 'e3', category: 'tax', amount: 800000, incurred_on: '2026-09-12' }, // below the line
      ],
    },
  });
  app = await mountRoute('expenses', { supabase: db, user: FIN });
  const res = await app.get('/?month=2026-09');

  assert.equal(res.status, 200);
  assert.equal(res.body.expenses.length, 3);
  // summary is exposed in RUPEES under money-safe keys (`spent`, not `total`)
  assert.equal(res.body.summary.spent, 60000);      // (5000000 + 200000 + 800000) paise → ₹
  assert.equal(res.body.summary.operating, 52000);  // spent minus the tax row
  assert.equal(res.body.summary.below_line, 8000);
  assert.equal(res.body.summary.by_category.salary, 50000);
});

test('DELETE /:id — needs payments:delete', async () => {
  const db = fakeSupabase({ 'expenses:delete': { data: null } });
  app = await mountRoute('expenses', { supabase: db, user: CONSUMER });
  const res = await app.delete('/e1');
  assert.equal(res.status, 403);
});

test('expenseSummary splits operating vs below-the-line', () => {
  const s = expenseSummary([
    { category: 'salary', amount: 100 },
    { category: 'interest', amount: 30 },
    { category: 'depreciation', amount: 20 },
    { category: 'fuel', amount: 50 },
  ]);
  assert.equal(s.total, 200);
  assert.equal(s.below_line, 50); // interest + depreciation
  assert.equal(s.operating, 150); // salary + fuel
  assert.equal(s.by_category.salary, 100);
});
