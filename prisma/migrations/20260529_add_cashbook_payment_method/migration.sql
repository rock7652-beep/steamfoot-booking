-- ============================================================
-- Cash Drawer 2.0 / PR-1：CashbookEntry 新增 paymentMethod（現金 / 其他）
-- ============================================================
-- 規格：docs/cash-drawer-spec.md（2.0 決策鎖定）
--
-- 安全性：純增量 — 1 個 CREATE TYPE + 1 個 ADD COLUMN（帶 DEFAULT）+ 1 個 CREATE INDEX
--   · 無 ALTER 既有欄位、無 DROP / RENAME
--   · ADD COLUMN ... NOT NULL DEFAULT 'OTHER' → 既有 CashbookEntry row 全部自動填 OTHER
--   · 歷史資料一律視為「其他」→ 不回溯改帳、後續 PR 上線時不影響任何已結算現金抽屜
--   · 本欄此刻為惰性欄位：不改 CashDrawer 計算、不改 Transaction、不改 report / reconciliation
--
-- 不可回頭改：本 migration 部署後若需修正，發增量 migration，不修改本檔
-- 回退方式：DROP INDEX → DROP COLUMN → DROP TYPE（無資料破壞，因無任何邏輯讀此欄）
-- ============================================================

-- CreateEnum: CashbookPaymentMethod
CREATE TYPE "CashbookPaymentMethod" AS ENUM ('CASH', 'OTHER');

-- AlterTable: CashbookEntry 新增 paymentMethod（既有資料 default OTHER）
ALTER TABLE "CashbookEntry" ADD COLUMN "paymentMethod" "CashbookPaymentMethod" NOT NULL DEFAULT 'OTHER';

-- CreateIndex: 預留 — 後續 PR 依店 + 付款方式聚合現金流
CREATE INDEX "CashbookEntry_storeId_paymentMethod_idx" ON "CashbookEntry"("storeId", "paymentMethod");
