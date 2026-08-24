-- 049 — Password lifecycle + inactivity lockout.
--
-- Every account now has a password with a shelf life. Three rules, enforced in one
-- place (backend/routes/auth.js evaluateAccess, on BOTH the password and OTP paths):
--
--   1. must_change_password — an admin/system-created login (staff, seeds) ships with
--      a temporary password and MUST be reset before the account can sign in. A
--      self-registered consumer/farmer chose their own password, so the flag is false
--      for them.
--   2. password_changed_at — a password older than 90 days is expired; the account is
--      refused until it is reset (via the existing Forgot-password OTP flow).
--   3. last_login_at + login_locked_at — no successful login for 90 days locks the
--      account (a dedicated lock, NOT the seller `status` machine, so a lapsed-
--      subscription suspension and an inactivity lock never shadow each other). A
--      reset clears the lock.
--
-- Backfill: password_changed_at and last_login_at default to created_at, so existing
-- users start with a fresh 90-day clock rather than being locked out the moment this
-- lands. login_locked_at stays NULL (nobody is locked by the migration itself).
-- Idempotent: ADD COLUMN IF NOT EXISTS, and the backfills only touch NULLs.

alter table users add column if not exists password_changed_at timestamptz;
alter table users add column if not exists last_login_at        timestamptz;
alter table users add column if not exists must_change_password  boolean not null default false;
alter table users add column if not exists login_locked_at       timestamptz;
alter table users add column if not exists login_lock_reason     text;

update users set password_changed_at = coalesce(password_changed_at, created_at, now())
 where password_changed_at is null;

update users set last_login_at = coalesce(last_login_at, created_at, now())
 where last_login_at is null;

-- Inactivity-lock sweeps and login-time expiry checks both filter on these; an index
-- keeps the daily sweep cheap as the user table grows.
create index if not exists users_last_login_at_idx       on users (last_login_at);
create index if not exists users_password_changed_at_idx on users (password_changed_at);
