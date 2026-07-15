/* Fixed option lists for the employee form — ported verbatim from the legacy
 * admin (EMP_DESIGNATIONS / EMP_DEPARTMENTS) so IDs and org units stay aligned. */

export const EMP_DESIGNATIONS = [
  'Board of Director',
  'CEO',
  'Managing Director',
  'CFO',
  'CTO',
  'Technical Admin',
  'HR Admin',
  'HR Manager',
  'Collection Officer(VCO)',
  'Delivery Agent',
  'Hub Incharge',
  'District Manager',
  'Regional Manager',
  'Zonal Manager',
  'State Head',
] as const;

export const EMP_DEPARTMENTS = [
  'Board of Director',
  'HR & Admin',
  'Operations',
  'Logistics',
  'Finance',
  'Management',
] as const;

export const EMP_GENDERS = ['Male', 'Female', 'Transgender'] as const;

export const EMP_EMPLOYMENT_TYPES = ['Permanent', 'Contract'] as const;

export const EMP_STATUSES = ['active', 'inactive'] as const;
