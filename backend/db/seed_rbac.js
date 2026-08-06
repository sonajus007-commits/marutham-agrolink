/**
 * Seed the RBAC tables from backend/config/rbac.js, then backfill users.role_id
 * from the legacy admin_role using the approved consolidation map.
 *
 * Idempotent: re-running fully replaces the permission/scope rows so the DB
 * always matches config/rbac.js. Run after migration 037:
 *
 *   node backend/db/seed_rbac.js
 *
 * Roles and modules are UPSERTED by key (never dropped — a role's id is referenced
 * by users.role_id). The role_permissions / role_scope rows are wiped and
 * rewritten each run, which is safe because config/rbac.js is the source of truth
 * for the SEED; runtime edits from the management screen live in the DB and should
 * be re-expressed in config before re-seeding (documented in config/rbac.js).
 */
require('dotenv').config();
const supabase = require('./supabase');
const { ROLES, MODULES, resolveMatrix, ADMIN_ROLE_TO_ROLE } = require('../config/rbac');

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(`FAIL  ${label}: ${error.message}`);
    process.exit(1);
  }
  return data;
}

async function seed() {
  console.log('\nSeeding RBAC roles, modules and the permission matrix');
  console.log('─'.repeat(70));

  // 1) Roles — upsert by key so existing ids (referenced by users.role_id) survive.
  await must(
    'upsert roles',
    supabase
      .from('rbac_roles')
      .upsert(
        ROLES.map((r) => ({ key: r.key, label: r.label, tier: r.tier, is_system: true })),
        { onConflict: 'key' }
      )
  );

  // 2) Modules — upsert by key.
  await must(
    'upsert modules',
    supabase
      .from('rbac_modules')
      .upsert(
        MODULES.map((m) => ({ key: m.key, label: m.label, sort: m.sort })),
        { onConflict: 'key' }
      )
  );

  // Read back role ids to translate roleKey → role_id.
  const roleRows = await must('read role ids', supabase.from('rbac_roles').select('id, key'));
  const roleId = Object.fromEntries(roleRows.map((r) => [r.key, r.id]));

  // 3) Permissions + scope — full replace from the resolved matrix.
  await must(
    'clear role_permissions',
    supabase.from('rbac_role_permissions').delete().gte('role_id', 0)
  );
  await must('clear role_scope', supabase.from('rbac_role_scope').delete().gte('role_id', 0));

  const matrix = resolveMatrix();
  const permRows = [];
  const scopeRows = [];
  for (const { roleKey, moduleKey, actions, scope } of matrix) {
    scopeRows.push({ role_id: roleId[roleKey], module_key: moduleKey, scope });
    for (const action of actions) {
      permRows.push({ role_id: roleId[roleKey], module_key: moduleKey, action });
    }
  }

  await must('insert role_scope', supabase.from('rbac_role_scope').insert(scopeRows));
  // Chunk the permission insert — 341 modules × up to 7 actions can exceed the
  // default row cap on a single insert on some Postgres/PostgREST configs.
  for (let i = 0; i < permRows.length; i += 500) {
    await must(`insert role_permissions [${i}]`, supabase.from('rbac_role_permissions').insert(permRows.slice(i, i + 500)));
  }

  console.log(`OK    ${ROLES.length} roles, ${MODULES.length} modules`);
  console.log(`OK    ${scopeRows.length} scope rows, ${permRows.length} permission rows`);

  // 4) Backfill users.role_id from the legacy admin_role.
  console.log('─'.repeat(70));
  console.log('Backfilling users.role_id from admin_role');

  const admins = await must(
    'read admin users',
    supabase
      .from('users')
      .select('id, admin_role, role_id, login_id')
      .eq('role', 'admin')
      .is('deleted_at', null)
  );

  let updated = 0;
  const unmapped = new Set();
  for (const u of admins) {
    const target = ADMIN_ROLE_TO_ROLE[u.admin_role];
    if (!target) {
      unmapped.add(u.admin_role || '(null)');
      continue;
    }
    const wantId = roleId[target];
    if (u.role_id === wantId) continue; // already correct
    await must(
      `set role_id for ${u.login_id}`,
      supabase.from('users').update({ role_id: wantId }).eq('id', u.id)
    );
    updated++;
  }

  console.log(`OK    ${admins.length} admin users scanned, ${updated} updated`);
  if (unmapped.size) {
    console.warn(`WARN  ${unmapped.size} unmapped admin_role value(s) — left with NULL role_id:`);
    for (const v of unmapped) console.warn(`        • ${v}`);
  }
  console.log('─'.repeat(70));
  console.log('Done.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
