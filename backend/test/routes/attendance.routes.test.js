// Field-staff attendance (migration 057): field roles check in/out for themselves;
// managers view the roster. Locks the field-role gate, the self-scoping, and the
// manager view permission.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const VCO = { id: 'v1', role: 'admin', admin_role: 'VCO', fname: 'Vco', district: 'Pudukkottai' };
const DM = { id: 'd1', role: 'admin', admin_role: 'District Manager', fname: 'DM' };
const CONSUMER = { id: 'c1', role: 'consumer' };

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('POST /check-in — a field staffer goes on duty (scoped to themselves)', async () => {
  const db = fakeSupabase({ 'staff_attendance:upsert': { data: { id: 'a1', user_id: 'v1', checked_in_at: 'now' } } });
  app = await mountRoute('attendance', { supabase: db, user: VCO });
  const res = await app.post('/check-in', { lat: 10.5, lng: 78.8 });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'on_duty');
  const up = db.callsTo('staff_attendance', 'upsert')[0].payload;
  assert.equal(up.user_id, 'v1'); // the caller, not a claim
  assert.equal(up.district, 'Pudukkottai'); // denormalised from the user
  assert.equal(up.check_in_lat, 10.5);
});

test('POST /check-in — a consumer cannot check in (403)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('attendance', { supabase: db, user: CONSUMER });
  const res = await app.post('/check-in', {});

  assert.equal(res.status, 403);
  assert.equal(db.callsTo('staff_attendance', 'upsert').length, 0);
});

test('POST /check-out — sets the checkout time on today\'s row', async () => {
  const db = fakeSupabase({ 'staff_attendance:update': { data: { id: 'a1', checked_out_at: 'now' } } });
  app = await mountRoute('attendance', { supabase: db, user: VCO });
  const res = await app.post('/check-out');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'off_duty');
  const upd = db.callsTo('staff_attendance', 'update')[0];
  assert.ok(upd.payload.checked_out_at, 'a checkout time is stamped');
  assert.ok(upd.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'v1'));
});

test('POST /check-out — with no check-in today is a 400', async () => {
  const db = fakeSupabase({ 'staff_attendance:update': { data: null } });
  app = await mountRoute('attendance', { supabase: db, user: VCO });
  const res = await app.post('/check-out');
  assert.equal(res.status, 400);
});

test('GET / — a manager sees the roster with an on-duty count', async () => {
  const db = fakeSupabase({
    'staff_attendance:select': {
      data: [
        { user_id: 'v1', admin_role: 'VCO', district: 'Pudukkottai', checked_in_at: 't', checked_out_at: null, user: { fname: 'Vco' } },
        { user_id: 'd2', admin_role: 'Delivery Agent', district: 'Pudukkottai', checked_in_at: 't', checked_out_at: 't2', user: { fname: 'Da' } },
      ],
    },
  });
  app = await mountRoute('attendance', { supabase: db, user: DM });
  const res = await app.get('/');

  assert.equal(res.status, 200);
  assert.equal(res.body.total_staff, 2);
  assert.equal(res.body.on_duty, 1); // only the one not checked out
  assert.equal(res.body.attendance[0].status, 'on_duty');
  assert.equal(res.body.attendance[1].status, 'off_duty');
});

test('GET / — a consumer cannot view the roster (403)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('attendance', { supabase: db, user: CONSUMER });
  const res = await app.get('/');
  assert.equal(res.status, 403);
});
