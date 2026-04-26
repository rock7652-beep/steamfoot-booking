-- 單堂明細 + 單堂註銷（PR 1：資料層）
--
-- 目的：
--   為每張 CustomerPlanWallet 建立 N 筆 WalletSession（第 1..N 堂），
--   提供「第 N 堂」的可追蹤狀態與註銷 audit。
--
-- 範圍（本 migration 只動 schema，不做資料 backfill）：
--   - 新增 enum WalletSessionStatus
--   - 新增 WalletSession 表（含 unique(walletId, sessionNo) + 兩個查詢索引）
--   - 不動 CustomerPlanWallet.remainingSessions（仍為 cached counter，由 service 同步）
--
-- 既有錢包 backfill：
--   由 scripts/backfill-wallet-sessions.ts 手動執行（不在 migration 內），
--   原因：backfill 邏輯需 application-level 資訊（completedAt 取 transaction.createdAt 等），
--   且需要 anomaly log，不適合放在純 SQL migration。
--
-- 兼容性：
--   - 新表，不動既有欄位 → 無資料破壞風險
--   - service 層在 PR 1 同步寫 WalletSession + 既有 remainingSessions，
--     既有 25 個讀取點完全不需改

-- 1. enum
CREATE TYPE "WalletSessionStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'COMPLETED', 'VOIDED');

-- 2. table
CREATE TABLE "WalletSession" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "sessionNo" INTEGER NOT NULL,
    "status" "WalletSessionStatus" NOT NULL DEFAULT 'AVAILABLE',
    "bookingId" TEXT,
    "reservedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletSession_pkey" PRIMARY KEY ("id")
);

-- 3. indexes
CREATE UNIQUE INDEX "WalletSession_walletId_sessionNo_key"
    ON "WalletSession"("walletId", "sessionNo");

CREATE INDEX "WalletSession_walletId_status_idx"
    ON "WalletSession"("walletId", "status");

CREATE INDEX "WalletSession_bookingId_idx"
    ON "WalletSession"("bookingId");

-- 4. foreign keys
ALTER TABLE "WalletSession"
    ADD CONSTRAINT "WalletSession_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "CustomerPlanWallet"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WalletSession"
    ADD CONSTRAINT "WalletSession_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WalletSession"
    ADD CONSTRAINT "WalletSession_voidedByStaffId_fkey"
    FOREIGN KEY ("voidedByStaffId") REFERENCES "Staff"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
