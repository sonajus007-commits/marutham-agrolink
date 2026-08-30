// Support tickets (migration 055): any user raises one and sees only their own;
// staff with the customer_complaints module work the queue. These lock the scoping,
// the staff gate, and the raiser-notified-on-update behaviour.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const CONSUMER = { id: 'c1', role: 'consumer', fname: 'Cust' };
const STAFF = { id: 's1', role: 'admin', admin_role: 'District Manager', fname: 'DM' };

const ticket = (over = {}) => ({
  id: 't1',
  user_id: 'c1',
  subject: 'Wrong item delivered',
  message: 'I got onions not tomatoes',
  status: 'open',
  ...over,
});

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('POST /support — any user raises a ticket, scoped to themselves', async () => {
  const db = fakeSupabase({ 'support_tickets:insert': { data: ticket() } });
  app = await mountRoute('support', { supabase: db, user: CONSUMER });
  const res = await app.post('/', { subject: 'Wrong item delivered', message: 'I got onions' });

  assert.equal(res.status, 201);
  const ins = db.callsTo('support_tickets', 'insert')[0].payload;
  assert.equal(ins.user_id, 'c1'); // the caller, not a client claim
  assert.equal(ins.status, 'open');
});

test('POST /support — a missing message is a 400', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('support', { supabase: db, user: CONSUMER });
  const res = await app.post('/', { subject: 'Hi' });
  assert.equal(res.status, 400);
});

test('GET /support — a consumer sees only their own tickets', async () => {
  const db = fakeSupabase({ 'support_tickets:select': { data: [ticket()] } });
  app = await mountRoute('support', { supabase: db, user: CONSUMER });
  const res = await app.get('/');

  assert.equal(res.status, 200);
  const read = db.callsTo('support_tickets', 'select')[0];
  assert.ok(read.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'c1'));
});

test('GET /support?status — staff read the whole queue, filtered', async () => {
  const db = fakeSupabase({ 'support_tickets:select': { data: [ticket()] } });
  app = await mountRoute('support', { supabase: db, user: STAFF });
  const res = await app.get('/?status=open');

  assert.equal(res.status, 200);
  const read = db.callsTo('support_tickets', 'select')[0];
  // NOT scoped to a user_id — staff see everyone's; filtered by status instead.
  assert.ok(!read.filters.some((f) => f[1] === 'user_id'));
  assert.ok(read.filters.some((f) => f[0] === 'eq' && f[1] === 'status' && f[2] === 'open'));
});

test('PATCH /support/:id — staff resolve a ticket and the raiser is notified', async () => {
  const db = fakeSupabase({
    'support_tickets:select': { data: [ticket()] },
    'support_tickets:update': { data: ticket({ status: 'resolved', admin_note: 'Refunded.' }) },
    'notifications:insert': { data: [] },
  });
  app = await mountRoute('support', { supabase: db, user: STAFF });
  const res = await app.patch('/t1', { status: 'resolved', admin_note: 'Refunded.' });

  assert.equal(res.status, 200);
  const upd = db.callsTo('support_tickets', 'update')[0].payload;
  assert.equal(upd.status, 'resolved');
  assert.equal(upd.admin_note, 'Refunded.');
  // the ticket owner (c1) gets an in-app notice
  const notif = db.callsTo('notifications', 'insert')[0].payload;
  assert.equal(notif.user_id, 'c1');
  assert.equal(notif.type, 'support_update');
});

test('PATCH /support/:id — a consumer cannot work the queue (403)', async () => {
  const db = fakeSupabase({ 'support_tickets:select': { data: [ticket()] } });
  app = await mountRoute('support', { supabase: db, user: CONSUMER });
  const res = await app.patch('/t1', { status: 'resolved' });

  assert.equal(res.status, 403);
  assert.equal(db.callsTo('support_tickets', 'update').length, 0);
});

test('PATCH /support/:id — an empty update is a 400', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('support', { supabase: db, user: STAFF });
  const res = await app.patch('/t1', {});
  assert.equal(res.status, 400);
});
