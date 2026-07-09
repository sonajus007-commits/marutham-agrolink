-- ============================================================
-- Phase A: Staff Village/Town for VCO & Delivery Agent matching
-- ------------------------------------------------------------
-- Context: a VCO only sees orders whose fulfilment village equals the
-- VCO's village. Historically that read the `vco_city` column, but
-- staff created via "Add Staff" never populated any village, so every
-- VCO's village was NULL and matched no orders.
--
-- Going forward, `village_town` is the canonical village field (it is
-- editable in Admin edit + the staff profile) and `vco_city` is kept in
-- sync as a legacy fallback. This backfill aligns existing rows.
-- ============================================================

-- Where a staff member already has an address village but no vco_city,
-- copy it across so the legacy fallback stays consistent.
update users
   set vco_city = village_town
 where role = 'admin'
   and admin_role in ('VCO', 'Delivery Agent')
   and village_town is not null
   and (vco_city is null or vco_city = '');

-- NOTE: staff with NO village at all cannot be auto-fixed — a human must
-- set their Village/Town (Admin → edit staff, or recreate via Add Staff),
-- because the system cannot know which village they cover.
