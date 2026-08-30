-- 057 — Field-staff attendance / duty status.
--
-- The business is transit-only (no stock model): the value in the field is knowing
-- WHO IS ON DUTY today to collect from farmers and run deliveries. This gives each
-- field staffer (VCO, Delivery Agent, Hub Incharge/Manager) a daily check-in /
-- check-out, and managers a live view of who is working — filling the dashboards'
-- vco_attendance / agents_online placeholders.
--
-- One row per staffer per IST work day (unique). `district` is denormalised from the
-- user at check-in so the manager view can scope by area without a join. On duty ⇔
-- checked_in_at set and checked_out_at null. Idempotent throughout.

create table if not exists staff_attendance (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  work_date      date not null,
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  check_in_lat   double precision,
  check_in_lng   double precision,
  district       text,
  admin_role     text,
  created_at     timestamptz not null default now(),
  unique (user_id, work_date)
);

-- The manager view reads "everyone on this date" (optionally by district); the
-- staffer reads their own latest.
create index if not exists staff_attendance_date_idx
  on staff_attendance (work_date, district);

create index if not exists staff_attendance_user_idx
  on staff_attendance (user_id, work_date desc);
