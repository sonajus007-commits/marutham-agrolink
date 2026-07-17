/* Employee master formatting — ported from frontend/js/shared.js.
 * Shared by the self-profile views in the Agent and Admin roles. */
import { dateLocale } from './format';

function fmtEmpDate(d?: string | null, lang?: string | null): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(dateLocale(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
/**
 * [English label, value, i18n key] per row.
 *
 * The key is THIRD and the English label FIRST on purpose: both callers
 * destructure `[label, value]`, so the admin profile — which is not translated —
 * keeps rendering exactly what it did, while a translated screen can reach past
 * it for `t(key, label)`. Adding a field beats forking the function.
 */
export type EmployeeDetailPair = [label: string, value: string, key: string];

export function employeeDetailPairs(
  e: EmployeeRecord | null | undefined,
  /** App language for the dates. Omit and they stay en-IN, as before. */
  lang?: string | null,
): EmployeeDetailPair[] | null {
  if (!e) return null;
  const addr = [
    e.house_no,
    e.street1,
    e.street2,
    e.address_line,
    e.village_town,
    e.city,
    e.taluk,
    e.district,
    e.state,
    e.pincode,
  ]
    .filter(Boolean)
    .join(', ');
  return [
    ['Employee No', e.emp_id || '—', 'emp.no'],
    ['Role / Designation', e.designation || '—', 'emp.designation'],
    ['Department', e.department || '—', 'emp.department'],
    ['Employment Type', e.employment_type || '—', 'emp.employmentType'],
    ['Start Date', fmtEmpDate(e.date_of_joining, lang), 'emp.startDate'],
    ['Aadhaar', e.aadhar ? '•••• •••• ' + String(e.aadhar).slice(-4) : '—', 'emp.aadhaar'],
    ['Gender', e.gender || '—', 'emp.gender'],
    ['Date of Birth', e.dob ? fmtEmpDate(e.dob, lang) : '—', 'emp.dob'],
    ['Phone', e.phone || '—', 'emp.phone'],
    ['Email', e.email || '—', 'emp.email'],
    ['Work Location', e.work_location || '—', 'emp.workLocation'],
    ['Reporting Manager', e.reporting_manager || '—', 'emp.reportingManager'],
    ['Address', addr || '—', 'emp.address'],
  ];
}
