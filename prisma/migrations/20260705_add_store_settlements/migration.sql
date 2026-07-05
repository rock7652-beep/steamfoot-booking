-- SF-2: Store monthly settlement records
--
-- Additive only:
--   - new StoreSettlementStatus enum
--   - new StoreSettlement table
--   - unique store/month settlement key
--   - supporting indexes and Store FK with cascade
--
-- No existing columns are changed, no backfill, no data mutation.

-- CreateEnum
CREATE TYPE "StoreSettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateTable
CREATE TABLE "StoreSettlement" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "grossRevenue" INTEGER NOT NULL DEFAULT 0,
  "refundAmount" INTEGER NOT NULL DEFAULT 0,
  "netRevenue" INTEGER NOT NULL DEFAULT 0,
  "transactionCount" INTEGER NOT NULL DEFAULT 0,
  "fixedMonthlyFee" INTEGER NOT NULL DEFAULT 0,
  "revenueShareRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "revenueShareAmount" INTEGER NOT NULL DEFAULT 0,
  "additionalAmount" INTEGER NOT NULL DEFAULT 0,
  "deductionAmount" INTEGER NOT NULL DEFAULT 0,
  "finalReceivable" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "status" "StoreSettlementStatus" NOT NULL DEFAULT 'DRAFT',
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoreSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_store_settlement_store_month" ON "StoreSettlement"("storeId", "month");

-- CreateIndex
CREATE INDEX "StoreSettlement_storeId_idx" ON "StoreSettlement"("storeId");

-- CreateIndex
CREATE INDEX "StoreSettlement_month_idx" ON "StoreSettlement"("month");

-- CreateIndex
CREATE INDEX "StoreSettlement_status_idx" ON "StoreSettlement"("status");

-- AddForeignKey
ALTER TABLE "StoreSettlement"
  ADD CONSTRAINT "StoreSettlement_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
