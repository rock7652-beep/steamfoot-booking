-- 顧客經營 v1.6：簡易追蹤紀錄。
-- 純 additive：新增 enum + history table + indexes。不中斷既有顧客分類 / 付款 / wallet 流程。

-- CreateEnum
CREATE TYPE "CustomerFollowUpResult" AS ENUM ('CONTACTED', 'NO_ANSWER', 'BOOKED', 'OTHER');

-- CreateTable
CREATE TABLE "CustomerFollowUp" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "result" "CustomerFollowUpResult" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerFollowUp_customerId_createdAt_idx" ON "CustomerFollowUp"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFollowUp_storeId_createdAt_idx" ON "CustomerFollowUp"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFollowUp_createdByUserId_idx" ON "CustomerFollowUp"("createdByUserId");

-- AddForeignKey
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFollowUp" ADD CONSTRAINT "CustomerFollowUp_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
