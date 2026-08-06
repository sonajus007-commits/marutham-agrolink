/**
 * Runtime permission resolution for RBAC (migration 037, backend/config/rbac.js).
 *
 * requireAuth (middleware/auth.js) calls resolveUserPermissions() on every
 * authenticated request and hangs the result on req.user.permissions, a plain
 * serialisable map:
 *
 *   { moduleKey: { actions: string[], scope: 'none'|'self'|'assigned'|'team'|
 *                                            'geo'|'all'|'employees' } }
 *
 * Routes gate with requirePermission('orders','edit'); the frontend receives the
 * same map from GET /auth/me and gates its nav/buttons identically. The two axes:
 *   • actions — what you may DO (view/create/edit/delete/approve/assign/export)
 *   • scope   — which ROWS ('geo' is still derived server-side from the signed-in
 *               user, so the client cannot widen its own reach).
 *
 * Trust flags (employees.is_hr_admin / is_board_director) are an ADDITIVE layer:
 * a flagged user gets their role's permissions UNION the HR / Board role's, so a
 * State Head who also approves HR keeps both capabilities without a second role.
 *
 * Permissions are cached in-process by role_id (the tables change rarely — only
 * via the Role & Permission Management screen, which calls invalidatePermissionCache()).
 */
const supabase = require('../db/supabase');
const { ADMIN_ROLE_TO_ROLE } = require('../config/rbac');

const TTL_MS = 60_000;

// role_id → { perms, exp }
const roleCache = new Map();
// role key → id, loaded once from rbac_roles
let keyToId = null;
let keyToIdExp = 0;

// Widening order when unioning scopes across the base role and a trust-flag role.
const SCOPE_RANK = { none: 0, self: 1, assigned: 1, team: 2, geo: 3, employees: 3, all: 4 };

function widerScope(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (SCOPE_RANK[b] ?? 0) > (SCOPE_RANK[a] ?? 0) ? b : a;
}

async function getKeyToId() {
  if (keyToId && Date.now() < keyToIdExp) return keyToId;
  const { data, error } = await supabase.from('rbac_roles').select('id, key');
  if (error) throw new Error(`RBAC role lookup failed: ${error.message}`);
  keyToId = Object.fromEntries(data.map((r) => [r.key, r.id]));
  keyToIdExp = Date.now() + TTL_MS;
  return keyToId;
}

/** Load and cache one role's { moduleKey: { actions, scope } } map. */
async function loadRolePermissions(roleId) {
  const hit = roleCache.get(roleId);
  if (hit && Date.now() < hit.exp) return hit.perms;

  const [{ data: perms, error: pErr }, { data: scopes, error: sErr }] = await Promise.all([
    supabase.from('rbac_role_permissions').select('module_key, action').eq('role_id', roleId),
    supabase.from('rbac_role_scope').select('module_key, scope').eq('role_id', roleId),
  ]);
  // Refuse rather than silently de-privilege (matches middleware/auth.js): a failed
  // read must not quietly hand a user an empty — or worse, a wrong — permission set.
  if (pErr) throw new Error(`RBAC permission read failed: ${pErr.message}`);
  if (sErr) throw new Error(`RBAC scope read failed: ${sErr.message}`);

  const map = {};
  for (const { module_key, scope } of scopes || []) {
    map[module_key] = { actions: [], scope };
  }
  for (const { module_key, action } of perms || []) {
    (map[module_key] || (map[module_key] = { actions: [], scope: 'none' })).actions.push(action);
  }
  roleCache.set(roleId, { perms: map, exp: Date.now() + TTL_MS });
  return map;
}

function mergeInto(target, src) {
  for (const [mod, { actions, scope }] of Object.entries(src)) {
    const cur = target[mod] || (target[mod] = { actions: [], scope: 'none' });
    for (const a of actions) if (!cur.actions.includes(a)) cur.actions.push(a);
    cur.scope = widerScope(cur.scope, scope);
  }
}

/**
 * Resolve the effective permission map for a user: their role's permissions,
 * unioned with the HR / Board role when the corresponding trust flag is set.
 * Returns {} for consumers/farmers (no management role_id).
 */
async function resolveUserPermissions(user) {
  const merged = {};
  if (user.role_id) mergeInto(merged, await loadRolePermissions(user.role_id));

  if (user.is_board_director || user.is_hr_admin) {
    const ids = await getKeyToId();
    if (user.is_board_director && ids.board_of_directors) {
      mergeInto(merged, await loadRolePermissions(ids.board_of_directors));
    }
    if (user.is_hr_admin && ids.hr) {
      mergeInto(merged, await loadRolePermissions(ids.hr));
    }
  }
  return merged;
}

