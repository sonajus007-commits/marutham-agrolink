/* Employee master formatting — ported from frontend/js/shared.js.
 * Shared by the self-profile views in the Agent and Admin roles. */

function fmtEmpDate(d?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export interface EmployeeRecord {
  emp_id?: string;
  designation?: string;
  department?: string;
  employment_type?: string;
  date_of_joining?: string;
  aadhar?: string | number;
  gender?: string;
  dob?: string;
  phone?: string;
  email?: string;
  work_location?: string;
  reporting_manager?: string;
  house_no?: string;
  street1?: string;
  street2?: string;
  address_line?: string;
  village_town?: string;
  city?: string;
  taluk?: string;
  district?: string;
  state?: string;
  pincode?: string;
  [key: string]: unknown;
}

/** Label/value pairs for an employee master record. Returns null if no record. */
export function employeeDetailPairs(e: EmployeeRecord | null | undefined): [string, string][] | null {
  if (!e) return null;
  const addr = [e.house_no, e.street1, e.street2, e.address_line, e.village_town, e.city, e.taluk, e.district, e.state, e.pincode]
    .filter(Boolean)
    .join(', ');
  return [
    ['Employee No', e.emp_id || '—'],
    ['Role / Designation', e.designation || '—'],
    ['Department', e.department || '—'],
    ['Employment Type', e.employment_type || '—'],
    ['Start Date', fmtEmpDate(e.date_of_joining)],
    ['Aadhaar', e.aadhar ? '•••• •••• ' + String(e.aadhar).slice(-4) : '—'],
    ['Gender', e.gender || '—'],
    ['Date of Birth', e.dob ? fmtEmpDate(e.dob) : '—'],
    ['Phone', e.phone || '—'],
    ['Email', e.email || '—'],
    ['Work Location', e.work_location || '—'],
    ['Reporting Manager', e.reporting_manager || '—'],
    ['Address', addr || '—'],
  ];
}
