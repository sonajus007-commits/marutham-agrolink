-- 069 — Clear the Supabase security/performance advisor WARNINGS.
--
-- What is deliberately NOT addressed here (all INFO level):
--   rls_enabled_no_policy   every table: RLS on, no policies, is the design (067/068).
--   unused_index            a test database with no real traffic; idx_scan = 0 is noise.
--   unindexed_foreign_keys  mostly audit columns (deleted_by, reviewed_by) never joined on.

-- ── extension_in_public ──────────────────────────────────────────────────────
-- pg_trgm's functions and operators in public are callable through the REST API.
-- Its only use is the three gin_trgm_ops indexes from 051; an index refers to its
-- operator class by OID, not by name, so moving the extension leaves them intact.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- ── function_search_path_mutable ─────────────────────────────────────────────
-- A function without a pinned search_path resolves names against whatever the
-- CALLER's search_path is, so a caller could shadow `users` or `now()` with its
-- own. Pinning it makes every unqualified name mean public.
alter function public.log_employee_changes()           set search_path = public;
alter function public.log_user_changes()               set search_path = public;
alter function public.next_code_seq(text, text, text)  set search_path = public;
alter function public.orders_reject_grandchild()       set search_path = public;
alter function public.set_employees_updated_at()       set search_path = public;

-- ── duplicate_index ──────────────────────────────────────────────────────────
-- Each is a plain index on exactly the columns a UNIQUE index already covers
-- (a btree reads either direction, so the DESC copy buys nothing). Every write
-- paid to maintain both.
drop index if exists public.idx_returns_order;          -- = uniq_returns_order (026)
drop index if exists public.idx_employees_emp_id;       -- = employees_emp_id_key
drop index if exists public.staff_attendance_user_idx;  -- = staff_attendance_user_id_work_date_key
