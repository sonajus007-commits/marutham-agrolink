-- Migration: multiple hubs per taluk, unique by name
--
-- A taluk can now hold MORE THAN ONE hub — each hub is an office (Hub1, Hub2, …),
-- not "the taluk's hub". So the old "one taluk hub per taluk" rule is dropped and
-- replaced by name uniqueness WITHIN a taluk: two offices in the same taluk must
-- have different names, but the same name may repeat across taluks.
--
-- The main-hub rule is unchanged: still exactly one main hub per district.
--
-- Downstream note: order → hub attribution (utils/hubResolver) used to assume a
-- single taluk hub. With several, it now resolves to the OLDEST hub in the taluk
-- (the taluk's primary office); additional offices carry no auto-attributed orders.
-- Idempotent.

-- Drop the one-taluk-hub-per-taluk uniqueness.
drop index if exists hubs_taluk_uniq;

-- Names must be unique within a taluk (so Hub1/Hub2 coexist, duplicates are refused).
create unique index if not exists hubs_taluk_name_uniq
  on hubs (state, district, taluk, name) where hub_type = 'taluk';
