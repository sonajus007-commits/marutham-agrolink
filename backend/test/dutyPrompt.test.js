// Morning duty prompt (utils/dutyPrompt). The db and notifier are injected, so no
// require.cache games — the fake client is passed straight in.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('./helpers/fakeSupabase');
const { sendDutyPrompts, istParts, PROMPT_TYPE } = require('../utils/dutyPrompt');

// 03:30 UTC = 09:00 IST on 26 Sep — inside the 07:00–12:00 window.
const MORNING = new Date('2026-09-26T03:30:00Z');

const STAFF = [
  { id: 'v1', role: 'admin', admin_role: 'VCO' },
  { id: 'd1', role: 'admin', admin_role: 'Delivery Agent' },
  { id: 'h1', role: 'admin', admin_role: 'Hub Incharge' }, // not a prompted role
  { id: 'v2', role: 'admin', admin_role: 'VCO', deleted_at: '2026-09-01T00:00:00Z' }, // removed
  { id: 'v3', role: 'admin', admin_role: 'VCO', login_locked_at: '2026-09-01T00:00:00Z' }, // locked
];

function recorder() {
  const calls = [];
  const notifyMany = async (ids, payload) => { calls.push({ ids, payload }); };
  return { calls, notifyMany };
}

function db(extra = {}) {
  return fakeSupabase({
    'users:select': { data: STAFF },
    'staff_attendance:select': { data: [] },
    'notifications:select': { data: [] },
    ...extra,
  });
}

test('istParts — IST date, hour and midnight', () => {
  const p = istParts(MORNING);
  assert.equal(p.date, '2026-09-26');
  assert.equal(p.hour, 9);
  assert.equal(p.midnightIso, '2026-09-25T18:30:00.000Z');
});

test('istParts — late UTC evening is already the next IST day', () => {
  assert.equal(istParts(new Date('2026-09-26T20:00:00Z')).date, '2026-09-27');
});

test('nudges only active VCOs and Delivery Agents who have not checked in', async () => {
  const n = recorder();
  const res = await sendDutyPrompts({ db: db(), notifyMany: n.notifyMany, now: MORNING });

  assert.equal(res.sent, 2);
  assert.equal(n.calls.length, 1);
  assert.deepEqual([...n.calls[0].ids].sort(), ['d1', 'v1']);
  assert.equal(n.calls[0].payload.type, PROMPT_TYPE);
  assert.deepEqual(n.calls[0].payload.data, { work_date: '2026-09-26' });
});

test('anyone with an attendance row today is skipped — even if already checked out', async () => {
  const n = recorder();
  const res = await sendDutyPrompts({
    db: db({ 'staff_attendance:select': { data: [{ user_id: 'v1', work_date: '2026-09-26' }] } }),
    notifyMany: n.notifyMany,
    now: MORNING,
  });
  assert.equal(res.sent, 1);
  assert.deepEqual(n.calls[0].ids, ['d1']);
});

test('once per day: someone already prompted today is not prompted again', async () => {
  const n = recorder();
  const res = await sendDutyPrompts({
    db: db({ 'notifications:select': { data: [{ user_id: 'v1', type: PROMPT_TYPE }, { user_id: 'd1', type: PROMPT_TYPE }] } }),
    notifyMany: n.notifyMany,
    now: MORNING,
  });
  assert.equal(res.sent, 0);
  assert.equal(n.calls.length, 0);
});

test('outside 07:00–12:00 IST nothing is read or sent', async () => {
  for (const at of ['2026-09-26T01:00:00Z' /* 06:30 IST */, '2026-09-26T07:00:00Z' /* 12:30 IST */]) {
    const n = recorder();
    const fake = db();
    const res = await sendDutyPrompts({ db: fake, notifyMany: n.notifyMany, now: new Date(at) });
    assert.equal(res.reason, 'outside_window');
    assert.equal(n.calls.length, 0);
    assert.equal(fake.callsTo('users', 'select').length, 0);
  }
});

test('a failed read aborts the run — never nudges blind', async () => {
  for (const key of ['users:select', 'staff_attendance:select', 'notifications:select']) {
    const n = recorder();
    const res = await sendDutyPrompts({
      db: db({ [key]: { error: { message: 'boom' } } }),
      notifyMany: n.notifyMany,
      now: MORNING,
    });
    assert.equal(res.reason, 'read_failed', key);
    assert.equal(n.calls.length, 0, key);
  }
});
