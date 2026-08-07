/**
 * Canonical Role-Based Access Control model — the SINGLE SOURCE OF TRUTH.
 *
 * This file defines the roles, the modules, and the full permission matrix. The
 * seed script (seed_rbac.js) writes this into the rbac_* tables; from then on the
 * DATABASE is authoritative and the "Role & Permission Management" screen edits it
 * live. This file is what a fresh database is seeded FROM, and what tests assert
 * against — change a cell here and re-seed, never hand-edit the tables in prod.
 *
 * Two axes (a deliberate design decision — see the RBAC design conversation):
 *   1. ACTION  — what a role may DO in a module: view/create/edit/delete/approve/
 *                assign/export. Stored one row per granted action.
 *   2. SCOPE   — which ROWS the role may touch: self / team / assigned / geo / all
 *                (+ the special 'employees' scope for HR user management). The
 *                geographic scope ('geo') is still derived server-side from the
 *                signed-in user exactly as before — a District Manager sees their
 *                district — so the client can never widen its own reach.
 *
 * The matrix cells use human words (Manage, Self, Team, Assigned, Support,
 * Resolve, Escalation, Initiate, Update, Send, Receive, Full, ✅/❌). expandCell()
 * turns each into { actions, scope }. That keeps the matrix below readable and
 * one-to-one with the business spec it was transcribed from.
 */

// ---- Roles (canonical set of 11) -------------------------------------------
// tier is a coarse ordering for display and for "team" scope resolution (a
// manager's team = lower-tier staff under them). Lower number = higher authority.
const ROLES = [
  { key: 'board_of_directors', label: 'Board of Directors', tier: 0, defaultScope: 'all' },
  { key: 'admin', label: 'Admin', tier: 0, defaultScope: 'all' },
  { key: 'technical_head', label: 'Technical Head', tier: 1, defaultScope: 'all' },
  { key: 'hr', label: 'HR', tier: 1, defaultScope: 'all' },
  { key: 'state_head', label: 'State Head', tier: 2, defaultScope: 'geo' },
  { key: 'zonal_manager', label: 'Zonal Manager', tier: 3, defaultScope: 'geo' },
  { key: 'regional_manager', label: 'Regional Manager', tier: 4, defaultScope: 'geo' },
  { key: 'district_manager', label: 'District Manager', tier: 5, defaultScope: 'geo' },
  { key: 'hub_incharge', label: 'Hub Incharge', tier: 6, defaultScope: 'geo' },
  { key: 'vco', label: 'VCO', tier: 7, defaultScope: 'geo' },
  { key: 'delivery_agent', label: 'Delivery Agent', tier: 8, defaultScope: 'assigned' },
];

const ROLE_KEYS = ROLES.map((r) => r.key);

// ---- Modules (31) ----------------------------------------------------------
// key is the stable slug used in code (requirePermission('orders','edit')). label
// is the display name. sort drives the management-screen ordering.
const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'company_analytics', label: 'Company Analytics' },
  { key: 'financial_reports', label: 'Financial Reports' },
  { key: 'sales_reports', label: 'Sales Reports' },
  { key: 'profit_loss', label: 'Profit & Loss' },
  { key: 'user_management', label: 'User Management' },
  { key: 'role_permission_management', label: 'Role & Permission Management' },
  { key: 'farmer_management', label: 'Farmer Management' },
  { key: 'seller_management', label: 'Seller Management' },
  { key: 'consumer_management', label: 'Consumer Management' },
  { key: 'product_approval', label: 'Product Approval' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'warehouse_hub', label: 'Warehouse / Hub' },
  { key: 'hub_management', label: 'Hub Network Management' },
  { key: 'orders', label: 'Orders' },
  { key: 'delivery_assignment', label: 'Delivery Assignment' },
  { key: 'delivery_tracking', label: 'Delivery Tracking' },
  { key: 'returns_refunds', label: 'Returns & Refunds' },
  { key: 'payments', label: 'Payments' },
  { key: 'settlement_sellers', label: 'Settlement to Sellers' },
  { key: 'employee_management', label: 'Employee Management' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'leave_management', label: 'Leave Management' },
  { key: 'recruitment', label: 'Recruitment' },
  { key: 'customer_complaints', label: 'Customer Complaints' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'reports_export', label: 'Reports Export' },
  { key: 'audit_logs', label: 'Audit Logs' },
  { key: 'system_configuration', label: 'System Configuration' },
  { key: 'api_integrations', label: 'API & Integrations' },
  { key: 'backup_security', label: 'Backup & Security' },
].map((m, i) => ({ ...m, sort: i }));

const MODULE_KEYS = MODULES.map((m) => m.key);

// ---- Actions ---------------------------------------------------------------
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'export'];
const SCOPES = ['none', 'self', 'assigned', 'team', 'geo', 'all', 'employees'];

