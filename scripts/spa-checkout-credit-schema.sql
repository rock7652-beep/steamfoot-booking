-- Apply after spa-checkout-schema.sql, only after verifying the target database.
-- Existing SpaEntitlement and SpaStoredValue tables must be present.
ALTER TABLE "SpaReceipt" ADD COLUMN "sourceId" TEXT,
 ADD COLUMN "balanceAfter" DECIMAL(10,0), ADD COLUMN uses INTEGER;
ALTER TABLE "SpaReceipt" DROP CONSTRAINT "SpaReceipt_paymentMethod_check";
ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_paymentMethod_check"
 CHECK ("paymentMethod" IN ('CASH','CARD','STORED_VALUE','ENTITLEMENT'));
ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_credit_check" CHECK (
 ("paymentMethod" IN ('CASH','CARD') AND "sourceId" IS NULL AND "balanceAfter" IS NULL AND uses IS NULL)
 OR ("paymentMethod"='STORED_VALUE' AND "sourceId" IS NOT NULL AND "balanceAfter" IS NOT NULL AND "balanceAfter">=0 AND uses IS NULL)
 OR ("paymentMethod"='ENTITLEMENT' AND "sourceId" IS NOT NULL AND "balanceAfter" IS NOT NULL AND "balanceAfter">=0 AND uses IS NOT NULL AND uses>0)
);
