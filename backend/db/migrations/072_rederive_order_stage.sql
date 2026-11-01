-- 072 — Re-derive `stage` for every order whose stage disagrees with its status.
--
-- Stage is an INDEX into the route's own list (STAGE_MAP, routes/delivery.js). 063
-- added Order Received and Order Accepted to those lists, which moved every later
-- status along by two, but it renamed rows without renumbering them. Same failure
-- as 034, and this is not cosmetic:
--
--   • advanceStage takes stage + 1, so a 'Packed' order left at stage 1 advances
--     BACKWARDS to 'Order Accepted'.
--   • Cancelling is allowed at stages 0–3, so a 'Picked Up' order left at stage 3
--     can be cancelled after collection.
--   • The tracking timeline marks steps done by stage, so it shows the wrong step.
--
-- `status` is the trustworthy column, so stage is derived from it. A blank route
-- means direct, as in resolveRoute(). 'split' parents use the superset map, whose
-- indices equal ROLLUP_ORDER (utils/orderSplit.js).
--
-- 'Cancelled' is in no map and is left alone: it holds the stage the order reached.
--
-- Idempotent: the last condition skips rows already consistent.

update orders o
set stage = m.stage
from (values
  ('direct', 'Order Placed',     0),
  ('direct', 'Order Received',   1),
  ('direct', 'Order Accepted',   2),
  ('direct', 'Packed',           3),
  ('direct', 'VCO Verified',     4),
  ('direct', 'Picked Up',        5),
  ('direct', 'Out for Delivery', 6),
  ('direct', 'Delivered',        7),

  ('hub',    'Order Placed',     0),
  ('hub',    'Order Received',   1),
  ('hub',    'Order Accepted',   2),
  ('hub',    'Packed',           3),
  ('hub',    'VCO Verified',     4),
  ('hub',    'In Transit',       5),
  ('hub',    'At Hub',           6),
  ('hub',    'Picked Up',        7),
  ('hub',    'Out for Delivery', 8),
  ('hub',    'Delivered',        9),

  ('split',  'Order Placed',     0),
  ('split',  'Order Received',   1),
  ('split',  'Order Accepted',   2),
  ('split',  'Packed',           3),
  ('split',  'VCO Verified',     4),
  ('split',  'In Transit',       5),
  ('split',  'At Hub',           6),
  ('split',  'Picked Up',        7),
  ('split',  'Out for Delivery', 8),
  ('split',  'Delivered',        9)
) as m(route, status, stage)
where coalesce(nullif(o.route, ''), 'direct') = m.route
  and o.status = m.status
  and o.stage is distinct from m.stage;