// ---- Cell vocabulary → { actions } -----------------------------------------
// A cell is a token, optionally suffixed with '@scope' to override the role's
// default scope (e.g. HR user_management = 'manage@employees'). Tokens that are
// inherently scoped (self/team/assigned) also set the scope; anything else falls
// back to the role's defaultScope.
const TOKEN_ACTIONS = {
  none: [],
  view: ['view'],
  create: ['view', 'create'],
  edit: ['view', 'edit'],
  createedit: ['view', 'create', 'edit'],
  approve: ['view', 'approve'],
  assign: ['view', 'assign'],
  manage: ['view', 'create', 'edit', 'delete', 'assign'],
  full: ['view', 'create', 'edit', 'delete', 'approve', 'assign', 'export'],
  update: ['view', 'edit'], // status update
  initiate: ['view', 'create'], // e.g. raise a return
  resolve: ['view', 'edit', 'approve'], // can close a complaint
  escalation: ['view', 'edit'], // forward/escalate, cannot close
  support: ['view', 'edit'], // consumer support: respond, no delete
  send: ['view', 'create'], // dispatch a notification
  receive: ['view'], // notifications: read-only
  self: ['view', 'edit'], // own record
  selfview: ['view'],
  team: ['view', 'approve'], // manage the team's records (approve leave/attendance)
  assigned: ['view', 'edit'], // act only on rows assigned to you (delivery agent)
};

// Tokens that dictate their own scope regardless of the role default.
const TOKEN_SCOPE = {
  self: 'self',
  selfview: 'self',
  team: 'team',
  assigned: 'assigned',
};

/** Expand a matrix cell into { actions: string[], scope: string }. */
function expandCell(cell, roleDefaultScope) {
  if (cell == null) return { actions: [], scope: 'none' };
  const [token, scopeOverride] = String(cell).split('@');
  const actions = TOKEN_ACTIONS[token];
  if (!actions) throw new Error(`Unknown RBAC cell token: "${cell}"`);
  const scope = scopeOverride || TOKEN_SCOPE[token] || (actions.length ? roleDefaultScope : 'none');
  return { actions: [...actions], scope };
}

// ---- The permission matrix -------------------------------------------------
// MATRIX[moduleKey][roleKey] = cell token. Transcribed directly from the RBAC
// spec grid. State Head (state_head) = Zonal Manager's row PLUS an extra approval
// on Settlement to Sellers ("approval authority for state-level operations"),
// still below Admin (no System Configuration). Missing role in a row = 'none'.
//
// Column legend: bod=Board, adm=Admin, th=Technical Head, hr=HR, sh=State Head,
// zm=Zonal, rm=Regional, dm=District, hub=Hub Incharge, vco=VCO, da=Delivery Agent.
const MATRIX = {
  dashboard:                  { bod:'view', adm:'view', th:'view', hr:'view', sh:'view', zm:'view', rm:'view', dm:'view', hub:'view', vco:'view', da:'view' },
  company_analytics:          { bod:'full', adm:'full', th:'view', hr:'view', sh:'view', zm:'view', rm:'view', dm:'view', hub:'view', vco:'view', da:'none' },
  financial_reports:          { bod:'full', adm:'full', th:'none', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'view', vco:'view', da:'none' },
  sales_reports:              { bod:'full', adm:'full', th:'view', hr:'none', sh:'full', zm:'full', rm:'full', dm:'full', hub:'view', vco:'view', da:'none' },
  profit_loss:                { bod:'full', adm:'full', th:'none', hr:'none', sh:'full', zm:'full', rm:'view', dm:'view', hub:'view', vco:'none', da:'none' },
  user_management:            { bod:'view', adm:'full', th:'view', hr:'manage@employees', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'none' },
  role_permission_management: { bod:'view', adm:'full', th:'view', hr:'none', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'none' },
  farmer_management:          { bod:'view', adm:'full', th:'view', hr:'none', sh:'manage', zm:'manage', rm:'manage', dm:'manage', hub:'manage', vco:'createedit', da:'view' },
  seller_management:          { bod:'view', adm:'full', th:'view', hr:'none', sh:'manage', zm:'manage', rm:'manage', dm:'manage', hub:'manage', vco:'createedit', da:'none' },
  consumer_management:        { bod:'view', adm:'full', th:'view', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'view', vco:'support', da:'none' },
  product_approval:           { bod:'view', adm:'full', th:'none', hr:'none', sh:'approve', zm:'approve', rm:'approve', dm:'approve', hub:'approve', vco:'create', da:'none' },
  inventory:                  { bod:'view', adm:'full', th:'none', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'manage', vco:'view', da:'view' },
  warehouse_hub:              { bod:'view', adm:'full', th:'none', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'full', vco:'none', da:'view' },
  hub_management:             { bod:'view', adm:'full', th:'none', hr:'none', sh:'manage', zm:'manage', rm:'manage', dm:'manage', hub:'view', vco:'none', da:'none' },
  orders:                     { bod:'view', adm:'full', th:'none', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'manage', vco:'create', da:'assigned' },
  delivery_assignment:        { bod:'view', adm:'full', th:'none', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'manage', vco:'none', da:'assigned' },
  delivery_tracking:          { bod:'view', adm:'full', th:'none', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'manage', vco:'view', da:'update' },
  returns_refunds:            { bod:'view', adm:'full', th:'none', hr:'none', sh:'approve', zm:'approve', rm:'approve', dm:'approve', hub:'approve', vco:'initiate', da:'update' },
  payments:                   { bod:'view', adm:'full', th:'none', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'view', vco:'view', da:'none' },
  settlement_sellers:         { bod:'view', adm:'full', th:'none', hr:'none', sh:'approve', zm:'view', rm:'view', dm:'view', hub:'view', vco:'none', da:'none' },
  employee_management:        { bod:'view', adm:'view', th:'none', hr:'full', sh:'view', zm:'view', rm:'view', dm:'view', hub:'view', vco:'none', da:'self' },
  attendance:                 { bod:'view', adm:'view', th:'none', hr:'full', sh:'team', zm:'team', rm:'team', dm:'team', hub:'team', vco:'self', da:'self' },
  payroll:                    { bod:'view', adm:'view', th:'none', hr:'full', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'self' },
  leave_management:           { bod:'view', adm:'view', th:'none', hr:'full', sh:'team', zm:'team', rm:'team', dm:'team', hub:'team', vco:'self', da:'self' },
  recruitment:                { bod:'view', adm:'view', th:'none', hr:'full', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'none' },
  customer_complaints:        { bod:'view', adm:'full', th:'none', hr:'none', sh:'escalation', zm:'escalation', rm:'escalation', dm:'escalation', hub:'resolve', vco:'resolve', da:'assigned' },
  notifications:              { bod:'view', adm:'full', th:'none', hr:'none', sh:'send', zm:'send', rm:'send', dm:'send', hub:'send', vco:'send', da:'receive' },
  reports_export:             { bod:'view', adm:'full', th:'view', hr:'none', sh:'view', zm:'view', rm:'view', dm:'view', hub:'view', vco:'none', da:'none' },
  audit_logs:                 { bod:'view', adm:'full', th:'view', hr:'none', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'none' },
  system_configuration:       { bod:'view', adm:'full', th:'full', hr:'none', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'none' },
  api_integrations:           { bod:'none', adm:'view', th:'full', hr:'none', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'none' },
  backup_security:            { bod:'none', adm:'view', th:'full', hr:'none', sh:'none', zm:'none', rm:'none', dm:'none', hub:'none', vco:'none', da:'none' },
};

