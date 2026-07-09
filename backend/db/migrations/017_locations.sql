-- ============================================================
-- Locations: real South-India State → District → Taluk reference
-- ------------------------------------------------------------
-- Powers the cascading State/District/Taluk dropdowns across all
-- address forms. Village/Town, City and Pincode are entered manually.
-- Data loaded via: node backend/load_locations.js
-- ============================================================

create table if not exists locations (
  id       uuid primary key default gen_random_uuid(),
  state    text not null,
  district text not null,
  taluk    text not null,
  unique (state, district, taluk)
);

create index if not exists idx_locations_state          on locations(state);
create index if not exists idx_locations_state_district on locations(state, district);
