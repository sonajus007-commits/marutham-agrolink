-- ============================================================
-- One login per employee
-- ------------------------------------------------------------
-- Guarantees at the DB level that an Employee ID backs at most one
-- staff login. This closes the race that an app-level check alone
-- cannot (two concurrent create-staff requests for the same emp_id).
--
-- consumers / farmers have no emp_id, so the index is partial (NULLs
-- are ignored and remain unconstrained).
--
-- NOTE: if the earlier bug already created duplicate logins for an
-- emp_id, this index will FAIL to build until you resolve them. Find
-- offenders first:
--   select emp_id, count(*)
--     from users
--    where emp_id is not null
--    group by emp_id
--   having count(*) > 1;
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- ============================================================

create unique index if not exists uniq_users_emp_id
  on users (emp_id)
  where emp_id is not null;
