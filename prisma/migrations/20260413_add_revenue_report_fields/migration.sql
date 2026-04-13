-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('SUCCESS', 'CANCELLED', 'REFUNDED');

-- AlterTable: Add revenue report fields to Transaction
ALTER TABLE "Transaction" ADD COLUMN "transactionNo" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transaction" ADD COLUMN "status" "TransactionStatus" NOT NULL DEFAULT 'SUCCESS';
ALTER TABLE "Transaction" ADD COLUMN "coachNameSnapshot" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "coachRoleSnapshot" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "storeNameSnapshot" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "planId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "planNameSnapshot" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "planType" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "grossAmount" DECIMAL(10,0);
ALTER TABLE "Transaction" ADD COLUMN "discountAmount" DECIMAL(10,0);
ALTER TABLE "Transaction" ADD COLUMN "netAmount" DECIMAL(10,0) NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "refundAmount" DECIMAL(10,0) NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "isFirstPurchase" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");
CREATE INDEX "Transaction_storeId_transactionDate_idx" ON "Transaction"("storeId", "transactionDate");
CREATE INDEX "Transaction_revenueStaffId_transactionDate_idx" ON "Transaction"("revenueStaffId", "transactionDate");
CREATE INDEX "Transaction_customerId_transactionDate_idx" ON "Transaction"("customerId", "transactionDate");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_planType_idx" ON "Transaction"("planType");

-- Backfill: Copy existing amount to netAmount for all existing transactions
UPDATE "Transaction" SET "netAmount" = "amount";

-- Backfill: Copy originalAmount to grossAmount where available
UPDATE "Transaction" SET "grossAmount" = "originalAmount" WHERE "originalAmount" IS NOT NULL;

-- Backfill: Set grossAmount = amount where no discount
UPDATE "Transaction" SET "grossAmount" = "amount" WHERE "originalAmount" IS NULL;

-- Backfill: Calculate discountAmount
UPDATE "Transaction" SET "discountAmount" = "grossAmount" - "netAmount" WHERE "grossAmount" IS NOT NULL AND "grossAmount" > "netAmount";

-- Backfill: Set transactionDate from createdAt
UPDATE "Transaction" SET "transactionDate" = "createdAt";

-- Backfill: Mark REFUND transactions as REFUNDED status
UPDATE "Transaction" SET "status" = 'REFUNDED' WHERE "transactionType" = 'REFUND';
