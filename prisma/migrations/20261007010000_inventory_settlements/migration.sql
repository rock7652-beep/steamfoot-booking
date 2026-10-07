ALTER TABLE "InventoryOrder" ADD COLUMN "settlements" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "voided" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InventoryPayment" ADD COLUMN "correction" JSONB;
