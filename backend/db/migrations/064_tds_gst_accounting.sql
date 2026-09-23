-- 064 — TDS on seller settlements + net-GST liability (the last true-accounting gaps).
--
-- The dashboards already show real revenue / EBITDA / net profit and GST *collected*
-- (mig 062 expense ledger + monthlyPnl). Two genuine gaps remained, deliberately left
-- unbuilt rather than faked. This closes both:
--
--   1. TDS. As an e-commerce operator, the platform must deduct TDS under §194-O on
--      the gross sale value it facilitates to each seller (0.1% since 1 Oct 2024; 5%
--      when the seller has no PAN; individuals/HUF are exempt below ₹5L gross in the
--      FY). Payouts carried no TDS at all. `amount` stays the GROSS base (unchanged
--      everywhere it is read); cash actually paid to the seller = amount − tds_amount,
--      and tds_amount is the platform's liability to remit.
--   2. Net GST. `gst_collected` was output tax only. Real payable = output − input
--      tax credit (GST the platform itself paid on its expenses). Expenses now carry
--      the recoverable input-GST portion, so the dashboards can net the two.
--
-- `pan` also gives the deductee identity every TDS certificate (Form 16D) needs.

-- Deductee PAN — drives the no-PAN 5% rate and the individual ₹5L exemption check.
alter table users
  add column if not exists pan text;

-- TDS withheld from each settlement. amount = gross (base); net to seller = amount − tds.
alter table payouts
  add column if not exists tds_rate   numeric,
  add column if not exists tds_amount bigint not null default 0;

-- The recoverable input-GST portion of an expense (paise), entered from the invoice.
-- `amount` remains the full cost booked to the P&L; gst_amount is used ONLY to net the
-- GST liability, so EBITDA / net profit are untouched.
alter table expenses
  add column if not exists gst_amount bigint not null default 0;

comment on column users.pan is
  'Seller PAN. Absent → §206AA 5% TDS; present → enables the individual ₹5L §194-O exemption.';
comment on column payouts.tds_amount is
  '§194-O TDS withheld (paise). amount is the gross base; cash paid to seller = amount − tds_amount.';
comment on column payouts.tds_rate is
  'TDS rate applied to this payout (percent): 0 exempt, 0.1 standard, 5 no-PAN.';
comment on column expenses.gst_amount is
  'Recoverable input GST within this expense (paise). Nets output GST → net GST payable; not a P&L cost.';

-- PostgREST caches the schema; without this the new columns 404 through the API
-- until the service is bounced. Harmless if nothing is listening on the channel.
notify pgrst, 'reload schema';
