/* Employee master formatting — ported from frontend/js/shared.js.
 * Shared by the self-profile views in the Agent and Admin roles. */
import { dateLocale, type AddressObject } from './format';

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
  country?: string;
  [key: string]: unknown;
}

/**
 * The employee master's address as a structured AddressObject, so a staff
 * profile can render it through the SAME address block every other role uses
 * (read-only — HR owns it). The master keeps a single `address_line` rather than
 * split street lines, so it maps onto `street1`; country defaults to India.
 */
export function employeeAddressObject(e: EmployeeRecord | null | undefined): AddressObject {
  if (!e) return {};
  return {
    house_no: e.house_no ?? null,
    street1: e.street1 ?? e.address_line ?? null,
    street2: e.street2 ?? null,
    village_town: e.village_town ?? null,
    city: e.city ?? null,
    taluk: e.taluk ?? null,
    district: e.district ?? null,
    state: e.state ?? null,
    country: e.country ?? 'India',
    pincode: e.pincode ?? null,
  };
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
  /** Drop the squashed one-line Address row — callers that render the address as
   *  a structured block (the staff profiles) pass true so it is not shown twice. */
  opts?: { excludeAddress?: boolean },
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
  const pairs: EmployeeDetailPair[] = [
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
  ];
  if (!opts?.excludeAddress) pairs.push(['Address', addr || '—', 'emp.address']);
  return pairs;
}
