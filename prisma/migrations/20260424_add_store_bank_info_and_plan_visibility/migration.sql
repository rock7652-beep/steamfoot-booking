-- PR-2: ShopConfig 補銀行資訊 + ServicePlan 補 publicVisible
--
-- 目的：
--   為 PR-6（前台 /book/shop + 轉帳資訊展示）鋪路。
--   銀行帳號、LINE@ 從硬寫 component 搬進 DB，每店獨立設定。
--   方案分「後台可用」（isActive）與「前台可見」（publicVisible）兩維度。
--
-- 相容性原則：
--   - ShopConfig 4 欄全部 nullable，對既有 row 零破壞
--   - ServicePlan.publicVisible @default(false)：
--     所有現有方案預設「不在前台展示」
--     ⚠️ 前台 /book/shop 尚未實作（PR-6），本 PR 合併後無任何可見變化
--     ⚠️ 後台 isActive 語意不變；assign / 選方案 flow 不看 publicVisible
--   - 無 backfill（全部 nullable 或 boolean default）
--   - 無 rename / drop / 既有欄位語意變更
--
-- 零破壞檢查：
--   - listPlans / assignPlanToCustomer / updateDutyScheduling / getShopConfig
--   - /dashboard/plans / /dashboard/settings / /dashboard/bookings drawer
--   - /my-plans 顧客頁

-- =========================================================================
-- 1. ShopConfig 新增 4 欄：銀行資訊 + LINE@ 連結
--    全部 nullable，無需 backfill，app layer 驗證格式
-- =========================================================================

ALTER TABLE "ShopConfig"
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankCode" TEXT,
  ADD COLUMN "bankAccountNumber" TEXT,
  ADD COLUMN "lineOfficialUrl" TEXT;

-- =========================================================================
-- 2. ServicePlan 新增 publicVisible
--    ⚠️ 預設 false：現有所有方案皆「不在前台展示」，等 PR-5 後台 UI 開啟後手動勾選
--    ⚠️ 本欄僅供前台 query（WHERE isActive=true AND publicVisible=true），
--       後台 isActive flow 不可依賴此欄位
-- =========================================================================

ALTER TABLE "ServicePlan"
  ADD COLUMN "publicVisible" BOOLEAN NOT NULL DEFAULT false;

-- =========================================================================
-- 3. 不需要索引
--    - ShopConfig 已有 storeId unique index
--    - ServicePlan 已有 @@index([storeId])，前台 query 用 storeId 為前綴即足夠
--    - 未來前台流量大時再 PR 補 @@index([storeId, isActive, publicVisible])
-- =========================================================================
