-- 061 — Farmer field-visit log.
--
-- The operations dashboard has carried a `farmer_visits` placeholder since Phase 3:
-- managers want to see how much field-relationship work is happening with farmers in
-- their area, but nothing recorded a visit. This is that record.
--
-- A field staffer (VCO, or a manager doing relationship work) logs a visit to a
-- farmer with a purpose and optional notes. `district` and the two *_name columns are
-- denormalised at log time — from the farmer for district (so the manager view scopes
-- by area without a join) and from both parties for names (so a list renders without
-- re-reading users, and survives a later rename). visited_by is SET NULL rather than
-- cascade so a visit outlives the staffer's row; farmer_id cascades because a visit to
-- a farmer who no longer exists has nothing to show. Idempotent throughout.

create table if not exists farmer_visits (
  id              uuid primary key default gen_random_uuid(),
  farmer_id       uuid not null references users(id) on delete cascade,
  farmer_name     text,
  visited_by      uuid references users(id) on delete set null,
  visited_by_name text,
  purpose         text not null,
  notes           text,
  district        text,
  visited_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- The manager view reads "visits in this area, newest first" (optionally by district);
-- the field staffer reads their own; a farmer profile could read its own history.
create index if not exists farmer_visits_when_idx
  on farmer_visits (visited_at desc, district);

create index if not exists farmer_visits_farmer_idx
  on farmer_visits (farmer_id, visited_at desc);

create index if not exists farmer_visits_by_idx
  on farmer_visits (visited_by, visited_at desc);
