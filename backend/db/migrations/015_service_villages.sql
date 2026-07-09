-- ============================================================
-- Phase B: Delivery Agent service villages
-- ------------------------------------------------------------
-- A Delivery Agent can be tagged to multiple villages/towns that they
-- support for collection (farmer -> hub / direct) and for last-mile
-- delivery. Stored as a text array; matching checks membership.
-- ============================================================

alter table users
  add column if not exists service_villages text[] not null default '{}';

-- Helpful for "which agents cover village X" lookups.
create index if not exists idx_users_service_villages
  on users using gin (service_villages);
