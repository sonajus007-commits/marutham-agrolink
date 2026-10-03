-- 065 — Item-level decline → "Partially Accepted".
--
-- A seller could only accept or decline a parcel whole. When a multi-item order
-- arrives and one product has run out, they had to throw away the whole sale.
-- Now they can decline individual lines and accept the rest.
--
-- Declined lines are MOVED out of order_items into declined_order_items rather
-- than flagged in place. Everything that sums order_items — the seller's payout,
-- invoices, the VCO's verify list, packing, ratings, CSV reports, dashboards — then
-- stays correct with no change, because a declined line simply is not there. The
-- copy keeps what the customer ordered and why it was not supplied, for display.
--
-- The order's STATUS stays 'Order Accepted' (the state machine, stage index and
-- split-parent rollup all rank status values; a new value would rank as unknown
-- and drag a parent back to the first stage). `partially_accepted` is what makes
-- every screen say "Partially Accepted" instead. Idempotent throughout.

alter table orders
  add column if not exists partially_accepted boolean not null default false;

comment on column orders.partially_accepted is
  'Seller accepted this parcel but declined one or more of its lines (see declined_order_items). Status stays Order Accepted; display reads Partially Accepted.';

create table if not exists declined_order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  order_item_id  uuid,                       -- the order_items row it was moved from
  product_id     uuid references products(id),
  product_code   text,
  name           text,
  farmer_id      uuid references users(id),
  farmer_name    text,
  qty            numeric not null,
  unit           text,
  price          integer not null,            -- consumer price per unit, paise
  farmer_price   integer,                     -- seller price per unit, paise
  govt_price     integer,
  reason         text,
  declined_at    timestamptz not null default now()
);

create index if not exists declined_order_items_order_idx
  on declined_order_items (order_id);

notify pgrst, 'reload schema';
