-- Deferred refunds leave net paid above the revised sale total until money is returned.
-- Keep all existing non-negative, freight, and purchase balance safeguards.
ALTER TABLE "InventoryOrder" DROP CONSTRAINT IF EXISTS inventory_order_balances;
ALTER TABLE "InventoryOrder" ADD CONSTRAINT inventory_order_balances CHECK (
  kind IN ('SALE', 'PURCHASE') AND total >= 0 AND paid >= 0
  AND freight >= 0 AND freight <= total
  AND (paid <= total OR (kind = 'SALE' AND jsonb_typeof(settlements) = 'array' AND jsonb_array_length(settlements) > 0))
);
