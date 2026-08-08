/* Option lists for the employee form.
 *
 * The employee record carries THREE org dimensions: department, designation and
 * career band (L0–L12). The career band is an HR classification separate from
 * RBAC — a promotion never grants system access. HR picks Department →
 * Designation, and the band AUTO-FILLS from the catalog below (but stays
 * editable for exceptions).
 *
 * Generic ladder names double as the band labels, and there are NO title→band
 * collisions across departments (Manager = L6 everywhere, Associate = L10
 * everywhere, …), so a single flat title→band map (DESIGNATION_BAND) works for
 * auto-fill while DESIGNATION_CATALOG drives the department-filtered dropdown.
 */

export type BandCode =
  'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9' | 'L10' | 'L11' | 'L12';

/** The 13-band scale, L0 = top of the org. The label is the generic ladder name. */
export const BANDS: readonly { code: BandCode; label: string }[] = [
  { code: 'L0', label: 'Board of Directors' },
  { code: 'L1', label: 'CEO' },
  { code: 'L2', label: 'CXO' },
  { code: 'L3', label: 'Vice President' },
  { code: 'L4', label: 'General Manager' },
  { code: 'L5', label: 'Senior Manager' },
  { code: 'L6', label: 'Manager' },
  { code: 'L7', label: 'Assistant Manager' },
  { code: 'L8', label: 'Senior Executive' },
  { code: 'L9', label: 'Executive' },
  { code: 'L10', label: 'Associate' },
  { code: 'L11', label: 'Graduate Engineer Trainee / Trainee' },
  { code: 'L12', label: 'Intern' },
] as const;

export const BAND_LABEL: Record<string, string> = Object.fromEntries(
  BANDS.map((b) => [b.code, b.label]),
);

/** Departments (the spec org units). Legacy DB values not in this list are still
 *  tolerated by the form, which injects the current value as an extra option. */
export const EMP_DEPARTMENTS = [
  'Governance',
  'Executive Leadership',
  'Technology',
  'Operations',
  'Human Resources',
  'Finance & Accounts',
  'Sales & Business Development',
  'Supply Chain & Procurement',
  'Customer Support',
  'Quality & Food Safety',
  'Marketing',
] as const;

type Cat = { title: string; band: BandCode };

/** Per-department designation ladder. Picking a title auto-fills its band. */
export const DESIGNATION_CATALOG: Record<string, readonly Cat[]> = {
  Governance: [
    { title: 'Chairman', band: 'L0' },
    { title: 'Managing Director', band: 'L0' },
    { title: 'Director', band: 'L0' },
  ],
  'Executive Leadership': [
    { title: 'CEO', band: 'L1' },
    { title: 'COO', band: 'L2' },
    { title: 'CTO', band: 'L2' },
    { title: 'CFO', band: 'L2' },
    { title: 'CHRO', band: 'L2' },
  ],
  Technology: [
    { title: 'Intern', band: 'L12' },
    { title: 'Graduate Engineer Trainee', band: 'L11' },
    { title: 'Associate Consultant', band: 'L10' },
    { title: 'Consultant', band: 'L9' },
    { title: 'Senior Consultant', band: 'L8' },
    { title: 'Technical Lead', band: 'L7' },
    { title: 'Technical Architect', band: 'L6' },
    { title: 'Manager', band: 'L6' },
    { title: 'Senior Manager', band: 'L5' },
    { title: 'General Manager', band: 'L4' },
  ],
  Operations: [
    { title: 'Delivery Associate', band: 'L10' },
    { title: 'Field Associate', band: 'L10' },
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Senior Executive', band: 'L8' },
    { title: 'Assistant Manager', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Senior Manager', band: 'L5' },
    { title: 'General Manager', band: 'L4' },
    { title: 'COO', band: 'L2' },
  ],
  'Human Resources': [
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Senior Executive', band: 'L8' },
    { title: 'Assistant Manager', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Senior Manager', band: 'L5' },
    { title: 'CHRO', band: 'L2' },
  ],
  'Finance & Accounts': [
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Senior Executive', band: 'L8' },
    { title: 'Assistant Manager', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Senior Manager', band: 'L5' },
    { title: 'CFO', band: 'L2' },
  ],
  'Sales & Business Development': [
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Senior Executive', band: 'L8' },
    { title: 'Assistant Manager', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Senior Manager', band: 'L5' },
    { title: 'General Manager', band: 'L4' },
    { title: 'Chief Business Officer', band: 'L2' },
  ],
  'Supply Chain & Procurement': [
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Senior Executive', band: 'L8' },
    { title: 'Assistant Manager', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Senior Manager', band: 'L5' },
    { title: 'General Manager', band: 'L4' },
  ],
  'Customer Support': [
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Senior Executive', band: 'L8' },
    { title: 'Team Lead', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Head of Customer Success', band: 'L3' },
  ],
  'Quality & Food Safety': [
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Assistant Manager', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Head – Quality', band: 'L3' },
  ],
  Marketing: [
    { title: 'Associate', band: 'L10' },
    { title: 'Executive', band: 'L9' },
    { title: 'Assistant Manager', band: 'L7' },
    { title: 'Manager', band: 'L6' },
    { title: 'Senior Manager', band: 'L5' },
    { title: 'Marketing Head', band: 'L3' },
  ],
};

/** Bands for legacy designations that predate the catalog. Keeps auto-fill
 *  working when HR edits an old record whose title isn't in a ladder above. */
const LEGACY_DESIGNATION_BAND: Record<string, BandCode> = {
  'Board of Director': 'L0',
  'Managing Director': 'L0',
  CEO: 'L1',
  CFO: 'L2',
  CTO: 'L2',
  'Technical Admin': 'L4',
  'State Head': 'L4',
  'Zonal Manager': 'L5',
  'Regional Manager': 'L6',
  'District Manager': 'L7',
  'HR Manager': 'L6',
  'HR Admin': 'L6',
  'Hub Incharge': 'L9',
  'Collection Officer(VCO)': 'L10',
  VCO: 'L10',
  'Delivery Agent': 'L10',
};

/** Flat title → band, merged from every ladder plus the legacy titles. Because
 *  no title maps to two bands, this resolves a band for any known designation. */
export const DESIGNATION_BAND: Record<string, BandCode> = (() => {
  const map: Record<string, BandCode> = { ...LEGACY_DESIGNATION_BAND };
  for (const list of Object.values(DESIGNATION_CATALOG)) {
    for (const { title, band } of list) map[title] = band;
  }
  return map;
})();

/** The designation options for a department (empty for an unknown/legacy dept). */
export function designationsForDepartment(department: string): readonly Cat[] {
  return DESIGNATION_CATALOG[department] || [];
}

/** Band for a designation, if known — used to auto-fill the band field. */
export function bandForDesignation(designation: string): BandCode | '' {
  return DESIGNATION_BAND[designation] || '';
}

/** Flat, de-duplicated list of every catalog + legacy designation (search/back-compat). */
export const EMP_DESIGNATIONS = Array.from(
  new Set([
    ...Object.values(DESIGNATION_CATALOG).flatMap((l) => l.map((c) => c.title)),
    ...Object.keys(LEGACY_DESIGNATION_BAND),
  ]),
).sort((a, b) => a.localeCompare(b));

export const EMP_GENDERS = ['Male', 'Female', 'Transgender'] as const;

export const EMP_EMPLOYMENT_TYPES = ['Permanent', 'Contract'] as const;

export const EMP_STATUSES = ['active', 'inactive'] as const;
