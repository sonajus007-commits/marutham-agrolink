/**
 * Role & Permission Management API — the backend for the admin screen that edits
 * the RBAC matrix live. Reads/writes the rbac_* tables (migration 037) and busts
 * the in-process permission cache so a change takes effect on the next request.
 *
 *   GET   /api/roles            the roles, modules, action/scope vocab + full matrix
 *   PATCH /api/roles/:id        replace one role's permissions + scope for a module
 *
 * Gated on the Role & Permission Management module: 'view' to read, 'edit' to write
 * (Admin holds Full Control; Board / Technical Head are view-only).
 */
const express = require('express');
const supabase = require('../db/supabase');
const { requirePermission, invalidatePermissionCache } = require('../middleware/permissions');
const { ACTIONS, SCOPES } = require('../config/rbac');

const router = express.Router();

// ── GET /roles ────────────────────────────────────────────────────────────────
router.get('/', requirePermission('role_permission_management', 'view'), async (_req, res) => {
  const [rolesR, modulesR, permsR, scopesR] = await Promise.all([
    supabase.from('rbac_roles').select('id, key, label, tier, is_system').order('tier').order('id'),
    supabase.from('rbac_modules').select('key, label, sort').order('sort'),
    supabase.from('rbac_role_permissions').select('role_id, module_key, action'),
    supabase.from('rbac_role_scope').select('role_id, module_key, scope'),
  ]);
  for (const r of [rolesR, modulesR, permsR, scopesR]) {
    if (r.error) return res.status(500).json({ error: `Could not load RBAC data: ${r.error.message}` });
  }

  // matrix[roleId][moduleKey] = { actions: [], scope }
  const matrix = {};
  for (const role of rolesR.data) matrix[role.id] = {};
  for (const { role_id, module_key, scope } of scopesR.data) {
    (matrix[role_id] || (matrix[role_id] = {}))[module_key] = { actions: [], scope };
  }
  for (const { role_id, module_key, action } of permsR.data) {
    const cell = (matrix[role_id] || (matrix[role_id] = {}))[module_key] ||
      (matrix[role_id][module_key] = { actions: [], scope: 'none' });
    cell.actions.push(action);
  }

  res.json({
    roles: rolesR.data,
    modules: modulesR.data,
    actions: ACTIONS,
    scopes: SCOPES,
    matrix,
  });
});

// ── PATCH /roles/:id ──────────────────────────────────────────────────────────
// Body: { modules: { [moduleKey]: { actions: string[], scope: string } } }
// Full replacement of the listed modules for this role. A module omitted from the
// body is left unchanged; to clear one, send it with actions:[] and scope:'none'.
router.patch('/:id', requirePermission('role_permission_management', 'edit'), async (req, res) => {
  const roleId = Number(req.params.id);
  if (!Number.isInteger(roleId)) return res.status(400).json({ error: 'Invalid role id.' });

  const mods = req.body && req.body.modules;
  if (!mods || typeof mods !== 'object') {
    return res.status(400).json({ error: 'Body must be { modules: { moduleKey: { actions, scope } } }.' });
  }

  const { data: role, error: roleErr } = await supabase
    .from('rbac_roles').select('id, key').eq('id', roleId).maybeSingle();
  if (roleErr) return res.status(500).json({ error: 'Could not load the role.' });
  if (!role) return res.status(404).json({ error: 'Role not found.' });

  // Validate every module/action/scope up front — reject the whole request rather
  // than apply a partial, unvalidated permission change.
  const { data: moduleRows, error: modErr } = await supabase.from('rbac_modules').select('key');
  if (modErr) return res.status(500).json({ error: 'Could not validate modules.' });
  const validModules = new Set(moduleRows.map((m) => m.key));

  const permRows = [];
  const scopeRows = [];
  for (const [moduleKey, spec] of Object.entries(mods)) {
    if (!validModules.has(moduleKey)) {
      return res.status(400).json({ error: `Unknown module: ${moduleKey}.` });
    }
    const actions = Array.isArray(spec.actions) ? spec.actions : [];
    for (const a of actions) {
      if (!ACTIONS.includes(a)) return res.status(400).json({ error: `Unknown action: ${a}.` });
      permRows.push({ role_id: roleId, module_key: moduleKey, action: a });
    }
    const scope = spec.scope || 'none';
    if (!SCOPES.includes(scope)) return res.status(400).json({ error: `Unknown scope: ${scope}.` });
    scopeRows.push({ role_id: roleId, module_key: moduleKey, scope });
  }

  const touchedModules = Object.keys(mods);

  // Replace this role's rows for exactly the touched modules.
  const delPerms = await supabase
    .from('rbac_role_permissions').delete().eq('role_id', roleId).in('module_key', touchedModules);
  if (delPerms.error) return res.status(500).json({ error: `Could not update permissions: ${delPerms.error.message}` });
  const delScope = await supabase
    .from('rbac_role_scope').delete().eq('role_id', roleId).in('module_key', touchedModules);
  if (delScope.error) return res.status(500).json({ error: `Could not update scope: ${delScope.error.message}` });

  if (permRows.length) {
    const insPerms = await supabase.from('rbac_role_permissions').insert(permRows);
    if (insPerms.error) return res.status(500).json({ error: `Could not save permissions: ${insPerms.error.message}` });
  }
  if (scopeRows.length) {
    const insScope = await supabase.from('rbac_role_scope').insert(scopeRows);
    if (insScope.error) return res.status(500).json({ error: `Could not save scope: ${insScope.error.message}` });
  }

  // The change is live in the DB — drop the cache so the very next request resolves
  // permissions afresh rather than serving a stale 60-second window.
  invalidatePermissionCache();

  res.json({ message: 'Permissions updated.', role_id: roleId });
});

module.exports = router;
