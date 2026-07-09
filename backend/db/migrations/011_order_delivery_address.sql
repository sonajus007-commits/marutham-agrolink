-- Add per-order delivery address (used when the consumer picks a saved address
-- or enters a different delivery address at checkout). Null = use the consumer's
-- registered profile address.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address jsonb;
