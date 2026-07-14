-- Employee removal is a SOFT delete: the row is hidden, never destroyed.
--
-- WHY THE ROW HAS TO SURVIVE. A user is the subject of two append-only histories:
-- the DB audit trigger on `users` (who changed what) and `login_history` (who signed
-- in, when, from where). Both reference the user by id. A hard DELETE has exactly two
-- possible outcomes and both are unacceptable:
--   * ON DELETE CASCADE  -> the audit trail for departed staff is ERASED. The people
--                           whose records you most need to audit are the ones who left.
--   * ON DELETE SET NULL -> the rows survive pointing at nobody. "Who approved this
--                           payout?" becomes permanently unanswerable.
-- So the row stays and is merely marked. Removal is a visibility change, not a data
-- change.
--
-- TWO TABLES, ONE ACT. An employee is an `employees` tracker record; their login is a
-- separate `users` row joined by emp_id (`employees.linked_user_id` exists but is dead
-- — nothing has ever read or written it). Removing an employee must therefore mark
-- BOTH, or the tracker hides them while their login keeps working.
--
-- WHAT IS DELIBERATELY *NOT* DONE HERE:
--
--   1. emp_id stays reserved. A soft-deleted employee keeps MATN00006 forever, and the
--      Employee-ID generator keeps counting past it. Recycling a departed employee's ID
--      onto a new hire would make every historical audit row ambiguous — the ID is the
--      only thing tying those rows to a person.
--
--   2. users.phone stays UNIQUE across live AND deleted rows. This is intentional. It
--      means a removed staff member's phone number cannot be re-registered, and a
--      re-hire must be restored rather than re-created. That is the correct outcome:
--      re-creating them would fork their history into two ids. (If a genuine
--      "same phone, different person" case ever appears, that is when to revisit —
--      not before.)
--
-- Idempotent, like every migration here.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id);

ALTER TABLE users     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE users     ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id);

-- Every list query filters `deleted_at IS NULL`, so index the LIVE rows only. A partial
-- index stays small no matter how much departed staff accumulates.
CREATE INDEX IF NOT EXISTS idx_employees_live ON employees (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_live     ON users     (created_at DESC) WHERE deleted_at IS NULL;

-- requireAuth re-reads the user by id on EVERY authenticated request, and now checks
-- deleted_at there — so this is the hot path that makes a removal take effect
-- immediately rather than whenever the victim's JWT happens to expire.
CREATE INDEX IF NOT EXISTS idx_users_id_live  ON users (id) WHERE deleted_at IS NULL;
