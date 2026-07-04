-- ============================================================
-- MARUTHAM AGROLINK - Database Schema (PostgreSQL / Supabase)
-- Derived from the working prototype's data models.
-- Run this in Supabase: SQL Editor -> paste -> Run.
-- ============================================================
-- Notes:
--  * Money is stored in paise (integer) to avoid float errors. Rs.21.50 = 2150.
--  * IDs use UUIDs (Supabase generates them). Human codes (loginId, order code)
--    are stored as separate readable columns.
--  * Timestamps default to now(); tracking events live in their own table.
-- ============================================================

-- Needed for uuid generation
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. USERS  (consumers, farmers, and all admin sub-roles)
-- ------------------------------------------------------------
-- role: 'consumer' | 'farmer' | 'admin'
-- admin_role (only when role='admin'):
--   'Head Office' | 'State Head' | 'Regional Manager' |
--   'District Manager' | 'Hub Incharge' | 'VCO' | 'Delivery Agent'
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  login_id        text unique not null,          -- e.g. CNTNPDK_PRI4X2
  phone           text unique not null,
  country_code    text default '+91',
  password_hash   text not null,                 -- NEVER store plain passwords
  role            text not null check (role in ('consumer','farmer','admin')),
  admin_role      text,                          -- set only when role='admin'
  status          text not null default 'active' check (status in ('active','blocked')),

  fname           text not null,
  lname           text,
  email           text,
  alt_phone       text,

  -- address
  house_no        text,
  street1         text,
  street2         text,
  landmark        text,
  village_town    text,                          -- "vt" in prototype
  city            text,
  district        text,
  pincode         text,
  state           text,
  country         text default 'India',

  -- farmer-only
  aadhar          text,
  bank_name       text,
  bank_account    text,
  ifsc            text,

  -- admin-only
  emp_id          text,                          -- Employee ID → employees.emp_id
  employment_type text,                          -- 'Permanent' | 'Contract'
  district_assign text,                          -- District Manager's district
  vco_city        text,                          -- VCO / Agent base village
  agent_vehicle   text,                          -- Delivery Agent / VCO / Hub vehicle no.

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_users_role     on users(role);
create index if not exists idx_users_district on users(district);
create index if not exists idx_users_village  on users(village_town);
create index if not exists idx_users_emp_id   on users(emp_id);

