-- 048 — Staff login id = Employee ID.
--
-- Staff used to carry TWO codes: their Employee ID (emp_id, e.g. MATN00001, issued on
-- HR approval) and a SEPARATE generated login_id (e.g. CNTNPDK_KAV01, minted when the
-- login was created). Going forward the Employee ID IS the login id — a staffer signs
-- in with their phone or their Employee ID (backend/routes/auth.js: create-staff now
-- sets login_id = emp_id, and login matches phone / login_id / emp_id).
--
-- This backfills EXISTING staff so their stored login_id becomes their Employee ID
-- too, for a uniform display. Only admin (staff) rows that have an emp_id are touched;
-- consumers/farmers keep their generated login_id. A row is skipped when its Employee
-- ID is already held as a login_id by a DIFFERENT account, so the UNIQUE(login_id)
-- constraint can never be violated (login_id has no foreign keys — audit/history rows
-- keep their own string snapshots, so rewriting it here is safe). Idempotent: rows
-- already equal to their emp_id are left alone, and re-running changes nothing.

update users u
   set login_id = u.emp_id
 where u.role = 'admin'
   and u.emp_id is not null
   and u.login_id is distinct from u.emp_id
   and not exists (
     select 1 from users x
      where x.login_id = u.emp_id
        and x.id <> u.id
   );
