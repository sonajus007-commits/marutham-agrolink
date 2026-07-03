-- ============================================================
-- Phase C: Delivery-side village on orders (hub leg matching)
-- ------------------------------------------------------------
-- orders.village stays the FARMER's fulfilment village (drives VCO +
-- collection-agent matching). For the hub -> doorstep leg, the Hub
-- Incharge needs to match delivery agents to the CONSUMER's village,
-- captured here at order creation from the chosen delivery address
-- (falling back to the consumer's profile village).
-- ============================================================

alter table orders
  add column if not exists delivery_village text;

create index if not exists idx_orders_delivery_village
  on orders(delivery_village);
