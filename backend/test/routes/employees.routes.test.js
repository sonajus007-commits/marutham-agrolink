// Employee removal — the soft delete.
//
// The thing under test is not "does the row get a timestamp". It is the pair of
// invariants that make a removal mean something:
//
//   1. An employee is TWO rows — the tracker record and, if they ever had one, a
//      login carrying the same emp_id. Marking one and not the other produces the
//      only genuinely dangerous state: gone from the tracker, still able to sign in.
//      So the login is revoked FIRST, and if that write fails NOTHING else happens.
//
//   2. The row survives, and so does everything that points at it. The Employee ID
//      stays reserved (recycling it would make the audit trail ambiguous), the name
//      still resolves on the records they touched, and the history still reads.
//
// Both are asserted on the ORDER and CONTENT of the calls, because both are things
// only a double can show: you cannot ask a real Postgres to fail its first write and
// then check the second one never happened.

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

// The employee-tracker actor: Head Office (Admin) with the HR-Admin trust flag, so
// they hold Admin's role-permission authority (to mint trust flags) UNION HR's
// Employee Management full control (create/edit/approve/delete) — matching the RBAC
// model where employee lifecycle is HR-owned and trust-minting is Admin/Board.
const HR = { id: 'hr-1', role: 'admin', admin_role: 'Head Office', emp_id: 'MATN00001', is_hr_admin: true };
const VCO = { id: 'vco-1', role: 'admin', admin_role: 'VCO', emp_id: 'MATN00099' };

/** An employee with a login, as the tracker holds them. */
const LIVE_EMP = { id: 'e1', emp_id: 'MATN00006', fname: 'Asha', lname: 'R', deleted_at: null };

// The server is closed in afterEach, NOT at the end of each test body. A failing
// assertion throws past any close() call written inline, the Express listener stays
// open, and `node --test` then never exits — the run does not fail, it HANGS, which in
// CI is a stuck job instead of a red one. afterEach runs even when the test threw.
let app = null;
afterEach(async () => { if (app) { await app.close(); app = null; } });

async function mount(supabase, user = HR) {
  app = await mountRoute('employees', { supabase, user });
  return app;
}

// ── authority ────────────────────────────────────────────────────────────────

test('DELETE /employees/:id — a VCO cannot remove an employee', async () => {
  const db = fakeSupabase();
  const app = await mount(db, VCO);
  const res = await app.request('DELETE', '/e1');
  assert.equal(res.status, 403);
  assert.equal(db.callsTo('employees', 'update').length, 0, 'nothing may be written');
  assert.equal(db.callsTo('users', 'update').length, 0, 'no login may be revoked');
});

test('POST /employees/:id/restore — a VCO cannot restore an employee', async () => {
  const db = fakeSupabase();
  const app = await mount(db, VCO);
  const res = await app.post('/e1/restore');
  assert.equal(res.status, 403);
});

// ── the guards ───────────────────────────────────────────────────────────────

test('DELETE /employees/:id — unknown employee is a 404, not a write', async () => {
  const db = fakeSupabase({ 'employees:select': { data: [] } });
  const app = await mount(db);
  const res = await app.request('DELETE', '/nope');
  assert.equal(res.status, 404);
  assert.equal(db.callsTo('employees', 'update').length, 0);
});

test('DELETE /employees/:id — removing an already-removed employee is refused', async () => {
  const db = fakeSupabase({
    'employees:select': { data: [{ ...LIVE_EMP, deleted_at: '2026-07-01T00:00:00Z' }] },
  });
  const app = await mount(db);
  const res = await app.request('DELETE', '/e1');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /already been removed/i);
  assert.equal(db.callsTo('users', 'update').length, 0, 'must not re-stamp deleted_by on a second removal');
});

test('DELETE /employees/:id — an HR Admin cannot remove themselves', async () => {
  // The self-removal that locks the remover out of the console that would undo it:
  // requireAuth re-reads the user row every request, so they would be 401'd on their
  // very next call — including the call to restore themselves.
  const db = fakeSupabase({
    'employees:select': { data: [{ ...LIVE_EMP, id: 'e-self', emp_id: HR.emp_id }] },
  });
  const app = await mount(db);
  const res = await app.request('DELETE', '/e-self');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /cannot remove your own/i);
  assert.equal(db.callsTo('users', 'update').length, 0);
});

// ── the removal itself ───────────────────────────────────────────────────────

