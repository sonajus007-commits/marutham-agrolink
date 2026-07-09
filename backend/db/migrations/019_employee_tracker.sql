-- ============================================================
-- Employee Tracker (HR employee master) + staff linkage
-- ------------------------------------------------------------
-- Adds a company-wide employee master ("employee tracker") holding
-- each employee's personal details + company details (designation,
-- department, employment type, joining date, posting, etc.).
--
-- Staff login accounts (users where role='admin') link to a tracker
-- record by Employee ID:  users.emp_id  ==  employees.emp_id
--
-- Rule enforced in the app (see backend/routes/auth.js + users.js):
--   * Permanent staff  -> emp_id is REQUIRED and must match an
--                         ACTIVE row in employees.
--   * Contract staff   -> emp_id is optional (free text).
--
-- Run this in the Supabase SQL editor (exec_sql RPC is not enabled).
-- Safe to re-run (idempotent).
-- ============================================================

-- 1. Employment type on the staff login record ----------------
alter table users add column if not exists employment_type text
  check (employment_type in ('Permanent', 'Contract'));

-- 2. Employee master ("employee tracker") ---------------------
create table if not exists employees (
  id                uuid primary key default gen_random_uuid(),
  emp_id            text unique not null,          -- Employee ID: MA+state+5-digit, e.g. MATN00001

  -- ── Personal details ──────────────────────────────────────
  fname             text not null,
  lname             text,
  gender            text check (gender in ('Male','Female','Transgender')),
  dob               date,
  phone             text,
  email             text,
  aadhar            text,

  -- personal address
  address_line      text,
  village_town      text,
  city              text,
  taluk             text,
  district          text,
  state             text,
  pincode           text,

  -- ── Company details ───────────────────────────────────────
  designation       text,                          -- e.g. VCO, Hub Incharge, Manager
  department        text,                          -- e.g. Operations, Logistics
  employment_type   text not null default 'Permanent'
                      check (employment_type in ('Permanent','Contract')),
  date_of_joining   date,
  work_location     text,                          -- posting (village/town/office)
  work_district     text,
  work_state        text,
  reporting_manager text,

  -- ── Lifecycle ─────────────────────────────────────────────
  status            text not null default 'active'
                      check (status in ('active','inactive')),
  linked_user_id    uuid references users(id) on delete set null,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_employees_emp_id  on employees(emp_id);
create index if not exists idx_employees_status  on employees(status);
create index if not exists idx_employees_phone   on employees(phone);
create index if not exists idx_users_emp_id      on users(emp_id);

-- keep updated_at fresh on edits
create or replace function set_employees_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_employees_updated_at on employees;
create trigger trg_employees_updated_at
  before update on employees
  for each row execute function set_employees_updated_at();
