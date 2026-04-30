-- ============================================================
-- v2 退款：Transaction 加 refund 欄位 + refunds self-FK + REFUND audit action
-- ============================================================
-- 規格原則：退款不修改原交易；新增一筆負向 REFUND tx，靠 inverse 反查
--
-- 安全性：純 ADD/CREATE，無 DROP/RENAME；新欄位皆 nullable，既有資料不受影響
-- ============================================================

-- AlterEnum: TransactionAuditAction 加入 REFUND
ALTER TYPE "TransactionAuditAction" ADD VALUE 'REFUND';

-- AlterTable: Transaction 加 4 個 refund 欄位（只填在 inverse REFUND tx 上）
ALTER TABLE "Transaction"
  ADD COLUMN "refundOfTransactionId" TEXT,
  ADD COLUMN "refundReason"          TEXT,
  ADD COLUMN "refundedAt"            TIMESTAMP(3),
  ADD COLUMN "refundedByUserId"      TEXT;

-- CreateIndex: 反查某原交易的所有 refund tx
CREATE INDEX "Transaction_refundOfTransactionId_idx"
  ON "Transaction"("refundOfTransactionId");

-- CreateIndex: 報表 / Drawer 同時 filter refund + type 查詢（避免 full scan）
CREATE INDEX "Transaction_refundOfTransactionId_transactionType_idx"
  ON "Transaction"("refundOfTransactionId", "transactionType");

-- CreateIndex: 報表「總收入 / 退款 / 淨收入」依 type+date 分類聚合
CREATE INDEX "Transaction_transactionType_transactionDate_idx"
  ON "Transaction"("transactionType", "transactionDate");

-- AddForeignKey: refundOfTransaction self-FK
-- ON DELETE RESTRICT：原交易禁止刪除（與 v1「交易不可硬刪除」一致；雙重保險）
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_refundOfTransactionId_fkey"
  FOREIGN KEY ("refundOfTransactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: refundedBy User
-- ON DELETE SET NULL：與 v1 voidedBy 一致；User 刪除不卡 refund 紀錄
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_refundedByUserId_fkey"
  FOREIGN KEY ("refundedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
