-- 067 — Enable RLS on tables created since 060 that shipped without it.
--
-- Supabase exposes every public table through its REST API to the anon key. With
-- RLS off, anyone holding that key could read or write these rows directly —
-- order_proofs holds delivery photos with GPS, expenses holds money.
--
-- Same convention as every other table here: RLS on, NO policies. That denies the
-- anon/authenticated roles outright; the backend uses the service-role key, which
-- bypasses RLS, so the app is unaffected.

alter table order_proofs         enable row level security;
alter table farmer_visits        enable row level security;
alter table expenses             enable row level security;
alter table declined_order_items enable row level security;
