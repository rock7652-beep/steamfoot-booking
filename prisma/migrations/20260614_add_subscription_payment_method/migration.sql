-- 店家訂閱：additive 擴充（依 docs/store-subscription-planning.md v2 §0.5 / §2）
-- 純 additive：新增 enum + 2 個 nullable 欄位 + 2 個 index。
-- 不改既有欄位 / enum 值，不碰 UpgradeRequest 流程；舊資料 paymentMethod / updatedBy 一律 NULL。

-- CreateEnum
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD');

-- AlterTable
ALTER TABLE "StoreSubscription" ADD COLUMN     "paymentMethod" "SubscriptionPaymentMethod",
ADD COLUMN     "updatedBy" TEXT;

-- CreateIndex
CREATE INDEX "StoreSubscription_expiresAt_idx" ON "StoreSubscription"("expiresAt");

-- CreateIndex
CREATE INDEX "StoreSubscription_billingStatus_idx" ON "StoreSubscription"("billingStatus");
