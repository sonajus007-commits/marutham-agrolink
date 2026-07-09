-- ============================================================
-- Taluk field on users (part of the address hierarchy)
-- ------------------------------------------------------------
-- Adds the sub-district (Taluk) that sits between District and
-- Village/Town. Populated from the cascading State ▸ District ▸ Taluk
-- selectors. Village/Town, City and Pincode remain manual entries.
-- ============================================================

alter table users
  add column if not exists taluk text;
