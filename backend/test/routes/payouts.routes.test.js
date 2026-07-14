// Route tests for POST /payouts/run — the settlement batch.
//
// This is the one that would have cost real money. The route reads which orders
// have already been paid so it can skip them; unread, a failed read left that set
// EMPTY, every delivered order was reclassified as unpaid, and every farmer was
// paid a second time. The comment on the line above it said "so we don't
// double-pay". Nothing would have looked wrong in the response.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const HEAD_OFFICE = { id: 'ho-1', role: 'admin', admin_role: 'Head Office', fname: 'HO' };
const DISTRICT_MGR = { id: 'dm-1', role: 'admin', admin_role: 'District Manager', district: 'Chennai', fname: 'DM' };

/** Two delivered orders; ONE of them (order-1) has already been settled. */
function settlement(overrides = {}) {
  const supa = fakeSupabase({
    'orders:select':     { data: [{ id: 'order-1' }, { id: 'order-2' }] },
    'payouts:select':    { data: [{ order_id: 'order-1' }] },          // ← already paid
    'order_items:select': { data: [
      { order_id: 'order-1', farmer_id: 'farmer-1', farmer_price: 2000, qty: 2 },
      { order_id: 'order-2', farmer_id: 'farmer-2', farmer_price: 3000, qty: 1 },
    ] },
    'payouts:insert': { data: [] },
  });
  for (const [k, v] of Object.entries(overrides)) supa.on(...k.split('|'), v);
  return supa;
}

describe('POST /payouts/run', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  test('settles only the orders that have NOT already been paid', async () => {
    const supa = settlement();
    app = await mountRoute('payouts', { supabase: supa, user: HEAD_OFFICE });

    const res = await app.post('/run', {});

    assert.equal(res.status, 201);
    const insert = supa.callsTo('payouts', 'insert')[0];
    assert.ok(insert, 'nothing was settled');

    const rows = Array.isArray(insert.payload) ? insert.payload : [insert.payload];
    const settled = rows.map((r) => r.order_id);
    assert.deepEqual(settled, ['order-2'], 'order-1 was already paid and must be skipped');
  });

  // ── THE ONE. ───────────────────────────────────────────────────────────────
  // Before 466bbad: `const { data: existingPayouts } = await …` — error discarded.
  // A failed read made `alreadyPaidOrderIds` an EMPTY set, so BOTH orders looked
  // unpaid and both were settled. order-1 gets paid twice.
  test('DOUBLE PAYMENT: if the already-paid lookup fails, it must settle NOTHING', async () => {
    const supa = settlement({ 'payouts|select': { error: { message: 'connection reset by peer' } } });
    app = await mountRoute('payouts', { supabase: supa, user: HEAD_OFFICE });

    const res = await app.post('/run', {});

    assert.equal(res.status, 500, 'a settlement run that cannot see prior payouts must refuse');
    assert.equal(
      supa.callsTo('payouts', 'insert').length, 0,
      'IT PAID EVERYONE AGAIN — a failed read must never be read as "nothing has been paid"',
    );
  });

  test('refuses to settle if the delivered-orders read fails', async () => {
    const supa = settlement({ 'orders|select': { error: { message: 'timeout' } } });
    app = await mountRoute('payouts', { supabase: supa, user: HEAD_OFFICE });

    const res = await app.post('/run', {});

    // The old code answered "No delivered orders to settle." — a run that silently
    // did nothing, and said so cheerfully.
    assert.equal(res.status, 500);
    assert.equal(supa.callsTo('payouts', 'insert').length, 0);
  });

  test('refuses to settle if the order-items read fails', async () => {
    const supa = settlement({ 'order_items|select': { error: { message: 'timeout' } } });
    app = await mountRoute('payouts', { supabase: supa, user: HEAD_OFFICE });

    const res = await app.post('/run', {});

    // Every payout AMOUNT is computed from these rows. A partial read would settle
    // farmers for less than they are owed.
    assert.equal(res.status, 500);
    assert.equal(supa.callsTo('payouts', 'insert').length, 0);
  });

  test('says so, and settles nothing, when everything is already settled', async () => {
    const supa = settlement({ 'payouts|select': { data: [{ order_id: 'order-1' }, { order_id: 'order-2' }] } });
    app = await mountRoute('payouts', { supabase: supa, user: HEAD_OFFICE });

    const res = await app.post('/run', {});

    assert.equal(res.status, 200);
    assert.equal(res.body.created, 0);
    assert.equal(supa.callsTo('payouts', 'insert').length, 0);
  });

  test('a district-scoped admin cannot run a company-wide settlement', async () => {
    const supa = settlement();
    app = await mountRoute('payouts', { supabase: supa, user: DISTRICT_MGR });

    const res = await app.post('/run', {});

    assert.equal(res.status, 403);
    assert.equal(supa.callsTo('payouts', 'insert').length, 0);
  });
});

describe('GET /payouts', () => {
  let app, mute;
  beforeEach(() => { mute = muteConsoleError(); });
  afterEach(async () => { mute.restore(); if (app) await app.close(); });

  test("a failed district-farmer lookup is a 500, not an empty payout list", async () => {
    const supa = fakeSupabase({ 'users:select': { error: { message: 'timeout' } } });
    app = await mountRoute('payouts', { supabase: supa, user: DISTRICT_MGR });

    const res = await app.get('/');

    // The old code answered `{ payouts: [] }` — a district manager saw an empty
    // list and had no reason to doubt it.
    assert.equal(res.status, 500);
  });
});
