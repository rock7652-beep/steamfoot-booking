-- ============================================================
-- ShopConfig 體驗課設定（體驗客流程 PR-1）
-- ============================================================
-- 規格：每店可設定預設體驗價格 / 是否允許建立時改價 / 價格上下限
--
-- 安全性：純 ALTER TABLE ADD COLUMN，全部 NOT NULL + DEFAULT
--   - 既有 ShopConfig row 自動帶 default，不需 backfill
--   - 不 ALTER 既有欄位、不 DROP/RENAME
--   - Customer / Wallet / Transaction / Booking / ServicePlan 完全不受影響
--   - 既有竹北店營運不受影響（體驗單入口由 app layer 依 trialEnabled 控制）
--
-- 不可回頭改：本 migration 部署後若需修正，發增量 migration，不修改本檔
-- ============================================================

ALTER TABLE "ShopConfig"
  ADD COLUMN "trialEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trialDefaultPrice" DECIMAL(10,0) NOT NULL DEFAULT 499,
  ADD COLUMN "trialAllowPriceEdit" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trialMinPrice" DECIMAL(10,0) NOT NULL DEFAULT 0,
  ADD COLUMN "trialMaxPrice" DECIMAL(10,0) NOT NULL DEFAULT 3000;
