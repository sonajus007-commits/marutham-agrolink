-- 040 — Career band is a PERMANENT-employee classification only.
--
-- Contract staff sit outside the L0–L12 ladder, so their career_band must be
-- NULL. The 039 backfill mapped every employee from their designation, which
-- swept up contract staff too — clear those, then lock the rule in at the DB.

update employees
set career_band = null
where employment_type = 'Contract'
  and career_band is not null;

-- A contract employee can never carry a band. `is distinct from` keeps a NULL
-- employment_type from tripping the check (three-valued logic), and the whole
-- guard is a no-op for permanent staff. Wrapped so a rebuild that already has
-- the constraint doesn't error.
do $$ begin
  alter table employees
    add constraint employees_band_permanent_only
    check (employment_type is distinct from 'Contract' or career_band is null);
exception when duplicate_object then null;
end $$;
