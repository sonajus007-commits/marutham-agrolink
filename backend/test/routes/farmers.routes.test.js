// Route tests for the PUBLIC farmer endpoints (consent-gated) added with the
// farmer public-profile model (migration 050).
//
// The thing that MUST hold, and that only a request-path test pins: a grower is
// anonymised by default, and even a CONSENTED grower is shown ONLY an allow-list
// of public-safe fields — never phone / email / bank. A future edit that widens
// the SELECT or the shaping would leak PII into Google with no other alarm. So
// these feed a fixture row carrying PII and assert it never reaches the client.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const UUID = '11111111-1111-1111-1111-111111111111';

// A consented farmer row AS THE DB HOLDS IT — including the fields that must NOT
// be exposed. The route's shaping is what keeps them private.
const CONSENTED = {
  id: UUID,
  role: 'farmer',
  public_profile: true,
  fname: 'Kavitha',
  lname: 'R',
  village_town: 'Alangudi',
  district: 'Pudukkottai',
  public_bio: 'I set my own price now.',
  public_photo_url: null,
  // PII that must never appear in a public response:
  phone: '9811100001',
  email: 'kavitha@example.com',
  bank_name: 'ABC Bank',
  login_id: 'FRMPDK_XYZ',
};

const NOT_CONSENTED = { id: '22222222-2222-2222-2222-222222222222', role: 'farmer', public_profile: false, fname: 'Hidden' };

const PII_KEYS = ['phone', 'email', 'bank_name', 'login_id', 'password_hash', 'aadhar'];

describe('GET /farmers/public', () => {
  test('returns only consented farmers, shaped to public-safe fields (no PII)', async () => {
    const supa = fakeSupabase({ 'users:select': { data: [CONSENTED, NOT_CONSENTED] } });
    const app = await mountRoute('farmers', { supabase: supa, user: null });
    try {
      const res = await app.get('/public');
      assert.equal(res.status, 200);
      assert.equal(res.body.farmers.length, 1, 'opted-out farmer must not appear');
      const f = res.body.farmers[0];
      assert.deepEqual(Object.keys(f).sort(), ['bio', 'district', 'id', 'name', 'photo_url', 'village']);
      assert.equal(f.name, 'Kavitha R');
      assert.equal(f.village, 'Alangudi');
      for (const k of PII_KEYS) assert.ok(!(k in f), `PII leak: ${k} must not be public`);
    } finally {
      await app.close();
    }
  });

  test('a read error is surfaced as a 500, not an empty list', async () => {
    const supa = fakeSupabase({ 'users:select': { error: { message: 'boom' } } });
    const app = await mountRoute('farmers', { supabase: supa, user: null });
    const muted = muteConsoleError();
    try {
      const res = await app.get('/public');
      assert.equal(res.status, 500);
    } finally {
      muted.restore();
      await app.close();
    }
  });
});

describe('GET /farmers/public/:id', () => {
  test('a non-uuid id is a 404 (never a 500, and never hits the DB)', async () => {
    const supa = fakeSupabase({});
    const app = await mountRoute('farmers', { supabase: supa, user: null });
    try {
      const res = await app.get('/public/kavitha-alangudi');
      assert.equal(res.status, 404);
      assert.equal(supa.callsTo('users').length, 0, 'a bad id must not query the DB');
    } finally {
      await app.close();
    }
  });

  test('a consented farmer by id returns the public shape', async () => {
    const supa = fakeSupabase({ 'users:select': { data: [CONSENTED] } });
    const app = await mountRoute('farmers', { supabase: supa, user: null });
    try {
      const res = await app.get(`/public/${UUID}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.farmer.name, 'Kavitha R');
      for (const k of PII_KEYS) assert.ok(!(k in res.body.farmer), `PII leak: ${k}`);
    } finally {
      await app.close();
    }
  });

  test('an unknown / opted-out id is a 404', async () => {
    const supa = fakeSupabase({ 'users:select': { data: [] } });
    const app = await mountRoute('farmers', { supabase: supa, user: null });
    try {
      const res = await app.get(`/public/${UUID}`);
      assert.equal(res.status, 404);
    } finally {
      await app.close();
    }
  });
});

describe('PATCH /farmers/me/public-profile', () => {
  test('a farmer can opt in', async () => {
    const supa = fakeSupabase({
      'users:update': { data: [{ ...CONSENTED, public_profile: true }] },
    });
    const app = await mountRoute('farmers', { supabase: supa, user: { id: UUID, role: 'farmer' } });
    try {
      const res = await app.patch('/me/public-profile', { public_profile: true, public_bio: 'Hello.' });
      assert.equal(res.status, 200);
      assert.equal(res.body.public_profile, true);
      for (const k of PII_KEYS) assert.ok(!(k in res.body.farmer), `PII leak: ${k}`);
    } finally {
      await app.close();
    }
  });

  test('a non-farmer is forbidden', async () => {
    const supa = fakeSupabase({});
    const app = await mountRoute('farmers', { supabase: supa, user: { id: UUID, role: 'consumer' } });
    try {
      const res = await app.patch('/me/public-profile', { public_profile: true });
      assert.equal(res.status, 403);
      assert.equal(supa.callsTo('users', 'update').length, 0);
    } finally {
      await app.close();
    }
  });

  test('a non-https photo url is rejected', async () => {
    const supa = fakeSupabase({});
    const app = await mountRoute('farmers', { supabase: supa, user: { id: UUID, role: 'farmer' } });
    try {
      const res = await app.patch('/me/public-profile', { public_photo_url: 'javascript:alert(1)' });
      assert.equal(res.status, 400);
    } finally {
      await app.close();
    }
  });

  test('an over-long bio is rejected', async () => {
    const supa = fakeSupabase({});
    const app = await mountRoute('farmers', { supabase: supa, user: { id: UUID, role: 'farmer' } });
    try {
      const res = await app.patch('/me/public-profile', { public_bio: 'x'.repeat(601) });
      assert.equal(res.status, 400);
    } finally {
      await app.close();
    }
  });

  test('an unauthenticated request is 401', async () => {
    const supa = fakeSupabase({});
    const app = await mountRoute('farmers', { supabase: supa, user: null });
    try {
      const res = await app.patch('/me/public-profile', { public_profile: true });
      assert.equal(res.status, 401);
    } finally {
      await app.close();
    }
  });
});
