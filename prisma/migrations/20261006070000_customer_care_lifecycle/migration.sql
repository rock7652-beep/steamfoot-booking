ALTER TABLE "CustomerFollowUp"
  ADD COLUMN IF NOT EXISTS "careReason" TEXT,
  ADD COLUMN IF NOT EXISTS "careYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "nextFollowUpDate" DATE;
CREATE INDEX IF NOT EXISTS "CustomerFollowUp_storeId_customerId_careReason_createdAt_idx"
  ON "CustomerFollowUp" ("storeId", "customerId", "careReason", "createdAt");
