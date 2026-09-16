-- 059 — VCO verification: received quantity + quality grade per line.
--
-- At collection the VCO physically checks the goods a seller handed over against the
-- order. Until now "verify" only chose the route and named the delivery agent — the
-- actual quantity received and its condition were never recorded, so a short supply
-- or a poor-quality line left no trace and the seller was never told.
--
-- These columns capture that per order line, all optional (a VCO who only routes the
-- order leaves them null — verify stays backward-compatible). `quality` is a grade,
-- not a workflow state: recording 'rejected' flags the line and notifies the seller;
-- it does not itself cancel or refund (that stays an explicit admin action).

alter table order_items add column if not exists verified_qty numeric;
alter table order_items add column if not exists quality      text;   -- good | fair | poor | rejected
alter table order_items add column if not exists verify_note  text;
