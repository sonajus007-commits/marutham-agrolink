-- Make the double-payment and the duplicate-return IMPOSSIBLE, not merely guarded.
--
-- 466bbad fixed both in application code: the settlement run now refuses to settle
-- if it cannot first read what has already been paid, and the return route now
-- refuses if it cannot check for an existing return. That is the right fix for the
-- symptom. It is not a guarantee.
--
-- An application guard only holds for the code path that runs it. A seed script, a
-- hand-written INSERT in the Supabase SQL editor, a future route, a concurrent
-- second settlement run racing the first between its read and its write — none of
-- them go through that guard. The database is the only thing every path passes
-- through.
--
-- Where the equivalent constraint already exists, it has been quietly doing this
-- job all along: users.phone is UNIQUE, so the registration guard failing open
-- could never actually create a duplicate account — the INSERT was rejected and the
-- caller got a confusing 500 instead of a clean 409. Bad, but not corruption.
-- payouts and returns had no such backstop, which is exactly why they were the two
-- places where a failed read could have caused real damage.
--
-- PAYOUTS. The settlement aggregates one row per (order, farmer). Two rows for the
-- same pair is, by definition, paying a farmer twice for one order.
--
-- RETURNS. The route enforces one return per order ("A return has already been
-- requested for this order"). Nothing enforced it below.
--
-- Both are safe to add: verified no existing rows violate either.

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, and a unique INDEX is what a unique
-- constraint is built on anyway — so this stays idempotent, as every migration here
-- must be.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payouts_order_farmer
  ON payouts (order_id, farmer_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_returns_order
  ON returns (order_id);
