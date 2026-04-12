-- Add parentStoreId to Store for multi-store hierarchy
-- parentStoreId = NULL means top-level store (no parent)

ALTER TABLE "Store" ADD COLUMN "parentStoreId" TEXT;

-- Self-referencing foreign key
ALTER TABLE "Store" ADD CONSTRAINT "Store_parentStoreId_fkey"
  FOREIGN KEY ("parentStoreId") REFERENCES "Store"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for hierarchy queries
CREATE INDEX "Store_parentStoreId_idx" ON "Store"("parentStoreId");
