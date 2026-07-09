-- ============================================================
-- Employee onboarding APPROVAL workflow + trust-role flags
-- ------------------------------------------------------------
-- Adds an HR approval gate to the employee tracker:
--   approval_status  pending -> approved / rejected
--   * emp_id is issued ONLY on approval (so it becomes nullable).
--   * Board of Director + HR Admin records are auto-approved on
--     creation (system bootstrap) and get their ID immediately.
--   * Everyone else stays 'pending' with NO emp_id until an
--     HR Admin (or Board of Director / Head Office) approves.
--
-- Trust-role flags (delegatable authority):
--   is_board_director -- root of trust; can approve HR Admins
--   is_hr_admin       -- delegated approver for all other employees
--
-- Run this in the Supabase SQL editor (exec_sql RPC is not enabled).
-- Safe to re-run (idempotent).
-- ============================================================

alter table employees add column if not exists approval_status text not null default 'pending'
  check (approval_status in ('pending','approved','rejected'));
alter table employees add column if not exists is_board_director boolean not null default false;
alter table employees add column if not exists is_hr_admin       boolean not null default false;
alter table employees add column if not exists requested_by    uuid;   -- user who raised the request
alter table employees add column if not exists approved_by     uuid;   -- user who approved/rejected
alter table employees add column if not exists approved_at     timestamptz;
alter table employees add column if not exists rejected_reason text;

-- Employee ID is now issued on approval, so it is no longer mandatory at insert.
alter table employees alter column emp_id drop not null;

-- Grandfather every existing employee as already approved (they are onboarded).
update employees
   set approval_status = 'approved',
       approved_at     = coalesce(approved_at, now())
 where emp_id is not null and approval_status <> 'approved';

create index if not exists idx_employees_approval on employees(approval_status);
create index if not exists idx_employees_hr_admin on employees(is_hr_admin);
create index if not exists idx_employees_bod       on employees(is_board_director);