test('DELETE /employees/:id — revokes the login BEFORE hiding the tracker record', async () => {
  const db = fakeSupabase({
    'employees:select': { data: [LIVE_EMP] },
    'users:update':     { data: [{ id: 'u-asha' }] },      // one login revoked
    'employees:update': { data: [{ ...LIVE_EMP, deleted_at: '2026-07-14T00:00:00Z' }] },
  });
  const app = await mount(db);
  const res = await app.request('DELETE', '/e1');

  assert.equal(res.status, 200);
  assert.equal(res.body.login_revoked, true);
  assert.match(res.body.message, /can no longer sign in/i);

  // The order is the invariant. Reversed, a failure between the two writes leaves an
  // employee who is invisible to HR and still holding a working login.
  const writes = db.calls.filter((c) => c.op === 'update').map((c) => c.table);
  assert.deepEqual(writes, ['users', 'employees'], 'login revoked first, tracker hidden second');

  // Both rows carry who did it and when.
  const [userWrite, empWrite] = db.calls.filter((c) => c.op === 'update');
  assert.equal(userWrite.payload.deleted_by, HR.id);
  assert.ok(userWrite.payload.deleted_at, 'the login row is stamped');
  assert.equal(empWrite.payload.deleted_by, HR.id);
  assert.ok(empWrite.payload.deleted_at, 'the tracker row is stamped');

  // The login is found by emp_id — linked_user_id is a dead column and always has been.
  assert.ok(userWrite.filters.some(([op, col, val]) => op === 'eq' && col === 'emp_id' && val === 'MATN00006'));
});

test('DELETE /employees/:id — if the login cannot be revoked, the employee is NOT hidden', async () => {
  // The half-state this whole ordering exists to prevent. A failed revoke must abort
  // the removal outright: better a visible employee with a working login (which HR can
  // see and retry) than a hidden one with a working login (which nobody will ever spot).
  const db = fakeSupabase({
    'employees:select': { data: [LIVE_EMP] },
    'users:update':     { error: { message: 'connection reset' } },
  });
  const app = await mount(db);
  const res = await app.request('DELETE', '/e1');

  assert.equal(res.status, 500);
  assert.match(res.body.error, /nothing was removed/i);
  assert.equal(db.callsTo('employees', 'update').length, 0,
    'the tracker row must be untouched when the login could not be revoked');
});

test('DELETE /employees/:id — an employee who never had a login is removed cleanly', async () => {
  const db = fakeSupabase({
    'employees:select': { data: [{ id: 'e2', emp_id: null, fname: 'Pending', deleted_at: null }] },
    'employees:update': { data: [{ id: 'e2' }] },
  });
  const app = await mount(db);
  const res = await app.request('DELETE', '/e2');

  assert.equal(res.status, 200);
  assert.equal(res.body.login_revoked, false);
  assert.equal(db.callsTo('users', 'update').length, 0, 'no login to revoke, so no users write');
  assert.equal(db.callsTo('employees', 'update').length, 1);
});

// ── what a removal must NOT destroy ──────────────────────────────────────────

