-- 034 — Re-derive `stage` for hub-routed orders after the hub map was reordered.
--
-- `orders.stage` is an INDEX into the stage list for that order's route, so its
-- meaning moves when the list does. The hub lane was reordered so that the parcel
-- reaches the hub BEFORE any individual agent takes custody of it:
--
--   was:  … VCO Verified(2) → Picked Up(3) → In Transit(4) → At Hub(5) → …
--   now:  … VCO Verified(2) → In Transit(3) → At Hub(4) → Picked Up(5) → …
--
-- 'Picked Up' now means "the last-mile agent collected it FROM the hub", which is
-- why it sits after 'At Hub'.
--
-- Rows written under the old list therefore carry a stage that now points at a
-- different status than the one in their own `status` column. Left alone, the next
-- scan advances from the wrong index and the order jumps sideways — an order
-- reading 'Picked Up' would advance to 'At Hub', travelling backwards.
--
-- `status` is the trustworthy column (it is the human-readable record, and every
-- history row agrees with it), so re-derive `stage` from it. Only indices 3-5 moved;
-- 'Out for Delivery'(6) and 'Delivered'(7) are unchanged in both lists, so completed
-- orders are untouched. Direct-route orders are untouched — their list never changed.
--
-- Idempotent: the WHERE clause skips rows already consistent, so re-running is a
-- no-op rather than a second shuffle.

update orders
set stage = case status
              when 'Order Placed'     then 0
              when 'Packaged'         then 1
              when 'VCO Verified'     then 2
              when 'In Transit'       then 3
              when 'At Hub'           then 4
              when 'Picked Up'        then 5
              when 'Out for Delivery' then 6
              when 'Delivered'        then 7
            end
where route = 'hub'
  and status in ('Order Placed','Packaged','VCO Verified','In Transit',
                 'At Hub','Picked Up','Out for Delivery','Delivered')
  and stage is distinct from (case status
              when 'Order Placed'     then 0
              when 'Packaged'         then 1
              when 'VCO Verified'     then 2
              when 'In Transit'       then 3
              when 'At Hub'           then 4
              when 'Picked Up'        then 5
              when 'Out for Delivery' then 6
              when 'Delivered'        then 7
            end);
