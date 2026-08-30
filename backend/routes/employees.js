const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requirePermission, can, roleIdForAdminRole } = require('../middleware/permissions');
const { stateCode } = require('../utils/codeGen');
const { loginRoleForDesignation } = require('../utils/designationRole');

const router = express.Router();

// The employee tracker is the Employee Management module. Access is gated per-route
// by requirePermission('employee_management', <action>): HR holds Full Control
// (via role or the is_hr_admin trust flag); Board/Admin/managers hold View. The one
// finer control that a module action can't express is who may MINT the trust flags
// themselves (is_board_director / is_hr_admin) — a privilege-elevation act reserved
// for Admin (role_permission_management edit) or an existing Board Director.
function canMintTrustRoles(user) {
  return can(user, 'role_permission_management', 'edit') || user.is_board_director === true;
}

const truthy = (v) => v === true || v === 'true' || v === '1';

// Columns a tracker manager may write to an employee-tracker record.
const EMPLOYEE_FIELDS = [
  'fname', 'lname', 'gender', 'dob', 'phone', 'email', 'aadhar',
  'address_line', 'house_no', 'street1', 'street2',
  'village_town', 'city', 'taluk', 'district', 'state', 'pincode',
  'designation', 'department', 'career_band', 'employment_type', 'date_of_joining',
  'work_location', 'work_district', 'work_state',
  'reporting_manager', 'reporting_manager_emp_id', 'is_manager',
  'status', 'notes',
];

// Career band is an HR dimension separate from RBAC (037_rbac.sql) — a promotion
// must never auto-grant system access. The app auto-fills it from a designation
// catalog but HR may override, so the only server-side rule is that a supplied
// value is one of the 13 codes. Empty string is normalised to null by pickFields.
const CAREER_BANDS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12'];
function invalidBand(rec) {
  return rec.career_band != null && !CAREER_BANDS.includes(rec.career_band);
}

// The career band is a PERMANENT-employee classification (see 040). A contract
// employee never carries one, so a Contract employment_type in the same write
// nulls the band — matching the DB constraint and turning a "switched to
// contract" edit into a clean clear instead of a 500 from the check.
function clearBandForContract(rec) {
  if (rec.employment_type === 'Contract') rec.career_band = null;
}

// Next auto Employee ID: <prefix> + <2-letter state code> + 5-digit per-state
// sequence, restarting at 00001 for each prefix+state combination.
//   Permanent -> MA…  (Marutham Agrolink):  Tamil Nadu MATN00001, Karnataka MAKA00001
//   Contract  -> CE…  (Contract Employee):  Tamil Nadu CETN00001, Karnataka CEKA00001
async function nextEmpId(state, employmentType) {
  const base   = (employmentType === 'Contract') ? 'CE' : 'MA';
  const prefix = base + stateCode(state);          // e.g. MATN / CETN
  // max + 1 is only safe if we actually SAW the existing IDs. Unread, a failed read
  // left `data` null, `max` stayed 0, and the generator handed back an Employee ID
  // that already belongs to somebody. auth.js's login-ID generator guards exactly
  // this; this one did not.
  //
  // Deliberately NOT filtered by deleted_at: a removed employee keeps their Employee
  // ID reserved forever. Skipping them here would re-issue a departed employee's ID
  // to a new hire, and the Employee ID is the only thing tying the audit trail to a
  // person — every historical row for MATN00006 would become ambiguous.
  const { data, error } = await supabase
    .from('employees')
    .select('emp_id')
    .ilike('emp_id', prefix + '%');

  if (error) throw new Error(`Employee ID lookup failed: ${error.message}`);
  const re = new RegExp('^' + prefix + '(\\d{5})$');
  let max = 0;
  (data || []).forEach((r) => {
    const m = re.exec(r.emp_id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return prefix + String(max + 1).padStart(5, '0');
}

function pickFields(body) {
  const out = {};
  for (const k of EMPLOYEE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k] === '' ? null : body[k];
  }
  return out;
}

// ── GET /employees/me ─────────────────────────────────────────────────────────
// The logged-in staff member's OWN employee master record (read-only). Read live
// so any HO update (e.g. a promotion) reflects on the employee's next profile view.
// Returns { employee: null } for contract / unlinked staff.
router.get('/me', requireAuth, async (req, res) => {
  const empId = req.user.emp_id;
  if (!empId) return res.json({ employee: null });
  const { data, error } = await supabase
    .from('employees').select('*').eq('emp_id', empId).is('deleted_at', null).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ employee: data || null });
});

