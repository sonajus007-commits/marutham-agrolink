-- Migration: device_tokens
--
-- Stores the FCM/APNs registration token the native app (Capacitor, see
-- apps/web/src/native/push.ts) hands us after a user signs in, so the backend can
-- target a push at a specific person's device(s).
--
-- The token is globally UNIQUE: a physical device holds exactly one token at a
-- time, and if a different user signs in on it the same token is re-pointed at the
-- new user (the route upserts on `token`). One user may hold many rows — a phone
-- and a tablet — so `user_id` is not unique.
--
-- Idempotent: safe to run against a database that already has the table.

CREATE TABLE IF NOT EXISTS device_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  -- 'android' | 'ios' | 'web' — which platform minted the token.
  platform     text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Fan-out is "give me every token for this user", so index that.
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
