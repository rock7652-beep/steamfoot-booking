-- ============================================================
-- v1 取消交易：Transaction void + audit log
-- ============================================================
-- 目的：
--   1) 為 TransactionStatus 增加 VOIDED 狀態（軟刪除）
--   2) Transaction 加 voidedAt / voidedByUserId / voidReason 欄位
--   3) 建立 TransactionAuditLog 表記錄交易異動
--
-- 安全性：純 ADD/CREATE，無 DROP/RENAME；新欄位皆 nullable，既有資料不受影響
-- ============================================================

-- CreateEnum
CREATE TYPE "TransactionAuditAction" AS ENUM (
  'UPDATE_NOTE',
  'UPDATE_PAYMENT_METHOD',
  'UPDATE_OWNER_STAFF',
  'VOID'
);

-- AlterEnum: 為 TransactionStatus 加入 VOIDED
ALTER TYPE "TransactionStatus" ADD VALUE 'VOIDED';

-- AlterTable: Transaction 加 void 欄位
ALTER TABLE "Transaction"
  ADD COLUMN "voidReason"     TEXT,
  ADD COLUMN "voidedAt"       TIMESTAMP(3),
  ADD COLUMN "voidedByUserId" TEXT;

-- CreateTable: TransactionAuditLog
CREATE TABLE "TransactionAuditLog" (
    "id"            TEXT NOT NULL,
    "storeId"       TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "actorUserId"   TEXT NOT NULL,
    "action"        "TransactionAuditAction" NOT NULL,
    "beforeJson"    JSONB,
    "afterJson"     JSONB,
    "reason"        TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: TransactionAuditLog 查詢用 index
CREATE INDEX "TransactionAuditLog_transactionId_createdAt_idx"
  ON "TransactionAuditLog"("transactionId", "createdAt");
CREATE INDEX "TransactionAuditLog_storeId_createdAt_idx"
  ON "TransactionAuditLog"("storeId", "createdAt");
CREATE INDEX "TransactionAuditLog_actorUserId_idx"
  ON "TransactionAuditLog"("actorUserId");

-- CreateIndex: 報表用 — 營收統計濾掉 VOIDED 後依日期聚合
CREATE INDEX "Transaction_status_transactionDate_idx"
  ON "Transaction"("status", "transactionDate");

-- AddForeignKey: Transaction.voidedBy → User
-- ON DELETE SET NULL：User 異動時保留 voidedAt/voidReason，避免卡住交易資料
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_voidedByUserId_fkey"
  FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: TransactionAuditLog FKs
-- ON DELETE RESTRICT：保護 audit trail，禁止連帶刪除
ALTER TABLE "TransactionAuditLog"
  ADD CONSTRAINT "TransactionAuditLog_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransactionAuditLog"
  ADD CONSTRAINT "TransactionAuditLog_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransactionAuditLog"
  ADD CONSTRAINT "TransactionAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