test('a removed employee keeps their Employee ID reserved — the next hire does not inherit it', async () => {
  // The trap. If nextEmpId skipped removed employees, the departed MATN00006 would be
  // handed to the next hire, and every audit row naming MATN00006 would become
  // ambiguous between two people. The generator must count PAST the dead.
  const db = fakeSupabase({
    'employees:select': { data: [{ emp_id: 'MATN00006', deleted_at: '2026-07-14T00:00:00Z' }] },
    'employees:insert': (ctx) => ({ data: [{ id: 'e9', ...ctx.payload }] }),
  });
  const app = await mount(db);
  // A Board of Director is auto-approved, so this issues an Employee ID immediately.
  const res = await app.post('/', {
    fname: 'New', state: 'Tamil Nadu', employment_type: 'Permanent', is_board_director: true,
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.employee.emp_id, 'MATN00007',
    'the removed MATN00006 must still be counted — its ID is retired, not recycled');
});

// ── the async-throw class: a failed nextEmpId must 500, NOT kill the process ──
// nextEmpId throws when its lookup errors. Before the try/catch, the throw was an
// unhandled rejection in an Express 4 async handler — which Node answers by killing the
// whole API. The test can only assert the RESPONSE (a clean 500); the process-staying-up
// half is the server.js net, exercised by the driving script, not here. What this pins
// down is that the handler now RESPONDS instead of leaving the request to hang.
test('POST /employees — a failed Employee-ID lookup returns 500, it does not throw uncaught', async () => {
  const db = fakeSupabase({
    'employees:select': { error: { message: 'lookup exploded' } },   // nextEmpId throws
  });
  const app = await mount(db);
  const res = await app.post('/', {
    fname: 'New', state: 'Tamil Nadu', employment_type: 'Permanent', is_board_director: true,
  });
  assert.equal(res.status, 500);
  assert.equal(db.callsTo('employees', 'insert').length, 0, 'nothing is inserted when the ID could not be minted');
});

test('PATCH /employees/:id/approve — a failed Employee-ID lookup returns 500, it does not throw uncaught', async () => {
  // Two employees:select calls happen: the first loads the record (must succeed), the
  // second is nextEmpId's lookup (must fail). A stateful handler distinguishes them.
  let call = 0;
  const db = fakeSupabase({
    'employees:select': () => (++call === 1
      ? { data: [{ id: 'e1', emp_id: null, state: 'Tamil Nadu', approval_status: 'pending', deleted_at: null }] }
      : { error: { message: 'lookup exploded' } }),
  });
  const app = await mount(db);
  const res = await app.patch('/e1/approve', {});
  assert.equal(res.status, 500);
  assert.equal(db.callsTo('employees', 'update').length, 0, 'no approval is written when the ID could not be minted');
});

test('GET /employees — removed employees are not in the list', async () => {
  const db = fakeSupabase({
    'employees:select': { data: [
      { id: 'e1', fname: 'Asha',  deleted_at: null },
      { id: 'e2', fname: 'Gone',  deleted_at: '2026-07-14T00:00:00Z' },
    ] },
  });
  const app = await mount(db);
  const res = await app.get('/');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.employees.map((e) => e.fname), ['Asha']);
});

test('GET /employees?deleted=1 — lists ONLY the removed, so they can be restored', async () => {
  // A restore endpoint you cannot aim is not a restore endpoint.
  const db = fakeSupabase({
    'employees:select': { data: [
      { id: 'e1', fname: 'Asha', deleted_at: null },
      { id: 'e2', fname: 'Gone', deleted_at: '2026-07-14T00:00:00Z' },
    ] },
  });
  const app = await mount(db);
  const res = await app.get('/?deleted=1');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.employees.map((e) => e.fname), ['Gone']);
});

test('GET /employees/:id — a removed employee can still be opened, and their history read', async () => {
  // The detail view is deliberately NOT filtered. Hiding the record from the people
  // auditing it would defeat the entire reason the row was kept.
  const db = fakeSupabase({
    'employees:select': { data: [{ ...LIVE_EMP, deleted_at: '2026-07-14T00:00:00Z' }] },
  });
  const app = await mount(db);
  const res = await app.get('/e1');

  assert.equal(res.status, 200);
  assert.equal(res.body.employee.id, 'e1');
  assert.ok(res.body.employee.deleted_at, 'the record still resolves, and says it is removed');
});

// ── edits are refused while removed ──────────────────────────────────────────

test('PATCH /employees/:id — a removed employee cannot be edited', async () => {
  const db = fakeSupabase({ 'employees:update': { data: [] } });   // the deleted_at filter matched nothing
  const app = await mount(db);
  const res = await app.patch('/e1', { designation: 'CEO' });

  assert.equal(res.status, 404);
  assert.match(res.body.error, /removed/i);
  // Not a 500: .single() would have reported "no rows" as an error and turned an
  // ordinary "they're gone" into a server fault.
});

test('PATCH /employees/:id/approve — a removed employee cannot be approved', async () => {
  const db = fakeSupabase({ 'employees:select': { data: [] } });
  const app = await mount(db);
  const res = await app.patch('/e1/approve');
  assert.equal(res.status, 404);
  assert.equal(db.callsTo('employees', 'update').length, 0, 'no Employee ID may be issued to a removed employee');
});

// ── designation change syncs the linked login role ───────────────────────────
// The tracker record and the login are two rows sharing an emp_id. A designation
// change on the tracker must follow through to the login's admin_role, or the Users
// page keeps showing the old role and RBAC keeps granting the old permissions.

