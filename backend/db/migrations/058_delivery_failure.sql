-- 058 — Failed-delivery attempts.
--
-- A last-mile delivery can fail at the door: the customer is unreachable, absent,
-- refuses the parcel, the address is wrong, or they ask for a later day. Until now
-- an agent who could not complete a drop had NO path — the order stayed "Out for
-- Delivery" with no record of the attempt and no word to the customer.
--
-- This records the attempt WITHOUT advancing the linear stage machine (a failed
-- attempt is an exception, not a forward step): the parcel stays Out for Delivery,
-- re-attemptable, but now carries a visible attempt count and the last reason. The
-- customer is notified (a critical event) and the timeline gets a row per attempt.
-- Ops re-handle from there (retry, reassign via POST /assign, or cancel).

alter table orders add column if not exists delivery_attempts integer not null default 0;
alter table orders add column if not exists last_failure_reason text;
alter table orders add column if not exists last_failure_at    timestamptz;
