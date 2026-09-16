-- 060 — Field proof photos (delivery hand-off, VCO collection).
--
-- A photo taken at a hand-off — the parcel at the customer's door, or the goods a
-- VCO received — settles the disputes a status flag cannot. There is no object store
-- in this deployment yet (listing images live as downscaled data URIs; see
-- apps/web ImagePicker), so a proof rides the same way: a small JPEG data URI.
--
-- It gets its OWN table rather than a column on orders precisely because it is heavy:
-- a data URI must never land in the orders row, which the queue lists select in bulk.
-- Proofs are read only on demand (order detail, an admin dispute review), so they sit
-- apart and are fetched by order_id when actually needed.

create table if not exists order_proofs (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  kind       text not null,               -- 'delivery' | 'verify'
  image      text not null,               -- downscaled JPEG data URI
  lat        double precision,
  lng        double precision,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists order_proofs_order_idx
  on order_proofs (order_id, created_at desc);
