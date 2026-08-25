CREATE TABLE "CustomerHealthHistoryGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetStoreId" TEXT NOT NULL,
  "targetCustomerId" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerHealthHistoryGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerHealthHistoryGrant_targetStoreId_targetCustomerId_revokedAt_idx"
  ON "CustomerHealthHistoryGrant"("targetStoreId", "targetCustomerId", "revokedAt");
CREATE INDEX "CustomerHealthHistoryGrant_userId_revokedAt_idx"
  ON "CustomerHealthHistoryGrant"("userId", "revokedAt");

-- 同一顧客對同一新門市同時只能有一筆有效授權；已撤回的週期仍完整保留。
CREATE UNIQUE INDEX "CustomerHealthHistoryGrant_active_key"
  ON "CustomerHealthHistoryGrant"("userId", "targetStoreId", "targetCustomerId")
  WHERE "revokedAt" IS NULL;

ALTER TABLE "CustomerHealthHistoryGrant"
  ADD CONSTRAINT "CustomerHealthHistoryGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerHealthHistoryGrant"
  ADD CONSTRAINT "CustomerHealthHistoryGrant_targetStoreId_fkey"
  FOREIGN KEY ("targetStoreId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerHealthHistoryGrant"
  ADD CONSTRAINT "CustomerHealthHistoryGrant_targetCustomerId_fkey"
  FOREIGN KEY ("targetCustomerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 不提供 anon/authenticated REST policy。正式讀寫只經過應用程式的 session、
-- customer.read、目標門市與顧客明確授權檢查。
ALTER TABLE "CustomerHealthHistoryGrant" ENABLE ROW LEVEL SECURITY;
