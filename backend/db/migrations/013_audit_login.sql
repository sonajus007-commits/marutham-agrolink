-- ============================================================
-- USER AUDIT TRAIL + LOGIN HISTORY
-- Run in the Supabase SQL Editor.
-- ============================================================
-- 1) user_audit_log  — a database trigger records EVERY change to
--    a users row (INSERT / UPDATE / DELETE), with old→new values.
--    This is comprehensive: it fires regardless of which code path
--    (or even a manual edit in Supabase) made the change.
--    password_hash is never stored; updated_at-only changes are ignored.
-- 2) user_login_history — one row per login attempt (written by the
--    app), for quality + security auditing.
-- ============================================================

-- ── 1. USER RECORD AUDIT TRAIL ──────────────────────────────
CREATE TABLE IF NOT EXISTS user_audit_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID,                 -- the users row that changed
  action         TEXT NOT NULL,        -- INSERT | UPDATE | DELETE
  changed_by     UUID,                 -- app actor if set via app.current_user_id (else NULL)
  changed_fields JSONB,                -- UPDATE: { field: { old, new }, ... }
  row_snapshot   JSONB,                -- INSERT/DELETE: full row (minus password_hash)
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_user ON user_audit_log(user_id, changed_at DESC);

CREATE OR REPLACE FUNCTION log_user_changes() RETURNS trigger AS $$
DECLARE
  oldj  JSONB;
  newj  JSONB;
  diff  JSONB := '{}'::jsonb;
  k     TEXT;
  actor UUID;
BEGIN
  -- Optional: app may set `SET LOCAL app.current_user_id = '<uuid>'` in the
  -- same transaction to record who made the change; otherwise NULL.
  BEGIN
    actor := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    actor := NULL;
  END;

  IF (TG_OP = 'UPDATE') THEN
    oldj := to_jsonb(OLD) - 'password_hash';
    newj := to_jsonb(NEW) - 'password_hash';
    FOR k IN SELECT jsonb_object_keys(newj) LOOP
      IF k <> 'updated_at' AND (oldj -> k) IS DISTINCT FROM (newj -> k) THEN
        diff := diff || jsonb_build_object(k, jsonb_build_object('old', oldj -> k, 'new', newj -> k));
      END IF;
    END LOOP;
    IF diff <> '{}'::jsonb THEN
      INSERT INTO user_audit_log(user_id, action, changed_by, changed_fields)
      VALUES (NEW.id, 'UPDATE', actor, diff);
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO user_audit_log(user_id, action, changed_by, row_snapshot)
    VALUES (NEW.id, 'INSERT', actor, to_jsonb(NEW) - 'password_hash');
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO user_audit_log(user_id, action, changed_by, row_snapshot)
    VALUES (OLD.id, 'DELETE', actor, to_jsonb(OLD) - 'password_hash');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_audit ON users;
CREATE TRIGGER trg_user_audit
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION log_user_changes();

-- ── 2. LOGIN HISTORY ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_login_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  login_id    TEXT,               -- identifier entered (phone / login id)
  method      TEXT,               -- password | otp
  success     BOOLEAN NOT NULL DEFAULT true,
  outcome     TEXT,               -- success | invalid_credentials | blocked | pending_review | rejected | otp_invalid
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_login_history_user ON user_login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_history_time ON user_login_history(created_at DESC);
