-- 036 — Multi-vendor orders split into a parent + one child per seller.
--
-- One cart can hold produce from several sellers, and those parcels do not travel
-- together: each seller's goods sit in that seller's village, get verified by THAT
-- village's VCO, and take their own Direct-or-Hub route to the door. A single
-- orders row cannot express that — it has one `village`, one `stage`, one `route`,
-- one `agent_id`. Before this migration POST /orders took the FIRST item's farmer
-- village as the whole order's village, so a two-vendor cart routed entirely to one
-- VCO and the second seller's produce never appeared in its own VCO's queue.
--
-- The split keeps ONE row for the customer (the parent: one code, one payment, one
-- delivery address, one rating) and adds one CHILD row per seller. A child is a
-- normal orders row in every other respect, which is the point: every machine we
-- already have — scan, verify, assign, PATCH /route, geofence, order_history,
-- payouts, the VCO/agent queues — keys off an orders row and therefore works on a
-- child untouched.
--
-- SINGLE-SELLER ORDERS ARE NOT SPLIT. They stay exactly one row with
-- parent_order_id IS NULL, identical to every order placed before today. That is
-- also why `parent_order_id IS NULL` is the correct filter for "one row per
-- customer order" in revenue queries: it selects parents and unsplit orders alike.
--
-- WHERE THE MONEY LIVES: the parent carries the charges the customer actually pays
-- once — delivery, handling, and the multi-vendor fee. Each child carries its own
-- lines (item_total / market_fee / saved). To keep COD collectable per parcel,
-- sum(children.total) is kept exactly equal to parent.total by allocating those
-- order-level charges to the lowest live split_seq. Dashboards must therefore sum
-- only rows with parent_order_id IS NULL, or GMV double-counts.
--
-- WHERE order_items LIVE: on the CHILD, never on the parent. An item belongs to
-- exactly one seller, farmer payouts group order_items by order_id, and duplicating
-- lines onto the parent would pay every seller twice.

alter table orders
  add column if not exists parent_order_id uuid references orders(id) on delete cascade,
  add column if not exists seller_id       uuid references users(id),
  add column if not exists seller_name     text,
  add column if not exists split_seq       smallint;

-- Children are read by parent constantly (every rollup, every detail page) and
-- never by anything else, so the index is partial — unsplit orders stay out of it.
create index if not exists orders_parent_order_id_idx
  on orders (parent_order_id)
  where parent_order_id is not null;

-- A child is identified by parent_order_id, and it must carry the three fields that
-- make it a child. Enforced together so a half-written child cannot exist: a row
-- with a parent but no seller would be an unroutable parcel nobody owns.
alter table orders drop constraint if exists orders_child_fields_together;
alter table orders add constraint orders_child_fields_together check (
  (parent_order_id is null and split_seq is null and seller_id is null)
  or
  (parent_order_id is not null and split_seq is not null and seller_id is not null)
);

-- Sequence numbers are what the child's code is built from
-- (ORDPDK260724000001-1, -2), so they must be unique within one parent or two
-- parcels would print the same code.
create unique index if not exists orders_parent_split_seq_uniq
  on orders (parent_order_id, split_seq)
  where parent_order_id is not null;

-- Exactly ONE level. A child may never itself be a parent: the rollup walks up a
-- single hop, and a grandchild would strand money and status halfway up the tree.
-- A CHECK constraint cannot see another row, so this is a trigger.
create or replace function orders_reject_grandchild() returns trigger as $$
declare parent_is_child boolean;
begin
  if new.parent_order_id is null then
    return new;
  end if;

  if new.parent_order_id = new.id then
    raise exception 'An order cannot be its own parent (order %).', new.id;
  end if;

  select parent_order_id is not null into parent_is_child
    from orders where id = new.parent_order_id;

  if parent_is_child then
    raise exception 'Order splits are one level deep: % is already a child and cannot be a parent.',
      new.parent_order_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_reject_grandchild_trg on orders;
create trigger orders_reject_grandchild_trg
  before insert or update of parent_order_id on orders
  for each row execute function orders_reject_grandchild();

comment on column orders.parent_order_id is
  'Child orders only: the customer-facing parent order. NULL for parents and for '
  'unsplit single-seller orders — so "parent_order_id is null" = one row per customer order.';
comment on column orders.seller_id is
  'Child orders only: the one seller (farmer/retailer) whose goods this parcel holds.';
comment on column orders.seller_name is
  'Child orders only: seller display name, denormalised the way consumer_name/agent_name are.';
comment on column orders.split_seq is
  'Child orders only: 1-based position within the parent. Builds the child code suffix '
  '(ORDPDK260724000001-1) and picks which child carries the order-level charges.';
