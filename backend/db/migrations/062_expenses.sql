-- 062 — Operating-expense ledger (lightweight, NOT a double-entry accounting system).
--
-- The platform captures money coming IN (order charges, commission, subscriptions) but
-- nothing going OUT, so the Executive dashboard's profit/cost tiles had no data. This is
-- the missing half: the Finance role records what the business spends, and the dashboards
-- compute EBITDA / net profit / cost lines = revenue − expenses.
--
-- Deliberately simple: one row per expense, tagged by a fixed category. It is an
-- OPERATIONAL view, not a compliance/filing tool — GST/TDS liability and a true
-- cash-flow statement are out of scope (see the dashboard route). `amount` is paise
-- (int), like every other money column, so the money middleware converts it. `category`
-- is validated in the route against a closed list; `below_the_line` categories (tax,
-- interest, depreciation) are excluded from EBITDA but included in net profit.
-- created_by is SET NULL so an expense outlives the staffer who booked it.

create table if not exists expenses (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,
  amount          bigint not null check (amount >= 0),
  incurred_on     date not null default (now() at time zone 'utc')::date,
  vendor          text,
  note            text,
  created_by      uuid references users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now()
);

-- The dashboards read "expenses in a period" (by month) and group by category.
create index if not exists expenses_incurred_idx on expenses (incurred_on desc);
create index if not exists expenses_category_idx on expenses (category, incurred_on desc);
