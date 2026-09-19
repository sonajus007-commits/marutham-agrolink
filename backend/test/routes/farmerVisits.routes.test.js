// Farmer field-visit log (migration 061): field staff and managers log visits to
// farmers; the operations dashboard counts them. These lock the create permission,
// that a visit can only be logged against a real farmer, the denormalised attribution,
// and the area-scoped review list.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const VCO = { id: 'v1', role: 'admin', admin_role: 'VCO', fname: 'Priya', lname: 'K', district: 'Pudukkottai' };
const DM = { id: 'd1', role: 'admin', admin_role: 'District Manager', fname: 'Arun', district: 'Pudukkottai' };
const CONSUMER = { id: 'c1', role: 'consumer' };

const FARMER = { id: 'f1', role: 'farmer', fname: 'Murugan', lname: 'S', district: 'Pudukkottai' };

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('POST / — a VCO logs a visit; attribution + district are set from the server, not claimed', async () => {
  const db = fakeSupabase({
    'users:select': { data: [FARMER] },
    'farmer_visits:insert': { data: { id: 'fv1', farmer_id: 'f1', purpose: 'collection' } },
  });
  app = await mountRoute('farmerVisits', { supabase: db, user: VCO });
  const res = await app.post('/', { farmer_id: 'f1', purpose: 'collection', notes: 'Weekly pickup' });

  assert.equal(res.status, 201);
  assert.equal(res.body.visit.id, 'fv1');
  const ins = db.callsTo('farmer_visits', 'insert')[0].payload;
  assert.equal(ins.farmer_id, 'f1');
  assert.equal(ins.visited_by, 'v1'); // the caller, never a body field
  assert.equal(ins.visited_by_name, 'Priya K'); // denormalised from the caller
  assert.equal(ins.farmer_name, 'Murugan S'); // denormalised from the farmer
  assert.equal(ins.district, 'Pudukkottai'); // from the farmer, for area scoping
  assert.equal(ins.purpose, 'collection');
  assert.equal(ins.notes, 'Weekly pickup');
});

test('POST / — a visit cannot be logged against a non-farmer (404, no insert)', async () => {
  const db = fakeSupabase({ 'users:select': { data: [{ id: 'c1', role: 'consumer' }] } });
  app = await mountRoute('farmerVisits', { supabase: db, user: VCO });
  const res = await app.post('/', { farmer_id: 'c1', purpose: 'collection' });

  assert.equal(res.status, 404);
  assert.equal(db.callsTo('farmer_visits', 'insert').length, 0);
});

test('POST / — an unknown farmer id is a 404', async () => {
  const db = fakeSupabase({ 'users:select': { data: [] } });
  app = await mountRoute('farmerVisits', { supabase: db, user: VCO });
  const res = await app.post('/', { farmer_id: 'ghost', purpose: 'onboarding' });
  assert.equal(res.status, 404);
});

test('POST / — an invalid purpose is rejected before any DB call (400)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('farmerVisits', { supabase: db, user: VCO });
  const res = await app.post('/', { farmer_id: 'f1', purpose: 'coffee-break' });
  assert.equal(res.status, 400);
  assert.equal(db.callsTo('users', 'select').length, 0);
});

test('POST / — a consumer has no farmer_management create (403)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('farmerVisits', { supabase: db, user: CONSUMER });
  const res = await app.post('/', { farmer_id: 'f1', purpose: 'collection' });
  assert.equal(res.status, 403);
  assert.equal(db.callsTo('farmer_visits', 'insert').length, 0);
});

test('GET / — a District Manager sees visits scoped to their district', async () => {
  const db = fakeSupabase({
    'farmer_visits:select': {
      data: [
        { id: 'fv1', farmer_name: 'Murugan S', purpose: 'collection', district: 'Pudukkottai', visited_at: 't' },
      ],
    },
  });
  app = await mountRoute('farmerVisits', { supabase: db, user: DM });
  const res = await app.get('/');

  assert.equal(res.status, 200);
  assert.equal(res.body.visits.length, 1);
  const sel = db.callsTo('farmer_visits', 'select')[0];
  assert.ok(
    sel.filters.some((f) => f[0] === 'eq' && f[1] === 'district' && f[2] === 'Pudukkottai'),
    'the list is scoped to the manager\'s own district',
  );
});

test('GET / — a consumer cannot read the visit log (403)', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('farmerVisits', { supabase: db, user: CONSUMER });
  const res = await app.get('/');
  assert.equal(res.status, 403);
});
