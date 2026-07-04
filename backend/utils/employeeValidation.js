const supabase = require('../db/supabase');

// Validate the employment fields for a staff (admin) account.
//   Permanent -> emp_id required AND must match an ACTIVE row in employees.
//   Contract  -> emp_id optional (free text, not verified).
// Returns { ok:true, employment_type, emp_id } or { ok:false, error }.
async function validateStaffEmployment({ employment_type, emp_id }) {
  const type = employment_type || null;
  const id = (emp_id || '').trim() || null;

  if (type && !['Permanent', 'Contract'].includes(type)) {
    return { ok: false, error: "employment_type must be 'Permanent' or 'Contract'." };
  }
  if (type === 'Permanent') {
    if (!id) return { ok: false, error: 'Employee ID is required for Permanent staff.' };
    const { data, error } = await supabase
      .from('employees')
      .select('id, emp_id, status, approval_status')
      .eq('emp_id', id)
      .maybeSingle();
    if (error) return { ok: false, error: 'Could not verify Employee ID against the employee tracker.' };
    if (!data) return { ok: false, error: `Employee ID "${id}" is not in the employee tracker. Add the employee first, or mark this account as Contract.` };
    if (data.approval_status !== 'approved') return { ok: false, error: `Employee "${id}" is not yet approved by HR. A login can only be created after the employee is approved.` };
    if (data.status !== 'active') return { ok: false, error: `Employee ID "${id}" is marked ${data.status} in the employee tracker.` };
  }
  return { ok: true, employment_type: type, emp_id: id };
}

module.exports = { validateStaffEmployment };
