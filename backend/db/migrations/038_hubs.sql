-- 038 — Hub network + delivery-agent coverage, availability and location.
--
-- THE HUB TOPOLOGY (as agreed): the business runs a two-tier hub network.
--
--   • One MAIN hub per DISTRICT   (hub_type = 'main',  taluk IS NULL)
--   • One TALUK hub per TALUK      (hub_type = 'taluk', taluk = <taluk>)
--       each taluk hub CONNECTS to its district's main hub via parent_hub_id.
--
-- So a district's parcels flow taluk hub → district main hub, and a Delivery
-- Agent belongs to exactly one taluk hub (users.hub_id) — that is "the hub
-- responsible for the agent". A Hub Incharge is the staffer responsible for a
-- hub (hubs.hub_incharge_id).
--
-- The rows themselves are reference data seeded from the `locations` tree by
-- backend/db/seed_hubs.js — the same split the RBAC tables use (DDL here, rows in
-- a seed script), which keeps this migration pure DDL and idempotent. A fresh
-- rebuild has the table; the seed populates it.
--
-- lat/lng are optional per-hub coordinates (the geolocation rollout, phase 4):
-- with them the VCO/Hub can sort available agents nearest-first, but assignment
-- itself matches on area NAMES (district/taluk/village), so it never depends on a
-- coordinate being present.

create table if not exists hubs (
  id              uuid primary key default gen_random_uuid(),
  hub_type        text not null check (hub_type in ('main', 'taluk')),
  state           text not null,
  district        text not null,
  taluk           text,                       -- NULL for a main (district) hub
  name            text not null,
  parent_hub_id   uuid references hubs(id) on delete set null,
  hub_incharge_id uuid references users(id) on delete set null,
  lat             double precision,
  lng             double precision,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  -- a main hub has no parent; a taluk hub must name one
  constraint hubs_parent_shape check (
    (hub_type = 'main'  and taluk is null    and parent_hub_id is null)
    or (hub_type = 'taluk' and taluk is not null)
  )
);

-- Exactly one main hub per district, and one taluk hub per taluk. Partial unique
-- indexes, because a plain UNIQUE(state,district,taluk) treats the NULL taluk of
-- every main hub as distinct and would let a district have two.
create unique index if not exists hubs_main_uniq
  on hubs (state, district) where hub_type = 'main';
create unique index if not exists hubs_taluk_uniq
  on hubs (state, district, taluk) where hub_type = 'taluk';

create index if not exists idx_hubs_district on hubs (state, district);
create index if not exists idx_hubs_parent   on hubs (parent_hub_id);

comment on table hubs is
  'Two-tier hub network: one main hub per district, one taluk hub per taluk '
  '(parent_hub_id → the district main hub). Seeded by db/seed_hubs.js from locations.';

-- ── Delivery-agent columns on users ──────────────────────────────────────────
--
-- hub_id        — the taluk hub responsible for this agent.
-- service_areas — the villages/towns the agent covers, grouped by taluk:
--                 [{ "taluk": "Thirumayam", "villages": ["Kaanadukaathaan", …] }].
--                 The taluk comes from the locations tree (cascaded from the
--                 agent's district); villages are typed (there is no village
--                 master). Supersedes the flat service_villages[] (kept for now
--                 so existing readers don't break).
-- available_date — the IST calendar day the agent marked themselves "ready for
--                 delivery". A daily flag: ready-today ⇔ available_date = today
--                 (IST); it naturally lapses overnight, so the agent re-marks it
--                 each morning and the VCO/Hub only ever see today's ready agents.
-- agent_lat/lng/agent_loc_at — device GPS captured when the agent taps "Ready",
--                 for nearest-first sorting. Best-effort and nullable (location
--                 can be declined), exactly like the other geolocation phases.
alter table users
  add column if not exists hub_id         uuid references hubs(id) on delete set null,
  add column if not exists service_areas  jsonb not null default '[]'::jsonb,
  add column if not exists available_date date,
  add column if not exists agent_lat      double precision,
  add column if not exists agent_lng      double precision,
  add column if not exists agent_loc_at   timestamptz;

create index if not exists idx_users_hub_id on users (hub_id);

comment on column users.hub_id is
  'Delivery Agent: the taluk hub responsible for this agent (hubs.id).';
comment on column users.service_areas is
  'Delivery Agent coverage: [{taluk, villages[]}] — taluk from locations, villages typed.';
comment on column users.available_date is
  'Delivery Agent: IST day the agent marked "ready for delivery". ready-today ⇔ = today (IST).';
