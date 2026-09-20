-- 063 — Farmer order acceptance window + seller reliability.
--
-- The seller now works an order through Order Received → Order Accepted → Packed,
-- and must ACCEPT within 2 hours of their ordering cutoff (farmer = the listing's
-- cutoff_ts; retailer = that day's shop_close_hour). The instant the deadline is
-- computed at placement it is frozen onto the order, so the sweep and the reminder
-- scheduler can act on a plain timestamp instead of re-deriving it every run.
--
--   • accept_deadline          — cutoff + 2h; the sweep cancels+refunds past this.
--   • received_at / accepted_at — when the seller received / accepted the order.
--   • last_accept_reminder_at   — throttles the 30-min "please accept" reminder.
--
-- Seller reliability: every seller-CAUSED cancellation (missed acceptance, or an
-- explicit decline) lowers the seller's standing, which demotes their offers in the
-- consumer's initial (best-selling) view. Kept as two plain counters so reliability
-- is derived live (fulfilled / (fulfilled + cancelled)); a seller with no history
-- reads as fully reliable. Not on farmers only — a retailer is a seller too.

alter table orders
  add column if not exists accept_deadline         timestamptz,
  add column if not exists received_at             timestamptz,
  add column if not exists accepted_at             timestamptz,
  add column if not exists last_accept_reminder_at timestamptz;

-- The sweep and the reminder scheduler both scan by this, oldest first.
create index if not exists idx_orders_accept_deadline on orders (accept_deadline);

alter table users
  add column if not exists orders_fulfilled integer not null default 0,
  add column if not exists orders_cancelled integer not null default 0;

comment on column orders.accept_deadline is
  'Seller must reach Order Accepted by this instant (cutoff + 2h) or the order is auto-cancelled and refunded.';
comment on column users.orders_fulfilled is
  'Seller reliability: orders this seller accepted+packed. Denominator with orders_cancelled.';
comment on column users.orders_cancelled is
  'Seller reliability: orders cancelled through the seller''s own fault (missed acceptance or decline).';

-- The status VALUE was renamed Packaged → Packed (the display already read "Packed").
-- Migrate any live rows and their timeline labels so the pipeline indexOf still matches.
update orders       set status = 'Packed' where status = 'Packaged';
update order_history set label  = 'Packed' where label  = 'Packaged';

-- PostgREST caches the schema; without this the new columns 404 through the API
-- until the service is bounced. Harmless if nothing is listening on the channel.
notify pgrst, 'reload schema';
