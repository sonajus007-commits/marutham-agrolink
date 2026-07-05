const express = require('express');
const supabase = require('../db/supabase');
const { requireRole } = require('../middleware/auth');
const { stateCode } = require('../utils/codeGen');

const router = express.Router();

function isHeadOffice(user) {
  return user.admin_role === 'Head Office' || user.admin_role === 'State Head';
}
// Who may open the employee tracker: Head Office / State Head, plus the delegated
// trust roles (HR Admin, Board of Director) so they can approve requests.
function canAccessTracker(user) {
  return isHeadOffice(user) || user.is_hr_admin === true || user.is_board_director === true;
}
// Who may mint the trust roles themselves (Board of Director / HR Admin flags):
// only the root of trust — Head Office (bootstrap) or an existing Board of Director.
function canMintTrustRoles(user) {
  return isHeadOffice(user) || user.is_board_director === true;
}
// Who may approve/reject a pending employee request: the HR Admin (delegated),
// a Board of Director, or Head Office (safety-valve fallback).
function canApprove(user) {
  return isHeadOffice(user) || user.is_hr_admin === true || user.is_board_director === true;
}

// Columns a tracker manager may write to an employee-tracker record.
const EMPLOYEE_FIELDS = [
  'fname', 'lname', 'gender', 'dob', 'phone', 'email', 'aadhar',
  'address_line', 'house_no', 'street1', 'street2',
  'village_town', 'city', 'taluk', 'district', 'state', 'pincode',
  'designation', 'department', 'employment_type', 'date_of_joining',
  'work_location', 'work_district', 'work_state',
  'reporting_manager', 'reporting_manager_emp_id', 'is_manager',
  'status', 'notes',
];

// Next auto Employee ID: <prefix> + <2-letter state code> + 5-digit per-state
// sequence, restarting at 00001 for each prefix+state combination.
//   Permanent -> MA…  (Marutham Agrolink):  Tamil Nadu MATN00001, Karnataka MAKA00001
//   Contract  -> CE…  (Contract Employee):  Tamil Nadu CETN00001, Karnataka CEKA00001
async function nextEmpId(state, employmentType) {
  const base   = (employmentType === 'Contract') ? 'CE' : 'MA';
  const prefix = base + stateCode(state);          // e.g. MATN / CETN
  const { data } = await supabase
    .from('employees')
    .select('emp_id')
    .ilike('emp_id', prefix + '%');
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
router.get('/me', requireRole('admin'), async (req, res) => {
  const empId = req.user.emp_id;
  if (!empId) return res.json({ employee: null });
  const { data, error } = await supabase
    .from('employees').select('*').eq('emp_id', empId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ employee: data || null });
});

