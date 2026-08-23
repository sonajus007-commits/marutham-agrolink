-- 047 — Hub office address.
--
-- A hub is a real place — the office through which a taluk's goods flow — so it
-- gets a COMPLETE postal address, not just its routing keys. The routing keys
-- (state / district / taluk) and the map pin (lat / lng) already live on the row
-- since 038; this adds the human-readable street address that fills in the rest of
-- the shared address block (street → village/town → … → country → pincode).
--
-- Two jobs for this address, both from the business ask:
--   1. It IS the office address shown on the profile of every VCO, Delivery Agent,
--      Hub Incharge and Hub Manager assigned to the hub (users.hub_id → this row).
--      One source of truth: edit the hub, everyone's office address follows.
--   2. Together with lat/lng it pins where a hub → consumer delivery leaves from.
--
-- All nullable: hubs seeded before this migration carry no address until an admin
-- fills one in, exactly like lat/lng. Mirrors the users address columns by name so
-- the same AddressFields block and addressDetailRows() render both. Idempotent.

alter table hubs
  add column if not exists house_no     text,
  add column if not exists street1      text,
  add column if not exists street2      text,
  add column if not exists landmark     text,
  add column if not exists village_town text,
  add column if not exists country      text,
  add column if not exists pincode      text;

comment on column hubs.village_town is
  'Hub office address: village / town / city (merged locality, mirrors users.village_town).';
comment on column hubs.pincode is
  'Hub office address: 6-digit pincode. With lat/lng this pins the hub → consumer delivery origin.';