test('PATCH /employees/:id — a mapped designation change updates the linked login role', async () => {
  const db = fakeSupabase({
    'employees:update': { data: { ...LIVE_EMP, designation: 'Delivery Agent' } },
    // The login is looked up (by emp_id) before syncing — it currently holds a
    // DIFFERENT role, so the change actually fires.
    'users:select':     { data: [{ id: 'u-asha', admin_role: 'VCO' }] },
    'users:update':     { data: [{ id: 'u-asha' }] },
  });
  const app = await mount(db);
  const res = await app.patch('/e1', { designation: 'Delivery Agent' });

  assert.equal(res.status, 200);
  assert.equal(res.body.login_sync.status, 'changed');
  assert.equal(res.body.login_sync.role, 'Delivery Agent');
  const userLookups = db.callsTo('users', 'select');
  assert.ok(
    userLookups.some((c) => c.filters.some((f) => f[0] === 'eq' && f[1] === 'emp_id' && f[2] === 'MATN00006')),
    'the linked login is found by its emp_id',
  );
  const userUpdates = db.callsTo('users', 'update');
  assert.equal(userUpdates.length, 1, 'the linked login is updated');
  assert.equal(userUpdates[0].payload.admin_role, 'Delivery Agent');
  // scoped to the specific login row that was found
  assert.ok(userUpdates[0].filters.some((f) => f[0] === 'eq' && f[1] === 'id' && f[2] === 'u-asha'));
});

test('PATCH /employees/:id — an unmapped designation over a live login surfaces the mismatch, silently no more', async () => {
  const db = fakeSupabase({
    'employees:update': { data: { ...LIVE_EMP, designation: 'General Manager' } },
    'users:select':     { data: [{ id: 'u-asha', admin_role: 'VCO' }] },
  });
  const app = await mount(db);
  const res = await app.patch('/e1', { designation: 'General Manager' });

  assert.equal(res.status, 200);
  assert.equal(db.callsTo('users', 'update').length, 0, 'no arbitrary title is turned into a login role');
  assert.equal(res.body.login_sync.status, 'unmapped');
  assert.equal(res.body.login_sync.current_role, 'VCO');
  assert.match(res.body.message, /review it if that is a mismatch/i);
});

test('PATCH /employees/:id — an org title with no mapped login role does NOT touch a login', async () => {
  const db = fakeSupabase({
    'employees:update': { data: { ...LIVE_EMP, designation: 'General Manager' } },
  });
  const app = await mount(db);
  const res = await app.patch('/e1', { designation: 'General Manager' });

  assert.equal(res.status, 200);
  assert.equal(db.callsTo('users', 'update').length, 0, 'no arbitrary title is turned into a login role');
});

test('PATCH /employees/:id — editing a non-designation field leaves the login alone', async () => {
  const db = fakeSupabase({
    'employees:update': { data: { ...LIVE_EMP, email: 'asha@example.com' } },
  });
  const app = await mount(db);
  const res = await app.patch('/e1', { email: 'asha@example.com' });

  assert.equal(res.status, 200);
  assert.equal(db.callsTo('users', 'update').length, 0);
});

// ── restore ──────────────────────────────────────────────────────────────────

test('POST /employees/:id/restore — brings back the record and the login', async () => {
  const db = fakeSupabase({
    'employees:select': { data: [{ ...LIVE_EMP, deleted_at: '2026-07-14T00:00:00Z' }] },
    'employees:update': { data: [{ ...LIVE_EMP, deleted_at: null }] },
    'users:update':     { data: [{ id: 'u-asha' }] },
  });
  const app = await mount(db);
  const res = await app.post('/e1/restore');

  assert.equal(res.status, 200);
  assert.equal(res.body.login_restored, true);

  // Reverse of the delete, for the same reason: visible-but-locked-out is the safe
  // half-state; signed-in-but-invisible is not.
  const writes = db.calls.filter((c) => c.op === 'update').map((c) => c.table);
  assert.deepEqual(writes, ['employees', 'users'], 'record restored first, login re-enabled second');

  for (const w of db.calls.filter((c) => c.op === 'update')) {
    assert.equal(w.payload.deleted_at, null, 'the mark is cleared, not overwritten with a new time');
    assert.equal(w.payload.deleted_by, null);
  }
});

test('POST /employees/:id/restore — restoring someone who was never removed is refused', async () => {
  const db = fakeSupabase({ 'employees:select': { data: [LIVE_EMP] } });
  const app = await mount(db);
  const res = await app.post('/e1/restore');

  assert.equal(res.status, 400);
  assert.match(res.body.error, /has not been removed/i);
  assert.equal(db.callsTo('employees', 'update').length, 0);
});
