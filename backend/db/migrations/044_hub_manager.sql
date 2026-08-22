-- Migration: Hub Manager on the hub network
--
-- The taluk-hub org gets a controlling authority ABOVE the Hub Incharge: the
-- **Hub Manager** (new RBAC role, tier between District Manager and Hub Incharge).
-- A taluk hub is now run by its Hub Manager; the Hub Incharge, VCOs and Delivery
-- Agents assigned to that hub are its team. A district's MAIN hub is run by the
-- District Manager, and the taluk hubs' Hub Managers report to that DM (reporting
-- lines themselves stay in the HR employee org tree — this column is the
-- operational "who runs this hub" pointer, parallel to hub_incharge_id).
--
-- hub_manager_id is nullable: a freshly created hub has no manager until admin
-- assigns one, and a manager can leave. ON DELETE SET NULL mirrors hub_incharge_id
-- so removing a user never orphan-breaks a hub row.

alter table hubs
  add column if not exists hub_manager_id uuid references users(id) on delete set null;

create index if not exists idx_hubs_manager on hubs (hub_manager_id);

comment on column hubs.hub_manager_id is
  'The Hub Manager running this hub (a taluk hub) or the District Manager (a main '
  'hub). Operational pointer, parallel to hub_incharge_id; reporting lines live in '
  'the HR employee org tree.';
