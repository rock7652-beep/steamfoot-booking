-- ============================================================
-- PR-NoShow-2：BookingMakeupCredit join table（一筆預約可用多張補課券）
-- ============================================================
-- 規格：people=N 自助補課預約使用 N 張券；一張券抵 1 人/1 堂、只能用一次。
--   `makeupCreditId` UNIQUE 全域保證一張券不可同時掛兩筆預約（防一張抵兩人）。
--
-- 安全性：純加法 — 1 CREATE TABLE + 3 INDEX + 2 FK + 1 次 backfill INSERT。
--   · 不改既有欄位、不 DROP、不動 Booking.makeupCreditId（保留為 legacy 顯示）。
--   · Backfill 只搬「實際被消耗（isUsed=true）」的 legacy 單張券 → join table；
--     已取消（券已退回 isUsed=false）的舊預約不搬，維持「join row ⟺ isUsed=true」不變式。
--
-- 命名：20260605_pr_noshow2_* 刻意排在同日 add_customer_service_note /
--   makeup_credit_multi_per_booking 之後（a < m < p），確保 migrate deploy 最後套用。
--
-- 不可回頭改：部署後若需修正，發增量 migration，不修改本檔。
-- 回退方式：DROP TABLE "BookingMakeupCredit"（純加表，無破壞；Booking.makeupCreditId 完好）。
-- ============================================================

-- CreateTable
CREATE TABLE "BookingMakeupCredit" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "makeupCreditId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingMakeupCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingMakeupCredit_makeupCreditId_key" ON "BookingMakeupCredit"("makeupCreditId");
CREATE INDEX "BookingMakeupCredit_bookingId_idx" ON "BookingMakeupCredit"("bookingId");
CREATE INDEX "BookingMakeupCredit_storeId_idx" ON "BookingMakeupCredit"("storeId");

-- AddForeignKey
ALTER TABLE "BookingMakeupCredit" ADD CONSTRAINT "BookingMakeupCredit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BookingMakeupCredit" ADD CONSTRAINT "BookingMakeupCredit_makeupCreditId_fkey" FOREIGN KEY ("makeupCreditId") REFERENCES "MakeupCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: 既有單張 makeup 預約（券確實已消耗 isUsed=true）→ join table。
-- id 用 'bmc_' || bookingId（一筆 legacy 預約最多一張券，故唯一；不依賴 pgcrypto）。
INSERT INTO "BookingMakeupCredit" ("id", "bookingId", "makeupCreditId", "customerId", "storeId", "createdAt")
SELECT 'bmc_' || b."id", b."id", b."makeupCreditId", b."customerId", b."storeId", b."createdAt"
FROM "Booking" b
JOIN "MakeupCredit" mc ON mc."id" = b."makeupCreditId"
WHERE b."makeupCreditId" IS NOT NULL
  AND mc."isUsed" = true
ON CONFLICT ("makeupCreditId") DO NOTHING;
