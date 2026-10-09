-- 066 — VCO packing-quality suggestion (one per order).
--
-- Verification is simplified: per line the VCO now only weighs and records the
-- verified quantity (order_items.verified_qty, migration 059). The per-line
-- Good/Fair/Poor/Reject grade is gone from the screen; in its place the VCO may
-- leave ONE optional rating of how the seller packed the parcel.
--
-- It is advisory only — a suggestion for the seller and ops to read. Nothing acts
-- on it: it never notifies, re-prices, rejects or blocks the order. Null = the VCO
-- did not rate it. Idempotent.

alter table orders add column if not exists packing_quality text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_packing_quality_chk'
  ) then
    alter table orders
      add constraint orders_packing_quality_chk
      check (packing_quality is null or packing_quality in ('good', 'fair', 'poor'));
  end if;
end $$;
