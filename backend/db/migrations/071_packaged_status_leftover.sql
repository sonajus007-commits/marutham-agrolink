-- 071 — Finish the Packaged → Packed rename.
--
-- 063 renamed the status VALUE, but one order (ORDPDK260920000001, packed the day
-- 063 landed) still carried 'Packaged'. Dashboards count raw status values, so it
-- showed up as its own bar beside 'Packed'. Nothing in the code writes the old
-- value any more, so this is a data fix and needs no display alias.
--
-- Unlike 063 this also sets stage. Stage is an index into the route's own map and
-- 'Packed' is 3 on every route (see STAGE_MAP, routes/delivery.js); the row still
-- holds the old index 1, which now means 'Order Received'.
--
-- Idempotent: once the old value is gone, both statements match nothing.

update orders        set status = 'Packed', stage = 3 where status = 'Packaged';
update order_history set label  = 'Packed'            where label  = 'Packaged';
