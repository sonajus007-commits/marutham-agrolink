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