// Composite dashboards are cross-cutting VIEWS, not single modules, so their
// audience is expressed as role-key groups (the consolidated replacement for the
// old EXECUTIVE_ROLES / OPS_*_ROLES / ADMINHEAD_ROLES admin_role arrays). Computed
// once here and shipped as flags on the user so the frontend never re-derives them
// — killing the front/back array duplication that used to drift.
const OPS_ROLE_KEYS = new Set([
  'admin',
  'state_head',
  'zonal_manager',
  'regional_manager',
  'district_manager',
  'hub_incharge',
]);
const ADMINHEAD_ROLE_KEYS = new Set(['admin', 'technical_head', 'hr']);

/** Which composite dashboards a user may open, from role + trust flags + perms. */
function dashboardsFor(user, perms, roleKey) {
  const has = (m, a) => (perms[m]?.actions || []).includes(a);
  return {
    // Board + Admin: company-wide financials. company_analytics 'export' isolates
    // exactly those two (everyone else has view-only). Board via trust flag too.
    executive: has('company_analytics', 'export') || user.is_board_director === true,
    // The operational tier (district → state) plus Admin. Geo-scoped in-handler.
    operations: OPS_ROLE_KEYS.has(roleKey),
    // Head Office control panel: Admin, Technical Head, HR (or an HR-Admin trust).
    adminhead: ADMINHEAD_ROLE_KEYS.has(roleKey) || user.is_hr_admin === true,
  };
}

/** Canonical role key for a role_id (null for consumers/farmers). */
async function roleKeyFor(roleId) {
  if (!roleId) return null;
  const ids = await getKeyToId();
  return Object.keys(ids).find((k) => ids[k] === roleId) || null;
}

/** role_id for a legacy admin_role label (null if it maps to no canonical role). */
async function roleIdForAdminRole(adminRole) {
  const key = ADMIN_ROLE_TO_ROLE[adminRole];
  if (!key) return null;
  const ids = await getKeyToId();
  return ids[key] || null;
}

/**
 * Populate the delegated trust flags (is_hr_admin / is_board_director) on a user
 * row from their linked employee record, unless already set. requireAuth does this
 * inline; the login/me responses don't run requireAuth, so their permission map
 * would otherwise miss the trust-flag grants that requireAuth enforces per request.
 * Best-effort: on a lookup error the flags stay false (the client under-shows, the
 * server still enforces correctly on the next authenticated call).
 */
async function ensureTrustFlags(user) {
  if (user.is_hr_admin !== undefined) return;
  user.is_hr_admin = false;
  user.is_board_director = false;
  if (user.role !== 'admin' || !user.emp_id) return;
  const { data: emp } = await supabase
    .from('employees')
    .select('is_hr_admin, is_board_director, approval_status')
    .eq('emp_id', user.emp_id)
    .maybeSingle();
  if (emp && emp.approval_status === 'approved') {
    user.is_hr_admin = emp.is_hr_admin === true;
    user.is_board_director = emp.is_board_director === true;
  }
}

/**
 * Resolve { role_key, permissions, dashboards, trust flags } for a freshly-loaded
 * user row. Used by the login / register / me responses (which don't run
 * requireAuth) so the client receives the SAME resolved shape — trust-flag grants
 * included — that requireAuth attaches to req.user.
 */
async function permissionPayload(user) {
  await ensureTrustFlags(user);
  const role_key = await roleKeyFor(user.role_id);
  const permissions = await resolveUserPermissions(user);
  return {
    role_key,
    permissions,
    dashboards: dashboardsFor(user, permissions, role_key),
    is_hr_admin: user.is_hr_admin === true,
    is_board_director: user.is_board_director === true,
  };
}

/** True if the user's resolved permissions grant `action` on `module`. */
function can(user, module, action) {
  const p = user && user.permissions && user.permissions[module];
  return !!p && p.actions.includes(action);
}

/** The user's data scope for a module ('none' if the module isn't granted). */
function scopeFor(user, module) {
  const p = user && user.permissions && user.permissions[module];
  return (p && p.scope) || 'none';
}

/**
 * Route guard: requirePermission('orders','edit'). Runs requireAuth first (so
 * req.user.permissions is populated), then checks the action. Import requireAuth
 * lazily to avoid a circular require with middleware/auth.js.
 */
function requirePermission(module, action) {
  const { requireAuth } = require('./auth');
  return [
    requireAuth,
    (req, res, next) => {
      if (can(req.user, module, action)) return next();
      return res.status(403).json({
        error: `Access denied. You need '${action}' permission on ${module}.`,
        required: { module, action },
      });
    },
  ];
}

function invalidatePermissionCache() {
  roleCache.clear();
  keyToId = null;
  keyToIdExp = 0;
}

module.exports = {
  resolveUserPermissions,
  loadRolePermissions,
  roleKeyFor,
  roleIdForAdminRole,
  permissionPayload,
  can,
  scopeFor,
  dashboardsFor,
  requirePermission,
  invalidatePermissionCache,
};
