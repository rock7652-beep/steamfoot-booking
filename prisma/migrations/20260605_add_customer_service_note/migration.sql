-- 內部服務備註（店長 / 合作店長交接用，後台限定）。純加法、nullable、可逆（DROP COLUMN 還原）。
-- 顧客前台 / LINE / LIFF / 通知不顯示此欄；不動資料、不動收款 / 方案 / Cashbook / LINE 邏輯。

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "serviceNote" TEXT;