// Short column keys used in MATRIX above → canonical role keys.
const COL_TO_ROLE = {
  bod: 'board_of_directors',
  adm: 'admin',
  th: 'technical_head',
  hr: 'hr',
  sh: 'state_head',
  zm: 'zonal_manager',
  rm: 'regional_manager',
  dm: 'district_manager',
  hub: 'hub_incharge',
  vco: 'vco',
  da: 'delivery_agent',
};

/**
 * Resolve the full matrix into a flat, storable form:
 *   [{ roleKey, moduleKey, actions: string[], scope }]
 * One entry per (role, module). Used by the seed and by tests.
 */
function resolveMatrix() {
  const roleDefault = Object.fromEntries(ROLES.map((r) => [r.key, r.defaultScope]));
  const rows = [];
  for (const mod of MODULES) {
    const row = MATRIX[mod.key];
    if (!row) throw new Error(`MATRIX missing module: ${mod.key}`);
    for (const [col, roleKey] of Object.entries(COL_TO_ROLE)) {
      const { actions, scope } = expandCell(row[col], roleDefault[roleKey]);
      rows.push({ roleKey, moduleKey: mod.key, actions, scope });
    }
  }
  return rows;
}

// ---- Migration map: legacy admin_role string → new role key ----------------
// Consolidation approved in the RBAC design conversation. Anything not listed
// (a genuinely unknown admin_role) is left unmapped and reported by the backfill.
const ADMIN_ROLE_TO_ROLE = {
  'Head Office': 'admin',
  'Board of Director': 'board_of_directors',
  CEO: 'board_of_directors',
  'Managing Director': 'board_of_directors',
  CFO: 'board_of_directors',
  CTO: 'technical_head',
  'Technical Admin': 'technical_head',
  'HR Admin': 'hr',
  'HR Manager': 'hr',
  'State Head': 'state_head',
  'Zonal Manager': 'zonal_manager',
  'Regional Manager': 'regional_manager',
  'District Manager': 'district_manager',
  'Hub Incharge': 'hub_incharge',
  VCO: 'vco',
  'Delivery Agent': 'delivery_agent',
};

module.exports = {
  ROLES,
  ROLE_KEYS,
  MODULES,
  MODULE_KEYS,
  ACTIONS,
  SCOPES,
  MATRIX,
  COL_TO_ROLE,
  expandCell,
  resolveMatrix,
  ADMIN_ROLE_TO_ROLE,
};
