-- 051 — Indexes for the public catalogue search/browse (GET /api/products).
--
-- These back the query shapes the shop actually issues:
--   ?q=      → ILIKE '%term%' on name AND regional_name. A leading-wildcard ILIKE
--              cannot use a btree, so the only index that helps is a TRIGRAM GIN
--              (pg_trgm). This is the one that makes search scale past a seq-scan.
--   ?category= → ILIKE 'Name' (case-insensitive exact) on category — trigram serves
--              this too.
--   ?sort=newest → ORDER BY created_at DESC.
--
-- On a small catalogue the planner will still seq-scan (correctly — an index over a
-- handful of rows is slower); these earn their keep as the catalogue grows. Adding
-- them now means no migration is needed at the moment it starts to matter.
-- Idempotent: CREATE ... IF NOT EXISTS throughout.

create extension if not exists pg_trgm;

create index if not exists products_name_trgm
  on products using gin (name gin_trgm_ops);

create index if not exists products_regional_name_trgm
  on products using gin (regional_name gin_trgm_ops);

create index if not exists products_category_trgm
  on products using gin (category gin_trgm_ops);

create index if not exists products_created_at_idx
  on products (created_at desc);
