-- 035 — Shop opening hours for RETAILER sellers.
--
-- A farmer sets a per-listing cutoff (when that produce stops taking orders,
-- farmer_listings.time_available / cutoff_ts). A retailer is a shop, not a
-- harvest: their availability belongs to the ACCOUNT, not to each product, so it
-- lives here and every one of their listings inherits it.
--
-- Stored as plain 24-hour clock hours rather than timestamps because these are a
-- recurring daily window, not an instant — "open at 9" is true every day. They are
-- read as IST, the single timezone the business runs in (see packages/lib
-- farmer.ts IST_OFFSET_MINUTES).
--
-- The 8..20 bound is the band the business allows retailers to trade in (8 AM to
-- 8 PM, for ordering and pickup). open < close is enforced too, so a window can
-- never be inverted or empty. Enforced in the DB as well as the API because a bad
-- window silently breaks ordering rather than erroring.
--
-- Nullable with no default: an existing retailer has not chosen yet, and NULL is
-- how the profile screen knows to ask. It is required before they can trade, which
-- the app enforces — not a NOT NULL that would reject every current row.

alter table users
  add column if not exists shop_open_hour  smallint,
  add column if not exists shop_close_hour smallint;

alter table users drop constraint if exists users_shop_hours_band;
alter table users add constraint users_shop_hours_band check (
  (shop_open_hour is null and shop_close_hour is null)
  or (
    shop_open_hour  between 8 and 20
    and shop_close_hour between 8 and 20
    and shop_open_hour < shop_close_hour
  )
);

comment on column users.shop_open_hour  is
  'Retailer only: hour (IST, 24h) the shop starts taking orders. 8..20, < close.';
comment on column users.shop_close_hour is
  'Retailer only: hour (IST, 24h) the shop stops taking orders. 8..20, > open.';
