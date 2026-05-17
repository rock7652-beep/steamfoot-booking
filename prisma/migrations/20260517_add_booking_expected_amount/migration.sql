-- ============================================================
-- Booking.expectedAmount（體驗 499 流程 PR-2）
-- ============================================================
-- 規格：建立體驗預約（FIRST_TRIAL）當下，把預計收款金額快照進此欄。
--   未來體驗價 499→599→699 調整不回寫舊預約；雙人 899 可把其中一筆改 400。
--
-- 安全性：純 ALTER TABLE ADD COLUMN，**nullable、無 default**
--   - 既有 Booking row 自動為 NULL，不需 backfill、不 rewrite table
--   - 不 ALTER 既有欄位、不 DROP/RENAME
--   - 其他預約型別（SINGLE / PACKAGE_SESSION）一律 NULL，行為不變
--   - 不建立 / 不影響 Transaction / Wallet / 營收
--
-- 不可回頭改：本 migration 部署後若需修正，發增量 migration，不修改本檔
-- ============================================================

ALTER TABLE "Booking" ADD COLUMN "expectedAmount" DECIMAL(10,0);
