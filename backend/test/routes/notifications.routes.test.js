// POST/DELETE /notifications/device — the native app's push-token registry.
// GET /notifications + /unread-count + POST /read — the in-app feed (migration 053).
// Server closed in afterEach, never inline: a failing assertion would otherwise leak
// the listener and hang `node --test` (see project_route_tests).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const FARMER = { id: 'f1', role: 'farmer' };
const CONSUMER = { id: 'c1', role: 'consumer' };

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

// ── device-token registry ────────────────────────────────────────────────────

test('POST /device — registers the token against the signed-in user', async () => {
  const db = fakeSupabase();
  app = await mountRoute('notifications', { supabase: db, user: FARMER });
  const res = await app.post('/device', { token: 'fcm-abc', platform: 'android' });

  assert.equal(res.status, 200);
  const writes = db.callsTo('device_tokens', 'upsert');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.user_id, 'f1'); // the caller, not the client's claim
  assert.equal(writes[0].payload.token, 'fcm-abc');
  assert.equal(writes[0].payload.platform, 'android');
});

test('POST /device — any signed-in role may register (not just one)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('notifications', { supabase: db, user: CONSUMER });
  const res = await app.post('/device', { token: 'fcm-xyz', platform: 'ios' });
  assert.equal(res.status, 200);
  assert.equal(db.callsTo('device_tokens', 'upsert')[0].payload.user_id, 'c1');
});

test('POST /device — an unknown platform is a 400, and nothing is written', async () => {
  const db = fakeSupabase();
  app = await mountRoute('notifications', { supabase: db, user: FARMER });
  const res = await app.post('/device', { token: 'fcm-abc', platform: 'windows-phone' });

  assert.equal(res.status, 400);
  assert.equal(db.callsTo('device_tokens', 'upsert').length, 0);
});

test('POST /device — a missing token is a 400', async () => {
  const db = fakeSupabase();
  app = await mountRoute('notifications', { supabase: db, user: FARMER });
  const res = await app.post('/device', { platform: 'android' });

  assert.equal(res.status, 400);
  assert.equal(db.callsTo('device_tokens', 'upsert').length, 0);
});

test('POST /device — a failed write is a 500, not a false success', async () => {
  const db = fakeSupabase({ 'device_tokens:upsert': { error: { message: 'boom' } } });
  app = await mountRoute('notifications', { supabase: db, user: FARMER });
  const res = await app.post('/device', { token: 'fcm-abc', platform: 'android' });

  assert.equal(res.status, 500);
});

test('POST /device — an anonymous caller is turned away (401)', async () => {
  app = await mountRoute('notifications', { supabase: fakeSupabase(), user: null });
  const res = await app.post('/device', { token: 'fcm-abc', platform: 'android' });
  assert.equal(res.status, 401);
});

test('DELETE /device — removes only the caller\'s own token', async () => {
  const db = fakeSupabase();
  app = await mountRoute('notifications', { supabase: db, user: FARMER });
  const res = await app.request('DELETE', '/device', { token: 'fcm-abc' });

  assert.equal(res.status, 200);
  const deletes = db.callsTo('device_tokens', 'delete');
  assert.equal(deletes.length, 1);
  // Scoped by BOTH the token and the caller — you cannot delete someone else's row.
  assert.deepEqual(
    deletes[0].filters.sort(),
    [
      ['eq', 'token', 'fcm-abc'],
      ['eq', 'user_id', 'f1'],
    ].sort(),
  );
});

test('DELETE /device — a failed delete is a 500', async () => {
  const db = fakeSupabase({ 'device_tokens:delete': { error: { message: 'boom' } } });
  app = await mountRoute('notifications', { supabase: db, user: FARMER });
  const res = await app.request('DELETE', '/device', { token: 'fcm-abc' });
  assert.equal(res.status, 500);
});

// ── in-app feed (migration 053) ──────────────────────────────────────────────
// A user reads and clears only their own bell. These lock the scoping and the
// mark-read contract.

const FEED_ROWS = [
  { id: 'n1', type: 'order_placed', title: 'Order placed', body: 'x', data: {}, read_at: null, created_at: '2026-08-30T10:00:00Z' },
  { id: 'n2', type: 'order_delivered', title: 'Order delivered', body: 'y', data: {}, read_at: '2026-08-30T09:00:00Z', created_at: '2026-08-30T09:00:00Z' },
];

test('GET /notifications returns the feed with an unread count, scoped to the caller', async () => {
  const db = fakeSupabase({ 'notifications:select': { data: FEED_ROWS, count: 1 } });
  app = await mountRoute('notifications', { supabase: db, user: CONSUMER });
  const res = await app.get('/');

  assert.equal(res.status, 200);
  assert.equal(res.body.notifications.length, 2);
  assert.equal(res.body.unread, 1);
  const reads = db.callsTo('notifications', 'select');
  assert.ok(reads.every((c) => c.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'c1')));
});

test('GET /notifications/unread-count is scoped and returns the count', async () => {
  const db = fakeSupabase({ 'notifications:select': { data: [], count: 3 } });
  app = await mountRoute('notifications', { supabase: db, user: CONSUMER });
  const res = await app.get('/unread-count');

  assert.equal(res.status, 200);
  assert.equal(res.body.unread, 3);
});

test('POST /notifications/read {all:true} flips only this user\'s unread rows', async () => {
  const db = fakeSupabase({ 'notifications:update': { data: [] } });
  app = await mountRoute('notifications', { supabase: db, user: CONSUMER });
  const res = await app.post('/read', { all: true });

  assert.equal(res.status, 200);
  const upd = db.callsTo('notifications', 'update')[0];
  assert.ok(upd.payload.read_at, 'read_at is stamped');
  assert.ok(upd.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'c1'), 'scoped to the caller');
  assert.ok(upd.filters.some((f) => f[0] === 'is' && f[1] === 'read_at'), 'only unread rows are touched');
});

test('POST /notifications/read with neither id nor all is a 400', async () => {
  const db = fakeSupabase({});
  app = await mountRoute('notifications', { supabase: db, user: CONSUMER });
  const res = await app.post('/read', {});

  assert.equal(res.status, 400);
  assert.equal(db.callsTo('notifications', 'update').length, 0);
});
