// The REAL requireAuth / optionalAuth, against the fake client.
//
// The route tests stub this middleware out — they are about routes. But requireAuth is
// where a removed employee is actually stopped, and it is the only place that can stop
// them QUICKLY: it re-reads the user row on every authenticated request, so a removal
// takes effect on the victim's next call instead of whenever their JWT expires. A token
// already in someone's browser is not revocable; this read is what makes it moot.
//
// So it gets its own tests, exercising the actual module.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const jwt = require('jsonwebtoken');
const { fakeSupabase } = require('./helpers/fakeSupabase');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const SUPABASE_MODULE = path.join(__dirname, '..', 'db', 'supabase.js');
const AUTH_MODULE     = path.join(__dirname, '..', 'middleware', 'auth.js');

/** Load middleware/auth.js with the supabase client replaced. */
function loadAuth(supabase) {
  require.cache[SUPABASE_MODULE] = {
    id: SUPABASE_MODULE, filename: SUPABASE_MODULE, path: path.dirname(SUPABASE_MODULE),
    loaded: true, children: [], paths: [], exports: supabase,
  };
  delete require.cache[AUTH_MODULE];
  return require(AUTH_MODULE);
}

/** A response double that records what the middleware decided. */
function resDouble() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
  };
  return res;
}

function reqWith(userId) {
  return { headers: { authorization: 'Bearer ' + jwt.sign({ sub: userId }, process.env.JWT_SECRET) } };
}

const LIVE = { id: 'u1', role: 'farmer', status: 'active', approval_status: 'approved', deleted_at: null };

test('requireAuth ASKS for deleted_at — the column must reach the check that reads it', async () => {
  // The trap this guards: requireAuth selects its columns by name. Adding deleted_at to
  // the table does not add it to that list, so the row comes back without the field,
  // `user.deleted_at` is undefined, and the check passes every removed employee straight
  // through — silently, forever. The column existing in Postgres proves nothing.
  const db = fakeSupabase({ 'users:select': { data: [LIVE] } });
  const { requireAuth } = loadAuth(db);

  await requireAuth(reqWith('u1'), resDouble(), () => {});

  const read = db.callsTo('users', 'select')[0];
  assert.ok(read.cols.includes('deleted_at'),
    'requireAuth must select deleted_at, or its own removal check can never see anything');
});

test('requireAuth — a removed user is rejected, and the request stops', async () => {
  const db = fakeSupabase({
    'users:select': { data: [{ ...LIVE, deleted_at: '2026-07-14T00:00:00Z' }] },
  });
  const { requireAuth } = loadAuth(db);

  const res = resDouble();
  let nexted = false;
  await requireAuth(reqWith('u1'), res, () => { nexted = true; });

  assert.equal(nexted, false, 'the request must not continue');
  // 401, not 403: the account is gone, so the client should log out rather than sit on
  // a dead token showing an error banner forever.
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /removed/i);
});

test('requireAuth — a live user passes, with req.user attached', async () => {
  const db = fakeSupabase({ 'users:select': { data: [LIVE] } });
  const { requireAuth } = loadAuth(db);

  const req = reqWith('u1');
  const res = resDouble();
  let nexted = false;
  await requireAuth(req, res, () => { nexted = true; });

  assert.equal(nexted, true);
  assert.equal(res.statusCode, null, 'nothing was rejected');
  assert.equal(req.user.id, 'u1');
});

test('requireAuth — removal outranks a block: a removed user is 401, not 403', async () => {
  // Both flags set. The order matters because the two answers tell the client to do
  // different things — 403 blocked means "contact admin to unblock", which is a lie to
  // someone whose account no longer exists.
  const db = fakeSupabase({
    'users:select': { data: [{ ...LIVE, status: 'blocked', block_reason: 'x', deleted_at: '2026-07-14T00:00:00Z' }] },
  });
  const { requireAuth } = loadAuth(db);

  const res = resDouble();
  await requireAuth(reqWith('u1'), res, () => {});

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /removed/i);
});

test('requireAuth — a blocked (but not removed) user still gets the blocked 403', async () => {
  // Regression guard: the removal check sits directly above the block check, and must
  // not have swallowed it.
  const db = fakeSupabase({
    'users:select': { data: [{ ...LIVE, status: 'blocked', block_reason: 'fraud' }] },
  });
  const { requireAuth } = loadAuth(db);

  const res = resDouble();
  await requireAuth(reqWith('u1'), res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.account_status, 'blocked');
});

test('optionalAuth — a removed user is anonymous, not an error', async () => {
  // This one runs on PUBLIC pages. A removed employee browsing the shop must simply be
  // a stranger; turning the product page into a 401 (or into an account-status oracle)
  // would be worse than the problem.
  const db = fakeSupabase({
    'users:select': { data: [{ ...LIVE, deleted_at: '2026-07-14T00:00:00Z' }] },
  });
  const { optionalAuth } = loadAuth(db);

  const req = reqWith('u1');
  const res = resDouble();
  let nexted = false;
  await optionalAuth(req, res, () => { nexted = true; });

  assert.equal(nexted, true, 'a public page must never reject');
  assert.equal(res.statusCode, null);
  assert.equal(req.user, undefined, 'the removed user is not signed in');
});

test('optionalAuth — a live user is still recognised', async () => {
  const db = fakeSupabase({ 'users:select': { data: [LIVE] } });
  const { optionalAuth } = loadAuth(db);

  const req = reqWith('u1');
  await optionalAuth(req, resDouble(), () => {});
  assert.equal(req.user.id, 'u1');
});
