-- 039 — Career Band (L0–L12) on the employee record.
--
-- A career band is a NEW, first-class HR dimension on an employee, sitting
-- ALONGSIDE designation + department — and deliberately SEPARATE from RBAC.
-- System access stays keyed on role_id / trust flags (037_rbac.sql): a
-- promotion from Executive to Manager must NOT auto-grant access, and vice
-- versa. HR Admin owns this field (requirePermission('employee_management', …)).
--
-- The scale (L0 = top of the org, L12 = intern):
--   L0  Board of Directors      L7  Assistant Manager
--   L1  CEO                      L8  Senior Executive
--   L2  CXO                      L9  Executive
--   L3  Vice President           L10 Associate
--   L4  General Manager          L11 Graduate Engineer Trainee / Trainee
--   L5  Senior Manager           L12 Intern
--   L6  Manager
--
-- The band is HR-editable (the app auto-fills it from a designation catalog but
-- lets HR override for exceptions), so the only DB-level guarantee is that the
-- value, when present, is one of the 13 codes. NULL is allowed transiently but
-- the backfill below leaves nobody blank.

alter table employees
  add column if not exists career_band text
    check (career_band is null or career_band in
      ('L0','L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12'));

-- Backfill every existing permanent employee from their current designation so
-- nobody starts blank. HR reviews afterwards (decision 3). The CASE covers both
-- the values that actually exist in the DB today AND the rest of the legacy
-- EMP_DESIGNATIONS list, so a rebuild-then-seed with any of those still maps.
-- Only rows still missing a band are touched — re-running never clobbers an
-- HR override.
update employees
set career_band = case designation
    when 'Board of Director'        then 'L0'
    when 'Managing Director'        then 'L0'
    when 'CEO'                      then 'L1'
    when 'CFO'                      then 'L2'
    when 'CTO'                      then 'L2'
    when 'Technical Admin'          then 'L4'   -- ambiguous; leaning GM-Technology, HR to review
    when 'State Head'               then 'L4'
    when 'Zonal Manager'            then 'L5'
    when 'Regional Manager'         then 'L6'
    when 'HR Manager'               then 'L6'
    when 'HR Admin'                 then 'L6'
    when 'District Manager'         then 'L7'
    when 'Hub Incharge'             then 'L9'
    when 'Collection Officer(VCO)'  then 'L10'
    when 'VCO'                      then 'L10'
    when 'Delivery Agent'           then 'L10'
    else career_band
  end
where career_band is null
  and designation is not null;
