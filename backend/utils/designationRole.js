// Employee-master designation → staff login role (admin_role).
//
// Single source of truth, shared by the create-staff-login flow (routes/auth.js,
// which derives the login role from the designation at creation) and the employee
// edit flow (routes/employees.js, which keeps a linked login's role in sync when the
// designation changes). This is a BACKEND-only map — the admin UI's employeeOptions
// maps a designation to its career BAND (L0–L12), which is a separate HR concern, not
// a login role, so there is no parallel login-role map to drift against.
//
// Designations that have a distinct login role map to it (e.g. "Collection
// Officer(VCO)" → "VCO"); management/org titles with no distinct login role are not
// keys here.
const DESIGNATION_TO_ROLE = {
  'Collection Officer(VCO)': 'VCO',
  'VCO':                     'VCO',
  // Operations-department field titles from the designation catalog: a Field
  // Associate is the village collection officer (VCO); a Delivery Associate is a
  // Delivery Agent. Without these, deriving the login role fell through to the raw
  // title, which no role may create → a 403 on every field-staff login.
  'Field Associate':         'VCO',
  'Delivery Associate':      'Delivery Agent',
  'Delivery Agent':          'Delivery Agent',
  'Hub Incharge':            'Hub Incharge',
  'District Manager':        'District Manager',
  'Regional Manager':        'Regional Manager',
  'State Head':              'State Head',
};

// Resolve a designation to a login role ONLY when it maps to a distinct one; returns
// null for org/management titles that carry no login role. Callers decide the
// fallback: the create flow (an authorized creator explicitly choosing a role) falls
// back to the raw designation, while the edit flow SKIPS the login-role change rather
// than turn an arbitrary title into a privileged login role.
function loginRoleForDesignation(designation) {
  return DESIGNATION_TO_ROLE[designation] || null;
}

module.exports = { DESIGNATION_TO_ROLE, loginRoleForDesignation };
