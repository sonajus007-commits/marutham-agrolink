-- 054 — Seller product requests.
--
-- Products are a fixed, admin-curated catalogue: a seller can only LIST a product
-- that already exists (farmer_listings.product_id → products.id). A RETAILER selling
-- packaged goods that aren't in the produce catalogue therefore had no way to sell
-- them at all. This table lets a seller PROPOSE a product; an admin with catalogue
-- rights reviews it and, on approval, creates the real products row and links it back
-- here — after which the seller can list it like any other.
--
-- `status` walks pending → approved | rejected. `product_id` is filled only on
-- approval (the catalogue row that was created). `review_reason` carries the
-- rejection reason. Idempotent: IF NOT EXISTS throughout.

create table if not exists product_requests (
  id            uuid primary key default gen_random_uuid(),
  requested_by  uuid not null references users(id) on delete cascade,
  name          text not null,
  regional_name text,
  category      text,
  unit          text not null,
  note          text,
  status        text not null default 'pending',
  review_reason text,
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz,
  product_id    uuid references products(id),
  created_at    timestamptz not null default now()
);

-- The seller reads "my requests" and the admin queue reads "everything pending",
-- both newest first.
create index if not exists product_requests_requester_idx
  on product_requests (requested_by, created_at desc);

create index if not exists product_requests_status_idx
  on product_requests (status, created_at desc);
