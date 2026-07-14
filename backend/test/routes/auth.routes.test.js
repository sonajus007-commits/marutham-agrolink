// Route tests for POST /auth/register — the front door.
//
// The bug: the duplicate-phone guard discarded its error, so a failed read left
// `existing` undefined, `if (existing)` went false, and the signup proceeded as
// though the number were free. The guard did not reject — it EVAPORATED.
//
// WHAT IT ACTUALLY COST, stated accurately: nothing corrupting. `users.phone` is
// UNIQUE, so the INSERT that follows is rejected by the database and the caller
// gets "Could not create account. Please try again." (500) instead of "An account
// with this phone number already exists." (409). A misleading error, not a
// duplicate account — the constraint was quietly doing the guard's job all along.
//
// That is worth stating plainly, because the same shape in payouts and returns had
// NO constraint underneath it, and there a failed read paid every farmer twice.
// Migration 026 added the missing unique indexes there. The lesson is not "the
// guard doesn't matter" — a 409 is actionable and a 500 is not — it is that a guard
// is the second line of defence, and the schema is the first.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase, pgrst116 } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const SIGNUP = {
  phone: '9100000009', password: 'secret123', role: 'consumer', fname: 'Asha',
  district: 'Chennai', state: 'Tamil Nadu', pincode: '600001', village_town: 'Adyar',
};

/** Nobody is registered on this phone; the signup should go through. */
function registry(overrides = {}) {
  const supa = fakeSupabase({
    'users:select': { data: [] },                       // no existing account, no login_ids yet
    'users:insert': { data: [{ id: 'user-9', login_id: 'CNTNCHN_ASH_A01', phone: SIGNUP.phone, role: 'consumer' }] },
    'user_login_history:insert': { data: [] },
  });
  for (const [k, v] of Object.entries(overrides)) supa.on(...k.split('|'), v);
  return supa;
}

describe('POST /auth/register', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  test('registers a new phone number', async () => {
    const supa = registry();
    app = await mountRoute('auth', { supabase: supa, user: null });

    const res = await app.post('/register', SIGNUP);

    assert.equal(res.status, 201);
    assert.equal(supa.callsTo('users', 'insert').length, 1);
  });

  test('refuses a phone number that already has an account', async () => {
    const supa = registry({ 'users|select': { data: [{ id: 'someone-else' }] } });
    app = await mountRoute('auth', { supabase: supa, user: null });

    const res = await app.post('/register', SIGNUP);

    assert.equal(res.status, 409);
    assert.equal(supa.callsTo('users', 'insert').length, 0);
  });

  // ── THE REGRESSION. ────────────────────────────────────────────────────────
  // Before 466bbad the error was dropped, `existing` was undefined, `if (existing)`
  // went false, and the signup proceeded to the INSERT. The unique constraint on
  // users.phone then rejected it, so the caller got a 500 where a 409 was the
  // truth. The fix is to refuse at the guard, with the status code that says why.
  test('a failed duplicate-check must refuse, not wave the signup through to the constraint', async () => {
    const supa = registry({ 'users|select': { error: { message: 'connection reset by peer' } } });
    app = await mountRoute('auth', { supabase: supa, user: null });

    const res = await app.post('/register', SIGNUP);

    assert.equal(res.status, 500, 'a guard that cannot run must refuse');
    assert.equal(
      supa.callsTo('users', 'insert').length, 0,
      'it tried to INSERT anyway — a failed guard does not reject, it evaporates. '
      + 'Here the unique constraint catches it; in payouts, nothing did.',
    );
  });

  // Defence in depth, and the reason .maybeSingle() is a trap in a guard: IF two
  // rows ever did exist on one phone — they cannot today, but a guard should not
  // depend on that — the guard's own .maybeSingle() raises PGRST116, and unread
  // THAT error would let the signup through too. The fake models PGRST116 exactly,
  // so this is a real reproduction of the failure, not a mock of one.
  test('when the guard query itself errors on multiple rows, it must still refuse', async () => {
    const supa = registry({
      'users|select': { data: [{ id: 'account-a' }, { id: 'account-b' }] },   // already duplicated
    });
    app = await mountRoute('auth', { supabase: supa, user: null });

    const res = await app.post('/register', SIGNUP);

    // .maybeSingle() on two rows → PGRST116. The route must treat that as a failed
    // guard (500), never as "no account exists" (201).
    assert.equal(res.status, 500);
    assert.equal(supa.callsTo('users', 'insert').length, 0);
  });

  // This test was written to check that a failed login-ID lookup cannot mint a
  // COLLIDING id (generateLoginId takes max(existing) + 1, so an unread failure
  // starts from zero and reissues an ID that already exists).
  //
  // It found something worse. generateLoginId THROWS, Express 4 does not catch an
  // async throw, and Node's default unhandled-rejection behaviour is to kill the
  // process. So one failed read during one signup did not just hang that request —
  // it took the entire API server down, and every other user's request with it.
  // The test did not fail; it HUNG, because the route hung. orders.js has always
  // guarded its equivalent. auth.js never did.
  test('a failed login-ID lookup RESPONDS 500 — it does not hang, and does not kill the server', async () => {
    let call = 0;
    const supa = registry();
    supa.on('users', 'select', () => {
      call += 1;
      if (call === 1) return { data: [] };                       // duplicate-phone check: clear
      return { error: { message: 'timeout' } };                  // login-ID lookup: throws
    });
    app = await mountRoute('auth', { supabase: supa, user: null });

    // Getting ANY response here is the assertion. Before the fix this never resolved.
    const res = await app.post('/register', SIGNUP);

    assert.equal(res.status, 500);
    assert.equal(supa.callsTo('users', 'insert').length, 0, 'no account, and certainly not one with a reissued login_id');
  });

  test('still rejects a malformed request before touching the database', async () => {
    const supa = registry();
    app = await mountRoute('auth', { supabase: supa, user: null });

    const res = await app.post('/register', { phone: '91', password: 'x' });   // no role, no fname

    assert.equal(res.status, 400);
    assert.equal(supa.calls.length, 0, 'validation must come before any query');
  });
});

describe('the PGRST116 semantics these guards depend on', () => {
  // Not a route test — a test of the FAKE, proving it reproduces the database
  // behaviour the bug depended on. If this drifts, every guard test above is
  // testing a fiction.
  test('.maybeSingle() errors on two rows, and returns null on none', async () => {
    const supa = fakeSupabase({ 'users:select': { data: [] } });
    const none = await supa.from('users').select('id').eq('phone', 'x').maybeSingle();
    assert.equal(none.data, null);
    assert.equal(none.error, null, 'no rows is an ANSWER for maybeSingle, not a failure');

    supa.on('users', 'select', { data: [{ id: 'a' }, { id: 'b' }] });
    const two = await supa.from('users').select('id').eq('phone', 'x').maybeSingle();
    assert.equal(two.data, null);
    assert.equal(two.error.code, 'PGRST116', 'two rows must raise, exactly as PostgREST does');
  });

  test('.single() errors on NO rows — which is why a guard cannot use it blindly', async () => {
    const supa = fakeSupabase({ 'users:select': { data: [] } });
    const none = await supa.from('users').select('id').eq('id', 'x').single();
    assert.equal(none.error.code, 'PGRST116');
    // This is the trap: adding `if (error) → 500` to a .single() turns an ordinary
    // "not found" into a 500. Guards must use .maybeSingle().
  });
});
