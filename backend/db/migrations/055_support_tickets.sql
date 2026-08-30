-- 055 — Support tickets (in-app help desk).
--
-- The company has no phone/email support wired yet, and the AdminHead dashboard
-- already flags `support_tickets` as an unbuilt module. This gives any signed-in
-- user a way to raise an issue in the app, and staff (the customer_complaints RBAC
-- module) a queue to work it — no call centre, no external tooling.
--
-- v1 is a ticket + a staff resolution note, not a full chat thread: a user raises
-- {subject, message}, optionally tied to an order; staff move it open → in_progress
-- → resolved and leave an `admin_note` the user sees. Every status change notifies
-- the owner through the in-app bell (migration 053). Idempotent throughout.

create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  subject     text not null,
  message     text not null,
  category    text,
  order_id    uuid references orders(id),
  status      text not null default 'open',   -- open | in_progress | resolved
  assigned_to uuid references users(id),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The user reads "my tickets"; the staff queue reads "everything open", both newest
-- first.
create index if not exists support_tickets_user_idx
  on support_tickets (user_id, created_at desc);

create index if not exists support_tickets_status_idx
  on support_tickets (status, created_at desc);
