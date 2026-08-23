// Route tests for POST /hubs — creating a hub (Hub Management).
//
// A taluk may hold MANY hubs (offices); what must be unique is the NAME within the
// taluk. So these pin: a name is required, a duplicate name is refused, and a hub is
// created even when the taluk already has one (multiple-per-taluk is allowed).
//
// The create handler makes TWO hubs:select reads — the district's main hub, then the
// duplicate-name check — so the fake answers them in order via a call counter.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const ADMIN = { id: 'a1', role: 'admin', role_key: 'admin', admin_role: 'Head Office' };
const BODY = { state: 'Tamil Nadu', district: 'Pudukkottai', taluk: 'Alangudi', name: 'Alangudi Office 2' };

/** A fake wired for a create that should succeed, unless `dupName` seeds a clash. */
function createFake({ dupName = false } = {}) {
  const supa = fakeSupabase({
    'locations:select': { data: [{ taluk: 'Alangudi' }] },
    'hubs:insert': { data: [{ id: 'hub-new', name: BODY.name, hub_type: 'taluk' }] },
  });
  // 1st hubs:select = main-hub lookup; 2nd = duplicate-name check.
  let n = 0;
  supa.on('hubs', 'select', () => {
    n += 1;
    if (n === 1) return { data: [{ id: 'main-1' }] };
    return { data: dupName ? [{ id: 'dup-1' }] : [] };
  });
  return supa;
}

describe('POST /hubs', () => {
  let app, mute;
  afterEach(async () => { if (mute) mute.restore(); if (app) await app.close(); });

  test('creates a hub — a taluk that already has one still accepts another', async () => {
    const supa = createFake();
    app = await mountRoute('hubs', { supabase: supa, user: ADMIN });

    const res = await app.post('/', BODY);

    assert.equal(res.status, 201);
    const insert = supa.callsTo('hubs', 'insert')[0];
    assert.equal(insert.payload.name, 'Alangudi Office 2');
    assert.equal(insert.payload.hub_type, 'taluk');
    assert.equal(insert.payload.taluk, 'Alangudi');
  });

  test('requires a hub name (400) before touching the DB', async () => {
    const supa = createFake();
    app = await mountRoute('hubs', { supabase: supa, user: ADMIN });

    const res = await app.post('/', { ...BODY, name: '   ' });

    assert.equal(res.status, 400);
    assert.equal(supa.callsTo('hubs', 'insert').length, 0);
  });

  test('refuses a duplicate name within the taluk (409)', async () => {
    mute = muteConsoleError();
    const supa = createFake({ dupName: true });
    app = await mountRoute('hubs', { supabase: supa, user: ADMIN });

    const res = await app.post('/', BODY);

    assert.equal(res.status, 409);
    assert.equal(supa.callsTo('hubs', 'insert').length, 0);
  });

  test('a non-admin cannot create a hub (403)', async () => {
    const supa = createFake();
    app = await mountRoute('hubs', {
      supabase: supa,
      user: { id: 'd1', role: 'admin', role_key: 'district_manager', admin_role: 'District Manager' },
    });

    const res = await app.post('/', BODY);

    assert.equal(res.status, 403);
  });
});

// GET /hubs — the list is district-drilled for most roles, but a Hub Manager is
// scoped to the hub(s) they run (hubs.hub_manager_id = self). These pin that boundary
// so a Hub Manager can never enumerate the rest of the district's network via the API.
describe('GET /hubs', () => {
  let app, mute;
  afterEach(async () => { if (mute) mute.restore(); if (app) await app.close(); });

  const HUB_MANAGER = { id: 'hm1', role: 'admin', role_key: 'hub_manager', admin_role: 'Hub Manager' };
  const DISTRICT_MGR = { id: 'd1', role: 'admin', role_key: 'district_manager', admin_role: 'District Manager' };

  test('a Hub Manager sees only the hub they run — scoped by hub_manager_id, no district needed', async () => {
    // Two hubs in the district; only one is run by this manager. The fake applies the
    // route's eq filters, so the response should hold just the manager's own hub.
    const supa = fakeSupabase({
      'hubs:select': {
        data: [
          { id: 'hub-own', name: 'Alangudi Hub 1', taluk: 'Alangudi', district: 'Pudukkottai', hub_type: 'taluk', hub_manager_id: 'hm1' },
          { id: 'hub-other', name: 'Kulathur Hub 1', taluk: 'Kulathur', district: 'Pudukkottai', hub_type: 'taluk', hub_manager_id: 'hm2' },
        ],
      },
      'users:select': { data: [{ id: 'hm1', fname: 'Hub', lname: 'Manager' }] },
    });
    app = await mountRoute('hubs', { supabase: supa, user: HUB_MANAGER });

    // No district supplied — a Hub Manager must not need one.
    const res = await app.get('/');

    assert.equal(res.status, 200);
    assert.equal(res.body.hubs.length, 1);
    assert.equal(res.body.hubs[0].id, 'hub-own');
    // The scope filter is hub_manager_id = self, and the district filter is NOT applied.
    const filters = supa.callsTo('hubs', 'select')[0].filters;
    assert.ok(filters.some(([op, col, val]) => op === 'eq' && col === 'hub_manager_id' && val === 'hm1'));
    assert.ok(!filters.some(([op, col]) => op === 'eq' && col === 'district'));
  });

  test('a District Manager still drills by district (400 without one)', async () => {
    mute = muteConsoleError();
    const supa = fakeSupabase({ 'hubs:select': { data: [] } });
    app = await mountRoute('hubs', { supabase: supa, user: DISTRICT_MGR });

    const res = await app.get('/');

    assert.equal(res.status, 400);
    assert.equal(supa.callsTo('hubs', 'select').length, 0);
  });

  test('a District Manager scopes by district, not by hub_manager_id', async () => {
    const supa = fakeSupabase({
      'hubs:select': {
        data: [
          { id: 'main-1', name: 'Pudukkottai Main', taluk: null, district: 'Pudukkottai', hub_type: 'main', hub_manager_id: null },
          { id: 'hub-1', name: 'Alangudi Hub 1', taluk: 'Alangudi', district: 'Pudukkottai', hub_type: 'taluk', hub_manager_id: 'hm2' },
        ],
      },
      'users:select': { data: [] },
    });
    app = await mountRoute('hubs', { supabase: supa, user: DISTRICT_MGR });

    const res = await app.get('/?district=Pudukkottai');

    assert.equal(res.status, 200);
    assert.equal(res.body.hubs.length, 2);
    const filters = supa.callsTo('hubs', 'select')[0].filters;
    assert.ok(filters.some(([op, col, val]) => op === 'eq' && col === 'district' && val === 'Pudukkottai'));
    assert.ok(!filters.some(([op, col]) => op === 'eq' && col === 'hub_manager_id'));
  });
});
