const express = require('express');
const supabase = require('../db/supabase');
const { requireRole } = require('../middleware/auth');
const { stateCode } = require('../utils/codeGen');

const router = express.Router();

function isHeadOffice(user) {
  return user.admin_role === 'Head Office' || user.admin_role === 'State Head';
}

// Columns a Head Office user may write to an employee-tracker record.
const EMPLOYEE_FIELDS = [
  'fname', 'lname', 'gender', 'dob', 'phone', 'email', 'aadhar',
  'address_line', 'village_town', 'city', 'taluk', 'district', 'state', 'pincode',
  'designation', 'department', 'employment_type', 'date_of_joining',
  'work_location', 'work_district', 'work_state', 'reporting_manager',
  'status', 'notes',
];

// Next auto Employee ID: MA + <2-letter state code> + 5-digit per-state sequence.
// Marutham Agrolink + state, restarting at 00001 for each state.
//   Tamil Nadu -> MATN00001,  Karnataka -> MAKA00001
async function nextEmpId(state) {
  const prefix = 'MA' + stateCode(state);          // e.g. MATN
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

// ── GET /employees ────────────────────────────────────────────────────────────
// List employee-tracker records. Any admin may read (needed to look up an ID);
// optional ?q= search and ?status= filter.
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    let q = supabase.from('employees').select('*').order('emp_id', { ascending: true });
    if (req.query.status) q = q.eq('status', req.query.status);
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
    .select('id, emp_id, fname, lname, designation, department, employment_type, status')
    .eq('emp_id', req.params.empId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Employee ID not found in the tracker.' });
  res.json({ employee: data });
});

// ── GET /employees/:id ────────────────────────────────────────────────────────
router.get('/:id', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('employees').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Employee not found.' });
  res.json({ employee: data });
});

// ── POST /employees ───────────────────────────────────────────────────────────
router.post('/', requireRole('admin'), async (req, res) => {
  if (!isHeadOffice(req.user)) {
    return res.status(403).json({ error: 'Head Office access required to manage the employee tracker.' });
  }
  const rec = pickFields(req.body);
  if (!rec.fname) return res.status(400).json({ error: 'Employee first name is required.' });

  let empId = (req.body.emp_id || '').trim();
  if (!empId) {
    const st = rec.state || rec.work_state;
    if (!st) return res.status(400).json({ error: 'Select a State (or enter an Employee ID manually) to auto-generate the ID.' });
    empId = await nextEmpId(st);
  }

  const { data: dup } = await supabase
    .from('employees').select('id').eq('emp_id', empId).maybeSingle();
  if (dup) return res.status(409).json({ error: `Employee ID "${empId}" already exists.` });

  rec.emp_id = empId;
  const { data, error } = await supabase.from('employees').insert(rec).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ message: 'Employee added.', employee: data });
});

// ── PATCH /employees/:id ──────────────────────────────────────────────────────
router.patch('/:id', requireRole('admin'), async (req, res) => {
  if (!isHeadOffice(req.user)) {
    return res.status(403).json({ error: 'Head Office access required to manage the employee tracker.' });
  }
  const updates = pickFields(req.body);

  // Allow renaming the Employee ID, but keep it unique.
  if (req.body.emp_id !== undefined) {
    const empId = (req.body.emp_id || '').trim();
    if (!empId) return res.status(400).json({ error: 'Employee ID cannot be blank.' });
    const { data: dup } = await supabase
      .from('employees').select('id').eq('emp_id', empId).neq('id', req.params.id).maybeSingle();
    if (dup) return res.status(409).json({ error: `Employee ID "${empId}" already exists.` });
    updates.emp_id = empId;
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });

  const { data, error } = await supabase
    .from('employees').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Employee updated.', employee: data });
});

module.exports = router;
