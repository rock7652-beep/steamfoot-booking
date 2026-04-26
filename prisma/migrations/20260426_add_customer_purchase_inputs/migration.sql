-- 顧客自助購買 — 末四碼 + 顧客備註
--
-- 目的：
--   /s/[slug]/book/shop/[planId]/checkout 顧客送單時自填「轉帳末四碼」+「備註」，
--   讓店長 /dashboard/payments 確認入帳時不必再私訊問末四碼。
--
-- 兼容性：
--   - 兩欄皆 nullable，舊資料不需 backfill
--   - 既有 bankLast5（末五碼）保持不變，是「店長對帳側」自填欄位，與 transferLastFour
--     （顧客自報）職責不同，不做合併或重命名
--   - 既有 note（內部備註）保留供 staff 用，customerNote 專門收顧客自填內容

ALTER TABLE "Transaction"
  ADD COLUMN "transferLastFour" TEXT,
  ADD COLUMN "customerNote" TEXT;
