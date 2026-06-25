-- Migration: structured order & return codes
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).

-- Counter table: one row per (district_code, date, type).
-- next_seq stores the LAST issued sequence number; the DB function increments it
-- atomically before returning so callers always receive unique, monotonically
-- increasing values within each (district, date, type) partition.
CREATE TABLE IF NOT EXISTS code_counters (
  district_code  TEXT    NOT NULL,
  date           TEXT    NOT NULL,   -- YYMMDD in IST
  type           TEXT    NOT NULL CHECK (type IN ('order', 'return')),
  next_seq       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (district_code, date, type)
);

-- Atomically returns and increments the next sequence number.
--
-- HOW UNIQUENESS IS GUARANTEED:
--   INSERT ON CONFLICT DO UPDATE is a single atomic statement in PostgreSQL.
--   When two sessions race on the same (district_code, date, type) row:
--     • One succeeds with INSERT → returns 1.
--     • The other is blocked by the row-level lock PostgreSQL acquires during
--       the conflicting UPDATE, then proceeds after the first commits.
--     • The second session reads the committed next_seq (e.g. 1) and
--       increments it to 2 — a distinct value.
--   Neither session can see the other's value before it commits, so duplicates
--   are impossible even at the exact same millisecond.
--
-- OVERFLOW: next_seq is INTEGER (max ~2.1 billion). At 999,999 per district per
-- day the column simply keeps growing; padStart(6,'0') in JS yields 7+ digit
-- suffixes for seq ≥ 1,000,000 — the code grows but never rolls over or repeats.
CREATE OR REPLACE FUNCTION next_code_seq(
  p_district_code TEXT,
  p_date          TEXT,
  p_type          TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO code_counters (district_code, date, type, next_seq)
    VALUES (p_district_code, p_date, p_type, 1)
    ON CONFLICT (district_code, date, type)
    DO UPDATE SET next_seq = code_counters.next_seq + 1
    RETURNING next_seq INTO v_seq;
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;
