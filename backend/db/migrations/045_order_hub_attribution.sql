-- Migration: orders.pickup_hub_id / orders.delivery_hub_id
--
-- Order → hub attribution (Hub Management, Phase 2). Every order records the two
-- taluk hubs it flows between:
--   • pickup_hub_id   — the seller's taluk hub  (where the parcel enters the network)
--   • delivery_hub_id — the consumer's delivery taluk hub (where it leaves for the door)
-- An intra-taluk order names the same hub for both. These are what let a Hub
-- Manager's per-hub dashboard (Phase 3) count what came IN vs what went OUT, and
-- let the District Manager roll every hub up.
--
-- Resolved best-effort at checkout from each side's state/district/taluk against the
-- hub network (utils/hubResolver.js). BOTH nullable: a taluk with no hub yet, a
-- profile missing its taluk, or a hub lookup that fails must never block an order —
-- attribution is reporting metadata, not a gate on placing the order. A later
-- backfill (db/backfill_order_hubs.js) fills historical rows.
--
-- On a SPLIT order the money-and-container parent has no single seller, so its
-- pickup_hub_id stays NULL (mirroring its NULL village); each child parcel carries
-- its own seller's pickup hub. delivery_hub_id is the consumer's on every row.
--
-- ON DELETE SET NULL mirrors hubs.hub_incharge_id / hub_manager_id: removing a hub
-- must never orphan-break an order row. Idempotent.

alter table orders
  add column if not exists pickup_hub_id   uuid references hubs(id) on delete set null,
  add column if not exists delivery_hub_id uuid references hubs(id) on delete set null;

create index if not exists idx_orders_pickup_hub   on orders (pickup_hub_id);
create index if not exists idx_orders_delivery_hub on orders (delivery_hub_id);

comment on column orders.pickup_hub_id is
  'The seller''s taluk hub — where this order enters the network. NULL on a split '
  'parent (no single seller; each child carries its own) or when unresolved.';
comment on column orders.delivery_hub_id is
  'The consumer''s delivery taluk hub — where this order leaves the network for the '
  'door. NULL when unresolved. Same as pickup_hub_id for an intra-taluk order.';
