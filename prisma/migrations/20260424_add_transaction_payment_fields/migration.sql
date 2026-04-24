-- PR-1: Transaction 補付款確認欄位
--
-- 目的：
--   為「轉帳待確認 → 店長手動入帳 → 報表只算已收款」流程鋪路。
--   本 migration 僅新增 schema / 欄位 / 索引，不改既有流程，不碰 UI。
--
-- 相容性原則：
--   - paymentStatus 有 @default(SUCCESS)：歷史資料 backfill 為 SUCCESS，新 row 若未指定也為 SUCCESS
--     ⚠️ TRANSFER 交易必須由 application layer 明確寫 paymentStatus = 'PENDING'（PR-3 處理）
--   - paidAt / referenceNo / bankLast5 皆 nullable
--   - paidAt backfill 條件：paidAt IS NULL AND paymentStatus = 'SUCCESS'（避免未來誤填 PENDING 交易）
--   - 只新增一個複合索引 (storeId, paymentStatus, createdAt)，單欄索引暫不建
--   - 不修改既有欄位語意，不重命名，不刪欄位
--
-- 零破壞檢查（本 migration 不影響）：
--   - assignPlanToCustomer / markCompleted / adjustRemainingSessions
--   - 首儲推薦獎勵 sourceKey dedup
--   - /my-plans / 既有 reports query

-- =========================================================================
-- 1. PaymentStatus enum
--    與 TransactionStatus 獨立：status = 交易生命週期；paymentStatus = 收款確認狀態
-- =========================================================================

CREATE TYPE "PaymentStatus" AS ENUM ('SUCCESS', 'PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- =========================================================================
-- 2. Transaction 新增 4 欄位
--    全部有 default 或 nullable，ADD COLUMN 對既有 row 零破壞
-- =========================================================================

ALTER TABLE "Transaction"
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "referenceNo" TEXT,
  ADD COLUMN "bankLast5" TEXT;

-- =========================================================================
-- 3. Backfill：歷史交易 paidAt = createdAt
--    僅對 paymentStatus = 'SUCCESS' 的 row 回填；PENDING（未來才會出現）保持 null
--    WHERE paidAt IS NULL 是防重跑安全網（本 migration 首次執行時所有 row 的 paidAt 都是 null）
-- =========================================================================

UPDATE "Transaction"
SET "paidAt" = "createdAt"
WHERE "paidAt" IS NULL
  AND "paymentStatus" = 'SUCCESS';

-- =========================================================================
-- 4. 複合索引：支援後台「待確認付款」清單 + 店別篩選 + 時間排序
-- =========================================================================

CREATE INDEX "Transaction_storeId_paymentStatus_createdAt_idx"
  ON "Transaction"("storeId", "paymentStatus", "createdAt");