// ── GET /employees ────────────────────────────────────────────────────────────
// List employee-tracker records — Head Office / State Head only (HR ownership).
// Optional ?q= search and ?status= filter.
//
// Removed employees are hidden by default. `?deleted=1` lists ONLY the removed ones —
// which is what makes the restore endpoint usable: you cannot restore somebody you
// have no way to see.
router.get('/', requirePermission('employee_management', 'view'), async (req, res) => {
  try {
    let q = supabase.from('employees').select('*').order('created_at', { ascending: false });
    q = truthy(req.query.deleted)
      ? q.not('deleted_at', 'is', null)
      : q.is('deleted_at', null);
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.approval_status) q = q.eq('approval_status', req.query.approval_status);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    let rows = data || [];
    const term = (req.query.q || '').trim().toLowerCase();
    if (term) {
      rows = rows.filter((e) =>
        [e.emp_id, e.fname, e.lname, e.phone, e.designation, e.department]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(term))
      );
    }
    res.json({ employees: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /employees/lookup/:empId ──────────────────────────────────────────────
// Quick existence/validity check used by the staff forms.
router.get('/lookup/:empId', requirePermission('employee_management', 'view'), async (req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .select('id, emp_id, fname, lname, gender, phone, email, aadhar, ' +
            'village_town, city, taluk, district, state, pincode, ' +
            'designation, department, employment_type, date_of_joining, ' +
            'work_state, work_district, work_location, ' +
            'reporting_manager, reporting_manager_emp_id, status')
    .eq('emp_id', req.params.empId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Employee ID not found in the tracker.' });
  // One login per employee — flag if this Employee ID already backs a staff account
  // so the form can warn before submit.
  //
  // NOT filtered by deleted_at, unlike the employee lookup above: a removed employee's
  // login row survives and still holds this emp_id, so it must still count as taken.
  // Reporting it as free would invite a second login for the same person.
  const { data: loginRows, error: loginRowsErr } = await supabase
    .from('users').select('login_id').eq('emp_id', req.params.empId).limit(1);
  // Advisory only — the real binding guard is enforced on create. But a failed read
  // here silently drops the warning the form relies on.
  if (loginRowsErr) console.error('Existing-login lookup failed:', loginRowsErr.message);
  const existing_login_id = (loginRows && loginRows.length) ? loginRows[0].login_id : null;
  res.json({ employee: data, existing_login_id });
});

// ── GET /employees/managers ───────────────────────────────────────────────────
// Employees flagged as Manager, for the Reporting-Manager picker. Restricted to
// the org unit the employee belongs to: same Work District + same Department.
// Both filters are required so the popup only ever shows valid reporting lines.
router.get('/managers', requirePermission('employee_management', 'view'), async (req, res) => {
  const district   = (req.query.district || '').trim();
  const department = (req.query.department || '').trim();
  if (!district || !department) {
    return res.json({ managers: [] });   // need both to define the org unit
  }
  const { data, error } = await supabase
    .from('employees')
    .select('id, emp_id, fname, lname, designation, department, work_district, status')
    .eq('is_manager', true)
    .eq('status', 'active')
    .eq('approval_status', 'approved')
    .eq('department', department)
    .eq('work_district', district)
    .is('deleted_at', null)          // nobody reports to a removed manager
    .order('fname', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  // Exclude the employee themselves (can't report to self).
  let rows = data || [];
  if (req.query.exclude) rows = rows.filter((m) => m.id !== req.query.exclude);
  res.json({ managers: rows });
});

// ── GET /employees/:id ────────────────────────────────────────────────────────
router.get('/:id', requirePermission('employee_management', 'view'), async (req, res) => {
  const { data, error } = await supabase
    .from('employees').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Employee not found.' });
  res.json({ employee: data });
});

// ── GET /employees/:id/history ────────────────────────────────────────────────
// Full change history from the DB audit trigger. Head Office / State Head only.
router.get('/:id/history', requirePermission('employee_management', 'view'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const { data, error } = await supabase
    .from('employee_audit_log')
    .select('id, action, changed_fields, row_snapshot, changed_at, changed_by')
    .eq('employee_id', req.params.id)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ audit: data || [] });
});

// ── POST /employees ───────────────────────────────────────────────────────────
// Creates an employee. Board of Director / HR Admin records are AUTO-APPROVED
// (bootstrap) and get their Employee ID immediately. Every other employee is
// created as a PENDING request with NO Employee ID until an HR Admin approves.
router.post('/', requirePermission('employee_management', 'create'), async (req, res) => {
  // nextEmpId THROWS if its lookup fails (an Employee ID can't be minted from an unread
  // sequence). Express 4 does not catch throws from an async handler — the rejection
  // is unhandled and Node's default kills the process. A try/catch keeps one bad
  // request from taking the whole API down; the process-level net in server.js is the
  // backstop, but the handler is where the client actually gets an answer.
  try {
    const rec = pickFields(req.body);
    if (!rec.fname) return res.status(400).json({ error: 'Employee first name is required.' });
    if (invalidBand(rec)) return res.status(400).json({ error: 'Invalid career band. Must be one of L0–L12.' });
    clearBandForContract(rec);

    // Trust-role flags — only Head Office or a Board of Director may set them.
    const wantsBoD     = truthy(req.body.is_board_director);
    const wantsHrAdmin = truthy(req.body.is_hr_admin);
    if ((wantsBoD || wantsHrAdmin) && !canMintTrustRoles(req.user)) {
      return res.status(403).json({ error: 'Only Head Office or a Board of Director can mark someone as Board of Director / HR Admin.' });
    }
    rec.is_board_director = wantsBoD;
    rec.is_hr_admin       = wantsHrAdmin;
    rec.requested_by      = req.user.id;
    rec.status            = rec.status || 'active';

    // Board of Director + HR Admin skip approval and get an ID right away.
    const autoApprove = wantsBoD || wantsHrAdmin;
    if (autoApprove) {
      const st = rec.state || rec.work_state;
      if (!st) return res.status(400).json({ error: 'Select a State so the Employee ID can be generated.' });
      rec.emp_id          = await nextEmpId(st, rec.employment_type);
      rec.approval_status = 'approved';
      rec.approved_by     = req.user.id;
      rec.approved_at     = new Date().toISOString();
    } else {
      rec.emp_id          = null;             // issued on approval
      rec.approval_status = 'pending';
    }

    const { data, error } = await supabase.from('employees').insert(rec).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({
      message: autoApprove
        ? `Employee added and auto-approved. Employee ID: ${data.emp_id}.`
        : 'Employee request submitted for HR Admin approval. An Employee ID will be issued once approved.',
      employee: data,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not create the employee.' });
  }
});

// ── PATCH /employees/:id ──────────────────────────────────────────────────────
router.patch('/:id', requirePermission('employee_management', 'edit'), async (req, res) => {
  const updates = pickFields(req.body);

  // Employee ID is permanent once generated — never editable after creation.
  delete updates.emp_id;

  if (invalidBand(updates)) return res.status(400).json({ error: 'Invalid career band. Must be one of L0–L12.' });
  clearBandForContract(updates);

  // Trust-role flags can be delegated later, but only by Head Office / a Board of Director.
  if (req.body.is_board_director !== undefined || req.body.is_hr_admin !== undefined) {
    if (!canMintTrustRoles(req.user)) {
      return res.status(403).json({ error: 'Only Head Office or a Board of Director can change the Board of Director / HR Admin flags.' });
    }
    if (req.body.is_board_director !== undefined) updates.is_board_director = truthy(req.body.is_board_director);
    if (req.body.is_hr_admin       !== undefined) updates.is_hr_admin       = truthy(req.body.is_hr_admin);
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });

  // maybeSingle, not single: with the deleted_at filter the update can legitimately
  // match no row (removed employee, or bad id), and .single() reports "no rows" as an
  // error — which would turn "this employee was removed" into a 500.
  const { data, error } = await supabase
    .from('employees').update(updates).eq('id', req.params.id)
    .is('deleted_at', null)
    .select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Employee not found, or has been removed. Restore them first to make changes.' });

  // Keep the linked login in sync. The employee tracker and the login (a `users` row
  // sharing this emp_id) are separate records, and a login is issued from the
  // designation at creation. When the designation changes here, the login's role must
  // follow — otherwise the Users page keeps showing the old role and RBAC still grants
  // the old permissions. Only designations that map to a distinct login role are
  // propagated; an org/management title (no mapped role) is left alone rather than
  // turned into an arbitrary — possibly privileged — login role (escalation guard).
  //
  // The old code did all this SILENTLY: an unmapped designation, or a linked login
  // that now disagrees with the new designation, produced a plain "Employee updated."
  // with no hint that a mismatch was left behind. It now always reports the linked
  // login's state (`login_sync`) so the caller can surface it. Best-effort still: a
  // sync failure is logged and reported, never failing the edit that already landed.
  let login_sync = null;
  if (updates.designation !== undefined && data.emp_id) {
    const { data: loginRows, error: loginErr } = await supabase
      .from('users')
      .select('id, admin_role')
      .eq('emp_id', data.emp_id)
      .eq('role', 'admin')
      .is('deleted_at', null)
      .limit(1);
    const login = loginRows && loginRows.length ? loginRows[0] : null;
    const newRole = loginRoleForDesignation(data.designation);

    if (loginErr) {
      console.error(`Employee ${data.emp_id}: login lookup for role sync failed:`, loginErr.message);
      login_sync = { status: 'error' };
    } else if (!login) {
      // Contract / unlinked staff, or a login was never issued — nothing to sync.
      login_sync = { status: 'no_login' };
    } else if (!newRole) {
      // Unmapped org/management title: we deliberately do NOT propagate it (a raw
      // title is not a real login role). Surface that the login keeps its old role
      // so a real mismatch is visible instead of silent.
      login_sync = { status: 'unmapped', current_role: login.admin_role };
    } else if (newRole === login.admin_role) {
      login_sync = { status: 'unchanged', role: newRole };
    } else {
      const roleId = await roleIdForAdminRole(newRole);
      const patch = { admin_role: newRole, updated_at: new Date().toISOString() };
      if (roleId) patch.role_id = roleId; // null would strip RBAC → leave the old one
      const { error: syncErr } = await supabase.from('users').update(patch).eq('id', login.id);
      if (syncErr) {
        console.error(`Employee ${data.emp_id}: login role sync failed:`, syncErr.message);
        login_sync = { status: 'error', from: login.admin_role, role: newRole };
      } else {
        login_sync = { status: 'changed', role: newRole, from: login.admin_role };
      }
    }
  }

  const LOGIN_SYNC_MESSAGE = {
    changed:   (s) => `Employee updated. Linked login role changed to ${s.role} (was ${s.from}).`,
    unchanged: (s) => `Employee updated. Linked login role already ${s.role}.`,
    unmapped:  (s) => `Employee updated. This designation carries no distinct login role, so the linked login keeps its current role (${s.current_role}) — review it if that is a mismatch.`,
    no_login:  () => 'Employee updated. No linked login to sync.',
    error:     () => 'Employee updated, but the linked login role could not be synced — set it on the Users page or retry.',
  };
  const message = login_sync ? LOGIN_SYNC_MESSAGE[login_sync.status](login_sync) : 'Employee updated.';

  res.json({ message, employee: data, ...(login_sync ? { login_sync } : {}) });
});

// ── PATCH /employees/:id/approve ──────────────────────────────────────────────
// Approve a pending employee → issue the Employee ID and mark active. Only an
// HR Admin / Board of Director / Head Office may approve.
router.patch('/:id/approve', requirePermission('employee_management', 'approve'), async (req, res) => {
  // Same class as POST / above: the await on nextEmpId can throw, and an uncaught throw
  // in an Express 4 async handler is an unhandled rejection that kills the process.
  try {
    const { data: emp, error: e1 } = await supabase
      .from('employees').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e1 || !emp) return res.status(404).json({ error: 'Employee not found, or has been removed.' });
    if (emp.approval_status === 'approved') return res.status(400).json({ error: 'This employee is already approved.' });

    const st = emp.state || emp.work_state;
    if (!st) return res.status(400).json({ error: 'This record has no State set — cannot generate an Employee ID. Edit the record and set a State first.' });

    const empId = emp.emp_id || await nextEmpId(st, emp.employment_type);
    const { data, error } = await supabase
      .from('employees')
      .update({
        approval_status: 'approved',
        status: 'active',
        emp_id: empId,
        approved_by: req.user.id,
        approved_at: new Date().toISOString(),
        rejected_reason: null,
      })
      .eq('id', req.params.id)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: `Employee approved. Employee ID: ${data.emp_id}.`, employee: data });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not approve the employee.' });
  }
});

// ── PATCH /employees/:id/reject ───────────────────────────────────────────────
router.patch('/:id/reject', requirePermission('employee_management', 'approve'), async (req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .update({
      approval_status: 'rejected',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      rejected_reason: (req.body.reason || '').trim() || null,
    })
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Employee not found, or has been removed.' });
  res.json({ message: 'Employee request rejected.', employee: data });
});

// ── DELETE /employees/:id ─────────────────────────────────────────────────────
// Remove an employee. This is a SOFT delete — see 027_soft_delete_employees_users.sql
// for why the row must survive (the audit trail and login history point at it).
//
// An employee is two rows: the `employees` tracker record, and — if a login was ever
// created for them — a `users` row carrying the same emp_id. Both must be marked, or
// we get the worst possible half-state: gone from the tracker, still able to sign in.
//
// ORDER MATTERS. The login is revoked FIRST. If the second write then fails, the
// employee is locked out but still visible — a state HR can see and retry. Doing it
// the other way round, a failure would leave them hidden from the tracker with their
// login still live: an account nobody can see and nobody will think to revoke.
router.delete('/:id', requirePermission('employee_management', 'delete'), async (req, res) => {

  const { data: emp, error: findErr } = await supabase
    .from('employees').select('id, emp_id, fname, lname, deleted_at').eq('id', req.params.id).maybeSingle();
  if (findErr) return res.status(500).json({ error: 'Could not look up that employee. Please try again.' });
  if (!emp)    return res.status(404).json({ error: 'Employee not found.' });
  if (emp.deleted_at) return res.status(400).json({ error: 'This employee has already been removed.' });

  // You cannot remove yourself. Without this, an HR Admin can revoke their own login
  // mid-request and lock themselves out of the console that would let them undo it.
  if (emp.emp_id && emp.emp_id === req.user.emp_id) {
    return res.status(400).json({ error: 'You cannot remove your own employee record. Ask another HR Admin or Head Office to do it.' });
  }

  const stamp = { deleted_at: new Date().toISOString(), deleted_by: req.user.id };

  // 1. Revoke the login, if one exists. requireAuth re-reads the user row on every
  //    request, so this takes effect on their very next call — their existing token
  //    does not have to expire first.
  let login_revoked = false;
  if (emp.emp_id) {
    const { data: revoked, error: userErr } = await supabase
      .from('users')
      .update({ ...stamp, updated_at: new Date().toISOString() })
      .eq('emp_id', emp.emp_id)
      .is('deleted_at', null)
      .select('id');
    if (userErr) {
      return res.status(500).json({ error: 'Could not revoke this employee\'s login, so nothing was removed. Please try again.' });
    }
    login_revoked = (revoked || []).length > 0;
  }

  // 2. Hide the tracker record.
  const { data, error } = await supabase
    .from('employees').update(stamp).eq('id', req.params.id)
    .select().maybeSingle();
  if (error) {
    return res.status(500).json({
      error: 'The login was revoked, but the employee record could not be removed. They cannot sign in. Please retry the removal.',
    });
  }

  res.json({
    message: login_revoked
      ? `${emp.fname || 'Employee'} removed. Their login has been revoked and they can no longer sign in.`
      : `${emp.fname || 'Employee'} removed.`,
    login_revoked,
    employee: data,
  });
});

// ── POST /employees/:id/restore ───────────────────────────────────────────────
// Undo a removal — for the re-hire, and for the misclick. Restores the tracker record
// and the login together.
//
// Reverse order to the delete, for the same reason: bring the record BACK into view
// first, then re-enable the login. A half-failure then leaves them visible but still
// locked out, which is safe and obvious — never signed-in but invisible.
router.post('/:id/restore', requirePermission('employee_management', 'edit'), async (req, res) => {

  const { data: emp, error: findErr } = await supabase
    .from('employees').select('id, emp_id, fname, deleted_at').eq('id', req.params.id).maybeSingle();
  if (findErr) return res.status(500).json({ error: 'Could not look up that employee. Please try again.' });
  if (!emp)    return res.status(404).json({ error: 'Employee not found.' });
  if (!emp.deleted_at) return res.status(400).json({ error: 'This employee has not been removed.' });

  const clear = { deleted_at: null, deleted_by: null };

  const { data, error } = await supabase
    .from('employees').update(clear).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not restore the employee record. Please try again.' });

  let login_restored = false;
  if (emp.emp_id) {
    const { data: back, error: userErr } = await supabase
      .from('users')
      .update({ ...clear, updated_at: new Date().toISOString() })
      .eq('emp_id', emp.emp_id)
      .not('deleted_at', 'is', null)
      .select('id');
    if (userErr) {
      return res.status(500).json({
        error: 'The employee record was restored, but their login could not be re-enabled. They still cannot sign in. Please retry the restore.',
      });
    }
    login_restored = (back || []).length > 0;
  }

  res.json({
    message: login_restored
      ? `${emp.fname || 'Employee'} restored. Their login works again.`
      : `${emp.fname || 'Employee'} restored.`,
    login_restored,
    employee: data,
  });
});

module.exports = router;
