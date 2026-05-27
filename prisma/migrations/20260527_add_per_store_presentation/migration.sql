-- PR-E: per-store presentation fields
--
-- 新增 3 個 nullable 欄位，向後相容：
--   Store.liffId          每店 LIFF ID（取代 env-var 對照表）
--   ShopConfig.address    店家地址（顯示用，取代全域常數）
--   ShopConfig.mapUrl     Google Maps 短網址（同上）
--
-- 全 nullable → 既有資料不動、不需 DEFAULT、no data migration。
-- 回退方式：DROP COLUMN（向下相容；programmatic fallback 在 store-resolver 已寫好）。

ALTER TABLE "Store" ADD COLUMN "liffId" TEXT;

ALTER TABLE "ShopConfig" ADD COLUMN "address" TEXT;
ALTER TABLE "ShopConfig" ADD COLUMN "mapUrl" TEXT;
