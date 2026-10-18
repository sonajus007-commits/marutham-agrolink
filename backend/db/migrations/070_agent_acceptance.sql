-- 070 — Delivery-agent accept/decline + a named VCO → Hub collection agent.
--
-- An agent named to a parcel now has a window (15 min) to ACCEPT the job; a
-- decline or a timeout un-assigns them and tells whoever assigned them, so the
-- VCO / Hub Incharge can pick someone else. Two independent legs:
--
--   • agent_*       — the existing agent: direct-route delivery agent (named by the
--                     VCO at verify) or the hub's last-mile agent (named at the hub).
--                     agent_assign_status / agent_accept_deadline / agent_assigned_by
--                     are new; agent_id/name/phone/vehicle already exist.
--   • collection_*  — NEW: on the hub route, the agent who carries the parcel from
--                     the VCO to the hub and hands it to the Hub Incharge. Separate
--                     from agent_* so the last-mile agent the hub names later never
--                     overwrites who brought it in.
--
-- *_assign_status: 'pending' (waiting for the agent) | 'accepted'. NULL with an
-- agent set means a legacy assignment made before this migration — treated as
-- accepted, so nothing in flight is stranded.

alter table orders
  add column if not exists agent_assign_status        text,
  add column if not exists agent_accept_deadline      timestamptz,
  add column if not exists agent_assigned_by          uuid references users(id),
  add column if not exists collection_agent_id        uuid references users(id),
  add column if not exists collection_agent_name      text,
  add column if not exists collection_agent_phone     text,
  add column if not exists collection_assign_status   text,
  add column if not exists collection_accept_deadline timestamptz,
  add column if not exists collection_assigned_by     uuid references users(id);

alter table orders drop constraint if exists orders_agent_assign_status_chk;
alter table orders add constraint orders_agent_assign_status_chk
  check (agent_assign_status is null or agent_assign_status in ('pending', 'accepted'));
alter table orders drop constraint if exists orders_collection_assign_status_chk;
alter table orders add constraint orders_collection_assign_status_chk
  check (collection_assign_status is null or collection_assign_status in ('pending', 'accepted'));

-- The expiry sweep scans both deadlines for pending assignments.
create index if not exists idx_orders_agent_accept_deadline
  on orders (agent_accept_deadline) where agent_assign_status = 'pending';
create index if not exists idx_orders_collection_accept_deadline
  on orders (collection_accept_deadline) where collection_assign_status = 'pending';
-- The agent's queue reads parcels by collection agent too.
create index if not exists idx_orders_collection_agent on orders (collection_agent_id);

comment on column orders.agent_assign_status is
  'pending = named agent has not accepted yet (deadline agent_accept_deadline); accepted; NULL+agent = legacy, treated as accepted.';
comment on column orders.collection_agent_id is
  'Hub route: the agent carrying the parcel VCO → hub (hands over to the Hub Incharge). Separate from the last-mile agent_id.';

notify pgrst, 'reload schema';
