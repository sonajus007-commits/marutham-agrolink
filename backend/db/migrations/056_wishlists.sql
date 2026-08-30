-- 056 — Consumer wishlist (save for later).
--
-- A buyer can heart a product to come back to it. One row per (user, product); the
-- unique constraint makes "add" idempotent and lets a toggle upsert/delete cleanly.
-- Deliberately tiny — it references the catalogue product, not a listing, so it
-- survives a seller relisting. Idempotent throughout.

create table if not exists wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists wishlists_user_idx
  on wishlists (user_id, created_at desc);