-- ------------------------------------------------------------
-- 1b. EMPLOYEES  (HR employee master / "employee tracker")
-- ------------------------------------------------------------
-- Company-wide master of every employee's personal + company
-- details. Staff login accounts link here by Employee ID
-- (users.emp_id == employees.emp_id). Permanent staff must match
-- an ACTIVE row here (enforced in the app). Full DDL + trigger
-- live in migration_employee_tracker.sql.
create table if not exists employees (
  id                uuid primary key default gen_random_uuid(),
  emp_id            text unique not null,          -- Employee ID: MA+state+5-digit, e.g. MATN00001
  -- personal
  fname             text not null,
  lname             text,
  gender            text,
  dob               date,
  phone             text,
  email             text,
  aadhar            text,
  address_line      text,
  village_town      text,
  city              text,
  taluk             text,
  district          text,
  state             text,
  pincode           text,
  -- company
  designation       text,
  department        text,
  employment_type   text not null default 'Permanent',
  date_of_joining   date,
  work_location     text,
  work_district     text,
  work_state        text,
  reporting_manager text,
  -- lifecycle
  status            text not null default 'active',
  linked_user_id    uuid references users(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_employees_emp_id on employees(emp_id);
create index if not exists idx_employees_status on employees(status);

-- ------------------------------------------------------------
-- 2. PRODUCTS  (the catalogue - managed by Head Office)
-- ------------------------------------------------------------
create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,        -- e.g. p01
  product_group     text,                        -- group/category grouping
  category          text,
  sub_type          text,
  name              text not null,
  regional_name     text,
  unit              text not null,               -- kg, bunch, piece...
  exotic            boolean not null default false,
  platform_fee_pct  numeric(5,2) not null default 5,  -- baked into consumer price
  available         boolean not null default true,    -- Active / Inactive status
  price_date        date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Government/market reference prices per district (for "you saved vs market")
create table if not exists product_district_prices (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  district     text not null,
  market_price integer not null,                 -- paise
  handling     integer not null default 0,       -- paise (exotic handling)
  unique (product_id, district)
);

-- ------------------------------------------------------------
-- 3. FARMER LISTINGS  (a farmer's daily offer of a product)
-- ------------------------------------------------------------
create table if not exists farmer_listings (
  id               uuid primary key default gen_random_uuid(),
  farmer_id        uuid not null references users(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  farmer_price     integer not null,             -- paise, what the farmer charges
  qty_available    numeric(10,2) not null default 0,
  listed           boolean not null default true,
  confirmed        boolean not null default false,  -- confirmed for next day
  time_available   text,
  cutoff_ts        timestamptz,
  bulk_qty         numeric(10,2),                -- optional bulk discount threshold
  bulk_disc_pct    numeric(5,2),
  image_date       date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (farmer_id, product_id)
);
create index if not exists idx_listings_farmer  on farmer_listings(farmer_id);
create index if not exists idx_listings_product on farmer_listings(product_id);

-- ------------------------------------------------------------
-- 4. ORDERS
-- ------------------------------------------------------------
-- stage is route-aware; status holds the human label.
-- route: '' (unset) | 'hub' | 'direct'
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,         -- e.g. ORD1234
  consumer_id      uuid references users(id),
  consumer_name    text,
  district         text,
  village          text,                         -- fulfilment village (farmer's)
  delivery_address jsonb,                         -- chosen/entered delivery address; null = use consumer profile address

  -- money (all paise)
  item_total       integer not null default 0,
  handling         integer not null default 0,
  market_fee       integer not null default 0,
  delivery         integer not null default 0,
  total            integer not null default 0,
  saved            integer not null default 0,

  pay_method       text,                         -- UPI / Card / Cash on Delivery
  pay_status       text,

  -- delivery workflow
  stage            integer not null default 0,   -- index into the route's stage list
  status           text not null default 'Order Placed',
  route            text not null default '',
  route_auto       text,
  agent_id         uuid references users(id),
  agent_name       text,
  agent_phone      text,
  agent_vehicle    text,
  picked_up_at     timestamptz,
  eta_ts           timestamptz,
  delivered_at     timestamptz,                  -- starts the return window

  -- cancellation
  cancelled        boolean not null default false,
  cancel_reason    text,
  cancelled_at     timestamptz,
  refund_amt       integer,                      -- paise
  refund_to        text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_orders_consumer on orders(consumer_id);
create index if not exists idx_orders_agent     on orders(agent_id);
create index if not exists idx_orders_district  on orders(district);
create index if not exists idx_orders_village   on orders(village);
create index if not exists idx_orders_stage     on orders(stage);

-- ------------------------------------------------------------
-- 5. ORDER ITEMS  (lines within an order)
-- ------------------------------------------------------------
create table if not exists order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       uuid references products(id),
  product_code     text,
  name             text,
  farmer_id        uuid references users(id),
  farmer_name      text,

  qty              numeric(10,2) not null,
  unit             text,
  price            integer not null,             -- paise, consumer price (fee baked in)
  farmer_price     integer not null,             -- paise, farmer's cut
  base_farmer_price integer,
  govt_price       integer,                      -- paise, market reference

  -- rating (filled after delivery)
  rated            boolean not null default false,
  rating_value     integer check (rating_value between 1 and 5),
  rated_at         timestamptz
);
create index if not exists idx_items_order   on order_items(order_id);
create index if not exists idx_items_farmer  on order_items(farmer_id);
create index if not exists idx_items_product on order_items(product_id);

-- ------------------------------------------------------------
-- 6. ORDER HISTORY  (timestamped status timeline)
-- ------------------------------------------------------------
create table if not exists order_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  label      text not null,                      -- "VCO Verified", "Out for Delivery"...
  note       text,
  ts         timestamptz not null default now()
);
create index if not exists idx_history_order on order_history(order_id);

-- ------------------------------------------------------------
-- 7. RETURNS  (refund-only; replacement was removed by design)
-- ------------------------------------------------------------
create table if not exists returns (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,            -- e.g. RET123
  order_id      uuid not null references orders(id) on delete cascade,
  full_return   boolean not null default false,
  decision      text,                            -- null | 'accepted' | 'rejected'
  collected     boolean not null default false,
  refund_amt    integer,                         -- paise (product value only)
  refund_to     text,
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz
);
create table if not exists return_lines (
  id           uuid primary key default gen_random_uuid(),
  return_id    uuid not null references returns(id) on delete cascade,
  product_code text,
  name         text,
  farmer_name  text,
  qty          numeric(10,2) not null,
  unit         text,
  price        integer not null,                 -- paise
  reason       text
);
create table if not exists return_photos (
  id         uuid primary key default gen_random_uuid(),
  return_id  uuid not null references returns(id) on delete cascade,
  url        text not null                        -- stored in object storage
);
create index if not exists idx_returns_order on returns(order_id);

-- ------------------------------------------------------------
-- 8. PRODUCT RATINGS (aggregate, per farmer's product)
--    Optional rollup table; can also be computed live from order_items.
-- ------------------------------------------------------------
create table if not exists product_ratings (
  id           uuid primary key default gen_random_uuid(),
  farmer_id    uuid references users(id),
  product_id   uuid references products(id),
  sum_stars    integer not null default 0,
  num_ratings  integer not null default 0,
  unique (farmer_id, product_id)
);

-- ------------------------------------------------------------
-- 9. PAYOUTS  (farmer settlements - integrate Razorpay Route later)
-- ------------------------------------------------------------
create table if not exists payouts (
  id           uuid primary key default gen_random_uuid(),
  farmer_id    uuid not null references users(id),
  order_id     uuid references orders(id),
  amount       integer not null,                 -- paise
  status       text not null default 'pending',  -- pending | paid | failed
  method       text,
  reference    text,                             -- gateway reference id
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists idx_payouts_farmer on payouts(farmer_id);

-- ============================================================
-- END OF SCHEMA
-- After running this, your Supabase "Table Editor" will show all
-- these tables, empty and ready. The backend (built next) reads/writes them.
-- ============================================================
