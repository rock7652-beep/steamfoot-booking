-- PR-3d：實際到店人數（FIRST_TRIAL 部分到店流程）
-- additive nullable，舊資料 / 非體驗預約一律保持 NULL；舊版 app 讀此欄位
-- 視為「未記錄」與全到等同（顯示 / 收款 邏輯有 null fallback），與 PR-2
-- expectedAmount 同類 additive，可在 deploy 新版 code 之前先套用。
ALTER TABLE "Booking" ADD COLUMN "attendedPeople" INTEGER;
