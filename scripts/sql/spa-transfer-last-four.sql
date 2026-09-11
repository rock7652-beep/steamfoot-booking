-- Additive SPA-only reconciliation. Run only against a verified test database.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "SpaReceipt" ADD COLUMN IF NOT EXISTS "transferLast4" VARCHAR(4) CHECK ("transferLast4" IS NULL OR ("paymentMethod" = 'TRANSFER' AND "transferLast4" ~ '^[0-9]{4}$'));
ALTER TABLE "SpaCreditSale" ADD COLUMN IF NOT EXISTS "transferLast4" VARCHAR(4) CHECK ("transferLast4" IS NULL OR ("paymentMethod" = 'TRANSFER' AND "transferLast4" ~ '^[0-9]{4}$'));
ALTER TABLE "SpaRefund" ADD COLUMN IF NOT EXISTS "transferLast4" VARCHAR(4) CHECK ("transferLast4" IS NULL OR ("paymentMethod" = 'TRANSFER' AND "transferLast4" ~ '^[0-9]{4}$'));

ALTER TABLE "SpaReceipt" DROP CONSTRAINT IF EXISTS "SpaReceipt_paymentMethod_check";
ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_paymentMethod_check" CHECK ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT','STORED_VALUE','ENTITLEMENT'));
ALTER TABLE "SpaCreditSale" DROP CONSTRAINT IF EXISTS "SpaCreditSale_paymentMethod_check";
ALTER TABLE "SpaCreditSale" ADD CONSTRAINT "SpaCreditSale_paymentMethod_check" CHECK ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT'));
ALTER TABLE "SpaRefund" DROP CONSTRAINT IF EXISTS "SpaRefund_paymentMethod_check";
ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_paymentMethod_check" CHECK ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT','STORED_VALUE','ENTITLEMENT'));
ALTER TABLE "SpaReceipt" DROP CONSTRAINT IF EXISTS "SpaReceipt_credit_check";
ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_credit_check" CHECK (
 ("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') AND "sourceId" IS NULL AND "balanceAfter" IS NULL AND uses IS NULL)
 OR ("paymentMethod"='STORED_VALUE' AND "sourceId" IS NOT NULL AND "balanceAfter" IS NOT NULL AND "balanceAfter">=0 AND uses IS NULL)
 OR ("paymentMethod"='ENTITLEMENT' AND "sourceId" IS NOT NULL AND "balanceAfter" IS NOT NULL AND "balanceAfter">=0 AND uses IS NOT NULL AND uses>0));
ALTER TABLE "SpaReceipt" DROP CONSTRAINT IF EXISTS "SpaReceipt_release_values";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaReceipt"'::regclass AND conname='SpaReceipt_release_values') THEN ALTER TABLE "SpaReceipt" ADD CONSTRAINT "SpaReceipt_release_values" CHECK (amount>=0 AND currency='TWD' AND (("paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT') AND "sourceId" IS NULL AND "balanceAfter" IS NULL AND uses IS NULL) OR ("paymentMethod"='STORED_VALUE' AND "sourceId" IS NOT NULL AND "balanceAfter">=0 AND "balanceAfter" IS NOT NULL AND uses IS NULL) OR ("paymentMethod"='ENTITLEMENT' AND "sourceId" IS NOT NULL AND "balanceAfter">=0 AND "balanceAfter" IS NOT NULL AND uses>0 AND uses IS NOT NULL))); END IF; END $$;
ALTER TABLE "SpaCreditSale" DROP CONSTRAINT IF EXISTS "SpaCreditSale_release_values";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaCreditSale"'::regclass AND conname='SpaCreditSale_release_values') THEN ALTER TABLE "SpaCreditSale" ADD CONSTRAINT "SpaCreditSale_release_values" CHECK (amount>=0 AND kind IN ('PACKAGE','TOPUP') AND "paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT')); END IF; END $$;
ALTER TABLE "SpaRefund" DROP CONSTRAINT IF EXISTS "SpaRefund_release_values";
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"SpaRefund"'::regclass AND conname='SpaRefund_release_values') THEN ALTER TABLE "SpaRefund" ADD CONSTRAINT "SpaRefund_release_values" CHECK (amount>=0 AND (uses IS NULL OR uses>0) AND length(trim(reason))>0 AND (("saleId" IS NULL) <> ("receiptId" IS NULL)) AND "paymentMethod" IN ('CASH','CARD','TRANSFER','DIGITAL_PAYMENT','STORED_VALUE','ENTITLEMENT')); END IF; END $$;
COMMIT;
