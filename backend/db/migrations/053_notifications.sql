-- 053 — In-app notifications feed.
--
-- The notifications route only registered push-device tokens; there was no feed a
-- user could actually read. This table backs an in-app bell for every persona —
-- order placed / status change (consumer), new order / payout (seller), approvals
-- and outcomes (all). Push (FCM) and email/SMS ride the SAME events later; this is
-- the always-available channel that needs no external service.
--
-- `data` carries a small routing payload (e.g. {"order_id": "...", "code": "ORD…"})
-- so the client can deep-link the bell item to the right screen. `read_at` null =
-- unread; the bell badge counts those.
-- Idempotent: IF NOT EXISTS throughout.

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The two reads the bell issues: "my recent notifications, newest first" and
-- "my unread count". A partial index keeps the unread count cheap as the table grows.
create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on notifications (user_id)
  where read_at is null;
