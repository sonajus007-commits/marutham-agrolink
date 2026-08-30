-- 052 — Delivery confirmation code (soft OTP).
--
-- A 4-digit code minted for every order at checkout and shown ONLY to the customer.
-- At the doorstep the agent may enter it to confirm the delivery reached the right
-- person; a matching code stamps the timeline "OTP verified".
--
-- Deliberately SOFT, never a hard gate: a delivery is NEVER blocked for a missing
-- code (the customer may be unreachable, or the code not to hand). A blank code
-- still closes the delivery — recorded as "not OTP-verified" for follow-up — so no
-- legitimate delivery is ever stuck. Only a WRONG (non-blank, non-matching) code is
-- refused, because that is a real wrong-recipient signal.
--
-- Nullable: orders placed before this migration simply have no code, and the scan
-- treats a null code as "nothing to verify" — fully backward compatible.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

alter table orders add column if not exists delivery_code text;
