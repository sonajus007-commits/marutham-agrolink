-- 068 — Record RLS for every table that predates 067.
--
-- These tables already have RLS ON in the live database — it was switched on by
-- hand in the Supabase dashboard, so no migration says so. A database rebuilt from
-- migrations would have come up with RLS OFF on all of them, i.e. every table open
-- to the anon key. This writes the live state down. Re-enabling is a no-op, so it
-- changes nothing on the existing database.
--
-- backend/db/check-rls.js now fails CI for any table no migration enables RLS on.

alter table code_counters            enable row level security;
alter table device_tokens            enable row level security;
alter table employee_audit_log       enable row level security;
alter table employees                enable row level security;
alter table farmer_listings          enable row level security;
alter table hubs                     enable row level security;
alter table locations                enable row level security;
alter table notifications            enable row level security;
alter table order_history            enable row level security;
alter table order_items              enable row level security;
alter table orders                   enable row level security;
alter table payouts                  enable row level security;
alter table product_district_prices  enable row level security;
alter table product_ratings          enable row level security;
alter table product_requests         enable row level security;
alter table products                 enable row level security;
alter table profile_change_requests  enable row level security;
alter table rbac_modules             enable row level security;
alter table rbac_role_permissions    enable row level security;
alter table rbac_role_scope          enable row level security;
alter table rbac_roles               enable row level security;
alter table return_lines             enable row level security;
alter table return_photos            enable row level security;
alter table returns                  enable row level security;
alter table staff_attendance         enable row level security;
alter table subscription_payments    enable row level security;
alter table support_tickets          enable row level security;
alter table user_audit_log           enable row level security;
alter table user_login_history       enable row level security;
alter table user_status_history      enable row level security;
alter table users                    enable row level security;
alter table wishlists                enable row level security;

-- The one policy in the database, also hand-made: signed-in users may read the
-- module catalog. Recreated so a rebuild keeps it.
drop policy if exists "rbac_modules read for authenticated" on rbac_modules;
create policy "rbac_modules read for authenticated" on rbac_modules
  for select to authenticated using (true);
