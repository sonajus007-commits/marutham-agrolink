-- ============================================================
-- Employee org-structure + audit enhancements
-- ------------------------------------------------------------
-- Adds to the employee tracker (`employees`):
--   * is_manager               -- flag: can be picked as a Reporting Manager
--   * reporting_manager_emp_id -- FK-by-emp_id to the manager's record
--   * house_no / street1 / street2 -- split address (matches registration)
-- Plus a full change-history audit trail on `employees`, mirroring the
-- existing user_audit_log trigger (see migration_audit_login.sql).
--
-- Run this in the Supabase SQL editor (exec_sql RPC is not enabled).
-- Safe to re-run (idempotent).
-- ============================================================

-- 1. New employee columns ------------------------------------
alter table employees add column if not exists is_manager boolean not null default false;
alter table employees add column if not exists reporting_manager_emp_id text;  -- points at employees.emp_id
alter table employees add column if not exists house_no text;
alter table employees add column if not exists street1  text;
alter table employees add column if not exists street2  text;

create index if not exists idx_employees_is_manager on employees(is_manager);
create index if not exists idx_employees_mgr_emp_id on employees(reporting_manager_emp_id);

-- Back-fill split address from the old single line where possible (best-effort:
-- keep existing address_line as street1 if the new fields are empty).
update employees
   set street1 = address_line
 where street1 is null and address_line is not null;

-- 2. Employee record audit trail -----------------------------
create table if not exists employee_audit_log (
  id             bigint generated always as identity primary key,
  employee_id    uuid,                 -- the employees row that changed
  emp_id         text,                 -- denormalised for easy lookup
  action         text not null,        -- INSERT | UPDATE | DELETE
  changed_by     uuid,                 -- app actor if set via app.current_user_id (else NULL)
  changed_fields jsonb,                -- UPDATE: { field: { old, new }, ... }
  row_snapshot   jsonb,                -- INSERT/DELETE: full row
  changed_at     timestamptz not null default now()
);
create index if not exists idx_employee_audit_emp on employee_audit_log(employee_id, changed_at desc);

create or replace function log_employee_changes() returns trigger as $$
declare
  oldj  jsonb;
  newj  jsonb;
  diff  jsonb := '{}'::jsonb;
  k     text;
  actor uuid;
begin
  begin
    actor := nullif(current_setting('app.current_user_id', true), '')::uuid;
  exception when others then
    actor := null;
  end;

  if (tg_op = 'UPDATE') then
    oldj := to_jsonb(OLD);
    newj := to_jsonb(NEW);
    for k in select jsonb_object_keys(newj) loop
      if k <> 'updated_at' and (oldj -> k) is distinct from (newj -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('old', oldj -> k, 'new', newj -> k));
      end if;
    end loop;
    if diff <> '{}'::jsonb then
      insert into employee_audit_log(employee_id, emp_id, action, changed_by, changed_fields)
      values (NEW.id, NEW.emp_id, 'UPDATE', actor, diff);
    end if;
    return NEW;

  elsif (tg_op = 'INSERT') then
    insert into employee_audit_log(employee_id, emp_id, action, changed_by, row_snapshot)
    values (NEW.id, NEW.emp_id, 'INSERT', actor, to_jsonb(NEW));
    return NEW;

  elsif (tg_op = 'DELETE') then
    insert into employee_audit_log(employee_id, emp_id, action, changed_by, row_snapshot)
    values (OLD.id, OLD.emp_id, 'DELETE', actor, to_jsonb(OLD));
    return OLD;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_employee_audit on employees;
create trigger trg_employee_audit
  after insert or update or delete on employees
  for each row execute function log_employee_changes();