// ── GET /employees ────────────────────────────────────────────────────────────
// List employee-tracker records — Head Office / State Head only (HR ownership).
// Optional ?q= search and ?status= filter.
router.get('/', requireRole('admin'), async (req, res) => {
  if (!canAccessTracker(req.user)) {
    return res.status(403).json({ error: 'Head Office / HR Admin access required to view the employee tracker.' });
  }
  try {
    let q = supabase.from('employees').select('*').order('created_at', { ascending: false });
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
router.get('/lookup/:empId', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .select('id, emp_id, fname, lname, gender, phone, email, aadhar, ' +
            'village_town, city, taluk, district, state, pincode, ' +
            'designation, department, employment_type, date_of_joining, ' +
            'work_state, work_district, work_location, ' +
            'reporting_manager, reporting_manager_emp_id, status')
    .eq('emp_id', req.params.empId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Employee ID not found in the tracker.' });
  // One login per employee — flag if this Employee ID already backs a staff account
  // so the form can warn before submit.
  const { data: loginRows } = await supabase
    .from('users').select('login_id').eq('emp_id', req.params.empId).limit(1);
  const existing_login_id = (loginRows && loginRows.length) ? loginRows[0].login_id : null;
  res.json({ employee: data, existing_login_id });
});

// ── GET /employees/managers ───────────────────────────────────────────────────
// Employees flagged as Manager, for the Reporting-Manager picker. Restricted to
// the org unit the employee belongs to: same Work District + same Department.
// Both filters are required so the popup only ever shows valid reporting lines.
router.get('/managers', requireRole('admin'), async (req, res) => {
  if (!canAccessTracker(req.user)) {
    return res.status(403).json({ error: 'Head Office / HR Admin access required.' });
  }
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
    .order('fname', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  // Exclude the employee themselves (can't report to self).
  let rows = data || [];
  if (req.query.exclude) rows = rows.filter((m) => m.id !== req.query.exclude);
  res.json({ managers: rows });
});

// ── GET /employees/:id ────────────────────────────────────────────────────────
router.get('/:id', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('employees').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Employee not found.' });
  res.json({ employee: data });
});

// ── GET /employees/:id/history ────────────────────────────────────────────────
// Full change history from the DB audit trigger. Head Office / State Head only.
router.get('/:id/history', requireRole('admin'), async (req, res) => {
  if (!canAccessTracker(req.user)) return res.status(403).json({ error: 'Head Office / HR Admin access required.' });
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

const truthy = (v) => v === true || v === 'true';

// ── POST /employees ───────────────────────────────────────────────────────────
// Creates an employee. Board of Director / HR Admin records are AUTO-APPROVED
// (bootstrap) and get their Employee ID immediately. Every other employee is
// created as a PENDING request with NO Employee ID until an HR Admin approves.
router.post('/', requireRole('admin'), async (req, res) => {
  if (!canAccessTracker(req.user)) {
    return res.status(403).json({ error: 'Head Office / HR Admin access required to manage the employee tracker.' });
  }
  const rec = pickFields(req.body);
  if (!rec.fname) return res.status(400).json({ error: 'Employee first name is required.' });

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
});

// ── PATCH /employees/:id ──────────────────────────────────────────────────────
router.patch('/:id', requireRole('admin'), async (req, res) => {
  if (!canAccessTracker(req.user)) {
    return res.status(403).json({ error: 'Head Office / HR Admin access required to manage the employee tracker.' });
  }
  const updates = pickFields(req.body);

  // Employee ID is permanent once generated — never editable after creation.
  delete updates.emp_id;

  // Trust-role flags can be delegated later, but only by Head Office / a Board of Director.
  if (req.body.is_board_director !== undefined || req.body.is_hr_admin !== undefined) {
    if (!canMintTrustRoles(req.user)) {
      return res.status(403).json({ error: 'Only Head Office or a Board of Director can change the Board of Director / HR Admin flags.' });
    }
    if (req.body.is_board_director !== undefined) updates.is_board_director = truthy(req.body.is_board_director);
    if (req.body.is_hr_admin       !== undefined) updates.is_hr_admin       = truthy(req.body.is_hr_admin);
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });

  const { data, error } = await supabase
    .from('employees').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Employee updated.', employee: data });
});

// ── PATCH /employees/:id/approve ──────────────────────────────────────────────
// Approve a pending employee → issue the Employee ID and mark active. Only an
// HR Admin / Board of Director / Head Office may approve.
router.patch('/:id/approve', requireRole('admin'), async (req, res) => {
  if (!canApprove(req.user)) {
    return res.status(403).json({ error: 'HR Admin (or Board of Director / Head Office) approval authority required.' });
  }
  const { data: emp, error: e1 } = await supabase
    .from('employees').select('*').eq('id', req.params.id).single();
  if (e1 || !emp) return res.status(404).json({ error: 'Employee not found.' });
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
});

// ── PATCH /employees/:id/reject ───────────────────────────────────────────────
router.patch('/:id/reject', requireRole('admin'), async (req, res) => {
  if (!canApprove(req.user)) {
    return res.status(403).json({ error: 'HR Admin (or Board of Director / Head Office) approval authority required.' });
  }
  const { data, error } = await supabase
    .from('employees')
    .update({
      approval_status: 'rejected',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      rejected_reason: (req.body.reason || '').trim() || null,
    })
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Employee request rejected.', employee: data });
});

module.exports = router;
