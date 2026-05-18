-- PR-1 次月預約開放控管 — 每店「顧客可預約到日期」
--
-- 目的：
--   讓店長控制顧客自助預約（role=CUSTOMER）目前最遠可預約到哪一天，
--   避免顧客提早預約到店長尚未安排營業時間/公休/班表的次月時段。
--
-- 語意：
--   - 含當日：設定 2026-06-15 → 顧客可訂 6/15，不可訂 6/16
--   - 以台灣時間（UTC+8）為準
--
-- 兼容性：
--   - nullable，additive，無需 backfill
--   - null = 回到預設「今天 +14 天」（前台月曆與後端 gate 共用同一邏輯）
--   - 僅限制 role=CUSTOMER 自助預約；後台店長/管理者代客預約不受此欄位限制
--   - 不回溯既有 Booking，不取消/不修改任何既有未來預約

ALTER TABLE "ShopConfig"
  ADD COLUMN "bookableUntilDate" DATE;
