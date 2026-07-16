// routes/users.js — admin user administration: listing (role/region scoped),
// account status (suspend/block/unblock + history), the HO-only audit/login viewers,
// the profile-change-request review queue (incl. subscription renewals), and the
// HO direct-edit endpoint.
//
// Server closed in afterEach, never inline: a failing assertion would otherwise leak
// the listener and hang `node --test` (see project_route_tests).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute, muteConsoleError } = require('../helpers/app');

const HO = { id: 'ho1', role: 'admin', admin_role: 'Head Office', fname: 'Deepa', district: 'Pudukkottai', state: 'TN' };
const DM = { id: 'dm1', role: 'admin', admin_role: 'District Manager', fname: 'Divya', district: 'Pudukkottai', state: 'TN' };
const RM = { id: 'rm1', role: 'admin', admin_role: 'Regional Manager', fname: 'Ravi', state: 'TN' };
const CONSUMER = { id: 'c1', role: 'consumer' };

let app = null;
afterEach(async () => {
  if (app) { await app.close(); app = null; }
});

const find = (calls, table, op) => calls.filter((c) => c.table === table && c.op === op);
const hasFilter = (call, wanted) =>
  call.filters.some((f) => JSON.stringify(f) === JSON.stringify(wanted));

// ── GET /users ────────────────────────────────────────────────────────────────
test('GET /users — Head Office sees an unscoped list', async () => {
  const db = fakeSupabase({ 'users:select': { data: [{ id: 'u1', fname: 'A' }, { id: 'u2', fname: 'B' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.get('/');
  assert.equal(res.status, 200);
  assert.equal(res.body.users.length, 2);
  const call = find(db.calls, 'users', 'select')[0];
  assert.ok(!call.filters.some((f) => f[0] === 'eq' && (f[1] === 'district' || f[1] === 'state')),
    'HO list must not be region-scoped');
});

test('GET /users — a District Manager only sees their own district', async () => {
  const db = fakeSupabase({ 'users:select': { data: [] } });
  app = await mountRoute('users', { supabase: db, user: DM });
  const res = await app.get('/');
  assert.equal(res.status, 200);
  assert.ok(hasFilter(find(db.calls, 'users', 'select')[0], ['eq', 'district', 'Pudukkottai']));
});

test('GET /users — a Regional Manager is scoped to their state', async () => {
  const db = fakeSupabase({ 'users:select': { data: [] } });
  app = await mountRoute('users', { supabase: db, user: RM });
  await app.get('/');
  assert.ok(hasFilter(find(db.calls, 'users', 'select')[0], ['eq', 'state', 'TN']));
});

test('GET /users — role/admin_role/district query params become filters', async () => {
  const db = fakeSupabase({ 'users:select': { data: [] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  await app.get('/?role=farmer&admin_role=VCO&district=Trichy');
  const call = find(db.calls, 'users', 'select')[0];
  assert.ok(hasFilter(call, ['eq', 'role', 'farmer']));
  assert.ok(hasFilter(call, ['eq', 'admin_role', 'VCO']));
  assert.ok(hasFilter(call, ['eq', 'district', 'Trichy']));
});

test('GET /users — a query error is a 500', async () => {
  const db = fakeSupabase({ 'users:select': { error: { message: 'boom' } } });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.get('/')).status, 500);
});

test('GET /users — a non-admin is forbidden (403)', async () => {
  app = await mountRoute('users', { supabase: fakeSupabase(), user: CONSUMER });
  assert.equal((await app.get('/')).status, 403);
});

test('GET /users — an anonymous caller is turned away (401)', async () => {
  app = await mountRoute('users', { supabase: fakeSupabase(), user: null });
  assert.equal((await app.get('/')).status, 401);
});

// ── PATCH /users/:id/status ───────────────────────────────────────────────────
test('PATCH /:id/status — an unknown status is a 400, nothing written', async () => {
  const db = fakeSupabase();
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1/status', { status: 'frozen' });
  assert.equal(res.status, 400);
  assert.equal(find(db.calls, 'users', 'update').length, 0);
});

test('PATCH /:id/status — blocking without a reason is a 400', async () => {
  const db = fakeSupabase();
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1/status', { status: 'blocked', reason: '   ' });
  assert.equal(res.status, 400);
  assert.equal(find(db.calls, 'users', 'select').length, 0, 'must reject before touching the DB');
});

test('PATCH /:id/status — a missing target is a 404', async () => {
  const db = fakeSupabase({ 'users:select': { data: [] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.patch('/nope/status', { status: 'suspended' })).status, 404);
});

test('PATCH /:id/status — no-op when already in that status (409)', async () => {
  const db = fakeSupabase({ 'users:select': { data: [{ id: 'u1', fname: 'Bob', status: 'blocked' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1/status', { status: 'blocked', reason: 'again' });
  assert.equal(res.status, 409);
  assert.equal(find(db.calls, 'users', 'update').length, 0);
});

test('PATCH /:id/status — block writes status + reason and records history', async () => {
  const db = fakeSupabase({
    'users:select': { data: [{ id: 'u1', fname: 'Bob', status: 'active' }] },
    'users:update': { data: [{ id: 'u1', fname: 'Bob', status: 'blocked', block_reason: 'fraud' }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1/status', { status: 'blocked', reason: 'fraud' });
  assert.equal(res.status, 200);

  const upd = find(db.calls, 'users', 'update')[0].payload;
  assert.equal(upd.status, 'blocked');
  assert.equal(upd.block_reason, 'fraud');

  const hist = find(db.calls, 'user_status_history', 'insert')[0].payload;
  assert.equal(hist.old_status, 'active');
  assert.equal(hist.new_status, 'blocked');
  assert.equal(hist.reason, 'fraud');
  assert.equal(hist.changed_by, 'ho1'); // the acting admin, from the token — not the client
});

test('PATCH /:id/status — reactivating clears the block reason', async () => {
  const db = fakeSupabase({
    'users:select': { data: [{ id: 'u1', fname: 'Bob', status: 'blocked' }] },
    'users:update': { data: [{ id: 'u1', fname: 'Bob', status: 'active', block_reason: null }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1/status', { status: 'active' });
  assert.equal(res.status, 200);
  assert.equal(find(db.calls, 'users', 'update')[0].payload.block_reason, null);
});

test('PATCH /:id/status — a failed status write is a 500', async () => {
  const db = fakeSupabase({
    'users:select': { data: [{ id: 'u1', fname: 'Bob', status: 'active' }] },
    'users:update': { error: { message: 'boom' } },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.patch('/u1/status', { status: 'suspended' })).status, 500);
});

// ── PATCH /:id/block & /:id/unblock (compat wrappers) ─────────────────────────
test('PATCH /:id/block — still requires a reason (400)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.patch('/u1/block', {})).status, 400);
});

test('PATCH /:id/block — with a reason blocks the user', async () => {
  const db = fakeSupabase({
    'users:select': { data: [{ id: 'u1', fname: 'Bob', status: 'active' }] },
    'users:update': { data: [{ id: 'u1', status: 'blocked', block_reason: 'spam' }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1/block', { reason: 'spam' });
  assert.equal(res.status, 200);
  assert.equal(find(db.calls, 'users', 'update')[0].payload.status, 'blocked');
});

test('PATCH /:id/unblock — reactivates and clears the reason', async () => {
  const db = fakeSupabase({
    'users:select': { data: [{ id: 'u1', fname: 'Bob', status: 'blocked' }] },
    'users:update': { data: [{ id: 'u1', status: 'active', block_reason: null }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1/unblock', {});
  assert.equal(res.status, 200);
  const upd = find(db.calls, 'users', 'update')[0].payload;
  assert.equal(upd.status, 'active');
  assert.equal(upd.block_reason, null);
});

// ── GET /:id/status-history ───────────────────────────────────────────────────
test('GET /:id/status-history — returns the rows', async () => {
  const db = fakeSupabase({ 'user_status_history:select': { data: [{ id: 'h1', old_status: 'active', new_status: 'blocked' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.get('/u1/status-history');
  assert.equal(res.status, 200);
  assert.equal(res.body.history.length, 1);
});

test('GET /:id/status-history — a query error is a 500', async () => {
  const db = fakeSupabase({ 'user_status_history:select': { error: { message: 'boom' } } });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.get('/u1/status-history')).status, 500);
});

// ── GET /:id/audit-log (HO only) ──────────────────────────────────────────────
test('GET /:id/audit-log — a non-Head-Office admin is refused (403)', async () => {
  app = await mountRoute('users', { supabase: fakeSupabase(), user: DM });
  assert.equal((await app.get('/u1/audit-log')).status, 403);
});

test('GET /:id/audit-log — Head Office reads it, and the limit is capped at 500', async () => {
  const db = fakeSupabase({ 'user_audit_log:select': { data: [{ id: 'a1', action: 'UPDATE' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.get('/u1/audit-log?limit=99999');
  assert.equal(res.status, 200);
  assert.ok(hasFilter(find(db.calls, 'user_audit_log', 'select')[0], ['limit', 500]));
});

// ── GET /:id/login-history (HO only) ──────────────────────────────────────────
test('GET /:id/login-history — a non-Head-Office admin is refused (403)', async () => {
  app = await mountRoute('users', { supabase: fakeSupabase(), user: DM });
  assert.equal((await app.get('/u1/login-history')).status, 403);
});

test('GET /:id/login-history — Head Office reads it', async () => {
  const db = fakeSupabase({ 'user_login_history:select': { data: [{ id: 'l1', success: true }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.get('/u1/login-history');
  assert.equal(res.status, 200);
  assert.equal(res.body.logins.length, 1);
});

// ── GET /change-requests (HO only) ────────────────────────────────────────────
test('GET /change-requests — a non-Head-Office admin is refused (403)', async () => {
  app = await mountRoute('users', { supabase: fakeSupabase(), user: DM });
  assert.equal((await app.get('/change-requests')).status, 403);
});

test('GET /change-requests — flattens the embedded subscription fields', async () => {
  const db = fakeSupabase({
    'profile_change_requests:select': {
      data: [{ id: 'cr1', status: 'pending', user: { subscription_plan: 'Yearly', subscription_expires_at: '2027-01-01T00:00:00Z' } }],
    },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.get('/change-requests');
  assert.equal(res.status, 200);
  const r = res.body.requests[0];
  assert.equal(r.subscription_plan, 'Yearly');
  assert.equal(r.user, undefined, 'the raw embed is stripped');
});

// ── POST /change-requests/:id/approve ─────────────────────────────────────────
test('approve — a missing request is a 404', async () => {
  const db = fakeSupabase({ 'profile_change_requests:select': { data: [] } }); // .single() → PGRST116
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/nope/approve', {})).status, 404);
});

test('approve — an already-reviewed request is a 409', async () => {
  const db = fakeSupabase({ 'profile_change_requests:select': { data: [{ id: 'cr1', status: 'approved' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/cr1/approve', {})).status, 409);
});

test('approve — a renewal with no amount is a 400', async () => {
  const db = fakeSupabase({
    'profile_change_requests:select': { data: [{ id: 'cr1', status: 'pending', user_id: 'u1', requested_changes: { subscription_renewal: true, new_plan: 'Yearly' } }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/cr1/approve', {})).status, 400);
});

test('approve — a renewal WITH an amount is accepted and issues a payment reference', async () => {
  // Regression guard: this path used an undefined `now`, so approving any renewal
  // threw a ReferenceError (an unhandled async rejection in Express 4).
  const db = fakeSupabase({
    'profile_change_requests:select': { data: [{ id: 'cr1', status: 'pending', user_id: 'u1', requested_changes: { subscription_renewal: true, new_plan: 'Yearly' } }] },
    'users:select': { data: [{ id: 'u1', fname: 'Bob', email: 'b@x.com', login_id: 'L1' }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.post('/change-requests/cr1/approve', { renewal_amount: 500 });
  assert.equal(res.status, 200);
  assert.match(res.body.payment_reference, /^RNW-/);
  const upd = find(db.calls, 'profile_change_requests', 'update')[0].payload;
  assert.equal(upd.status, 'payment_pending');
  assert.equal(upd.renewal_amount, 50000, 'rupees are stored as paise');
  assert.ok(upd.reviewed_at, 'reviewed_at is set (the field that referenced the missing `now`)');
});

test('approve — a regular profile change is applied to the user and marked approved', async () => {
  const db = fakeSupabase({
    'profile_change_requests:select': { data: [{ id: 'cr1', status: 'pending', user_id: 'u1', requested_changes: { bank_name: 'HDFC', ifsc: 'HDFC0001' } }] },
    'users:select': { data: [{ id: 'u1', fname: 'Bob', email: 'b@x.com', login_id: 'L1' }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.post('/change-requests/cr1/approve', {});
  assert.equal(res.status, 200);

  const userUpd = find(db.calls, 'users', 'update')[0].payload;
  assert.equal(userUpd.bank_name, 'HDFC');
  assert.equal(userUpd.ifsc, 'HDFC0001');
  assert.equal(find(db.calls, 'profile_change_requests', 'update')[0].payload.status, 'approved');
});

// ── POST /change-requests/:id/reject ──────────────────────────────────────────
test('reject — a missing request is a 404', async () => {
  const db = fakeSupabase({ 'profile_change_requests:select': { data: [] } }); // maybeSingle → null
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/nope/reject', {})).status, 404);
});

test('reject — an already-reviewed request is a 409', async () => {
  const db = fakeSupabase({ 'profile_change_requests:select': { data: [{ id: 'cr1', status: 'rejected' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/cr1/reject', {})).status, 409);
});

test('reject — a pending request is rejected', async () => {
  const db = fakeSupabase({
    'profile_change_requests:select': { data: [{ id: 'cr1', status: 'pending', user_id: 'u1', requested_changes: { bank_name: 'X' } }] },
    'users:select': { data: [{ id: 'u1', fname: 'Bob', email: 'b@x.com', login_id: 'L1' }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.post('/change-requests/cr1/reject', { notes: 'invalid IFSC' });
  assert.equal(res.status, 200);
  assert.equal(find(db.calls, 'profile_change_requests', 'update')[0].payload.status, 'rejected');
});

test('reject — a failed write is a 500, not a false "rejected"', async () => {
  const db = fakeSupabase({
    'profile_change_requests:select': { data: [{ id: 'cr1', status: 'pending', user_id: 'u1', requested_changes: {} }] },
    'profile_change_requests:update': { error: { message: 'boom' } },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/cr1/reject', {})).status, 500);
});

// ── POST /change-requests/:id/confirm-renewal-payment ─────────────────────────
test('confirm-renewal — refuses a non-renewal request (400)', async () => {
  const db = fakeSupabase({ 'profile_change_requests:select': { data: [{ id: 'cr1', status: 'payment_pending', requested_changes: { bank_name: 'X' } }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/cr1/confirm-renewal-payment', {})).status, 400);
});

test('confirm-renewal — refuses a request that is not payment_pending (409)', async () => {
  const db = fakeSupabase({ 'profile_change_requests:select': { data: [{ id: 'cr1', status: 'pending', requested_changes: { subscription_renewal: true, new_plan: 'Monthly' } }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/cr1/confirm-renewal-payment', {})).status, 409);
});

test('confirm-renewal — EXTENDS an unexpired subscription rather than rebasing to today', async () => {
  const future = new Date(Date.now() + 10 * 86400_000); // 10 days out
  const db = fakeSupabase({
    'profile_change_requests:select': { data: [{ id: 'cr1', status: 'payment_pending', user_id: 'u1', renewal_amount: 50000, requested_changes: { subscription_renewal: true, new_plan: 'Monthly' } }] },
    'users:select': { data: [{ id: 'u1', fname: 'Bob', email: 'b@x.com', login_id: 'L1', subscription_expires_at: future.toISOString() }] },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.post('/change-requests/cr1/confirm-renewal-payment', {});
  assert.equal(res.status, 200);

  const upd = find(db.calls, 'users', 'update')[0].payload;
  assert.equal(upd.status, 'active');
  assert.equal(upd.subscription_plan, 'Monthly');
  // Monthly = 30 days ON TOP of the existing 10 → well beyond `future`.
  assert.ok(new Date(upd.subscription_expires_at) > future,
    'a seller who renews early keeps the days they had left');
});

test('confirm-renewal — a failed read of the current expiry is a 500 (never a silent rebase)', async () => {
  const db = fakeSupabase({
    'profile_change_requests:select': { data: [{ id: 'cr1', status: 'payment_pending', user_id: 'u1', renewal_amount: 50000, requested_changes: { subscription_renewal: true, new_plan: 'Monthly' } }] },
    'users:select': { error: { message: 'boom' } },
  });
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.post('/change-requests/cr1/confirm-renewal-payment', {})).status, 500);
});

// ── GET /:id/listings ─────────────────────────────────────────────────────────
test('GET /:id/listings — returns the farmer\'s listings', async () => {
  const db = fakeSupabase({ 'farmer_listings:select': { data: [{ id: 'fl1', qty_available: 5 }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.get('/u1/listings');
  assert.equal(res.status, 200);
  assert.equal(res.body.listings.length, 1);
});

// ── GET /:id ──────────────────────────────────────────────────────────────────
test('GET /:id — returns the user', async () => {
  const db = fakeSupabase({ 'users:select': { data: [{ id: 'u1', fname: 'Bob', role: 'farmer' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.get('/u1');
  assert.equal(res.status, 200);
  assert.equal(res.body.user.fname, 'Bob');
});

test('GET /:id — a missing user is a 404', async () => {
  const db = fakeSupabase({ 'users:select': { data: [] } }); // .single() → PGRST116
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.get('/nope')).status, 404);
});

// ── PATCH /:id (HO direct edit) ───────────────────────────────────────────────
test('PATCH /:id — a non-Head-Office admin cannot edit profiles (403)', async () => {
  const db = fakeSupabase();
  app = await mountRoute('users', { supabase: db, user: DM });
  const res = await app.patch('/u1', { fname: 'New' });
  assert.equal(res.status, 403);
  assert.equal(find(db.calls, 'users', 'update').length, 0);
});

test('PATCH /:id — no editable fields is a 400', async () => {
  const db = fakeSupabase();
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.patch('/u1', { not_a_field: 'x' })).status, 400);
});

test('PATCH /:id — Head Office updates a field and vco_city tracks village_town', async () => {
  const db = fakeSupabase({ 'users:update': { data: [{ id: 'u1', fname: 'New', village_town: 'Alangudi' }] } });
  app = await mountRoute('users', { supabase: db, user: HO });
  const res = await app.patch('/u1', { fname: 'New', village_town: 'Alangudi' });
  assert.equal(res.status, 200);
  const upd = find(db.calls, 'users', 'update')[0].payload;
  assert.equal(upd.fname, 'New');
  assert.equal(upd.vco_city, 'Alangudi', 'the legacy VCO-matching column is kept in sync');
});

test('PATCH /:id — a removed account (update returns no row) is a 404', async () => {
  const db = fakeSupabase({ 'users:update': { data: [] } }); // .maybeSingle() → null
  app = await mountRoute('users', { supabase: db, user: HO });
  assert.equal((await app.patch('/u1', { fname: 'New' })).status, 404);
});
