-- 037 — Role-Based Access Control (RBAC) with hierarchical permissions.
--
-- Until now authorization was coarse and code-defined: users.role was only
-- consumer/farmer/admin, every management staffer was role='admin' distinguished
-- by a free-text admin_role string, and the ONLY backend gate on most endpoints
-- was requireRole('admin'). Finer access was decided by hand-curated role arrays
-- duplicated across the frontend and backend (EXECUTIVE_ROLES, OPS_*_ROLES,
-- ADMINHEAD_ROLES, isHeadOffice, HUB_STAFF_ROLES, AUDIT_ADMIN_ROLES) that had to
-- be kept in sync by hand — the code comments repeatedly warned about the drift.
--
-- This migration introduces a data-driven permission model that both apps read:
--   rbac_roles             the canonical 11 roles
--   rbac_modules           the 31 feature modules
--   rbac_role_permissions  one row per (role, module, granted ACTION)
--   rbac_role_scope        one row per (role, module) → data SCOPE
--   users.role_id          FK from a user to their role
--
-- The TABLES are authoritative at runtime (the "Role & Permission Management"
-- screen edits them live). They are SEEDED from backend/config/rbac.js by
-- backend/db/seed_rbac.js, which also backfills users.role_id from the legacy
-- admin_role via the approved consolidation map. This file only creates the
-- shape — seeding is a separate, re-runnable step, exactly like seed_roles /
-- seed_products, so a rebuilt schema (db:verify-rebuild) starts empty and is
-- populated by the seeder.
--
-- Two axes, by design:
--   ACTION — what you may DO: view/create/edit/delete/approve/assign/export.
--   SCOPE  — which ROWS you may touch: self/assigned/team/geo/all/employees.
-- The geographic scope ('geo') is still derived server-side from the signed-in
-- user (a District Manager sees their district); the client never passes it.

create table if not exists rbac_roles (
  id          serial primary key,
  key         text not null unique,
  label       text not null,
  tier        smallint not null default 5,   -- 0 = highest authority; orders display + team scope
  is_system   boolean not null default true, -- seeded roles cannot be deleted by the UI
  created_at  timestamptz not null default now()
);

create table if not exists rbac_modules (
  key    text primary key,
  label  text not null,
  sort   smallint not null default 0
);

-- One row per granted action. Presence = granted; absence = denied. "Full
-- Control" is simply all seven action rows; "Manage" is view+create+edit+delete+
-- assign. Modelling it as rows (not a bitmask/enum ladder) keeps the management
-- screen a plain set of checkboxes and keeps requirePermission a single lookup.
create table if not exists rbac_role_permissions (
  role_id     integer not null references rbac_roles(id) on delete cascade,
  module_key  text    not null references rbac_modules(key) on delete cascade,
  action      text    not null check (action in
                ('view','create','edit','delete','approve','assign','export')),
  primary key (role_id, module_key, action)
);

-- The second axis: the row-scope a role has within a module. Exactly one per
-- (role, module). 'geo' means "resolve from the signed-in user server-side"
-- (district/region/state), which is the pre-existing behaviour this preserves.
create table if not exists rbac_role_scope (
  role_id     integer not null references rbac_roles(id) on delete cascade,
  module_key  text    not null references rbac_modules(key) on delete cascade,
  scope       text    not null default 'none' check (scope in
                ('none','self','assigned','team','geo','all','employees')),
  primary key (role_id, module_key)
);

-- A user's role. Nullable: consumers and farmers have no management role, and a
-- brand-new admin row is linked by the seeder/backfill. ON DELETE SET NULL so
-- removing a role never cascades into deleting user accounts.
alter table users
  add column if not exists role_id integer references rbac_roles(id) on delete set null;

-- requireAuth resolves permissions on every authenticated request, filtering by
-- the user's role_id, so that lookup wants an index.
create index if not exists idx_users_role_id on users(role_id);
create index if not exists idx_rbac_role_permissions_role on rbac_role_permissions(role_id);
