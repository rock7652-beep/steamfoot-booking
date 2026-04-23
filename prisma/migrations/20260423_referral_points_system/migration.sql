-- Phase 1: 推薦分享 + 自動集點系統
--
-- 相容性原則：
--   - 所有新欄位皆為 nullable，舊資料維持現狀，不回填 sponsorId
--   - PointRecord 新增 sourceType + sourceKey（nullable）用於事件去重
--   - 舊 PointRecord 不受影響（sourceType/sourceKey 皆為 NULL）

-- =========================================================================
-- 1. PointType enum：新增 3 個推薦相關類型
-- =========================================================================

ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'REFERRAL_VISITED_SELF';
ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'REFERRAL_CONVERTED_SELF';
ALTER TYPE "PointType" ADD VALUE IF NOT EXISTS 'LINE_JOIN_REFERRER';

-- =========================================================================
-- 2. CheckinPostStatus enum
-- =========================================================================

CREATE TYPE "CheckinPostStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- =========================================================================
-- 3. Customer.referralCode
--    - nullable：舊會員先保留 NULL，由 backfill script / lazy generate 補碼
--    - unique：確保推薦碼唯一；多個 NULL 在 PostgreSQL 被視為 distinct
-- =========================================================================

ALTER TABLE "Customer" ADD COLUMN "referralCode" TEXT;

CREATE UNIQUE INDEX "uq_customer_referral_code" ON "Customer"("referralCode");

-- =========================================================================
-- 4. PointRecord：事件去重欄位
--    - sourceType + sourceKey 組合唯一，搭配 customerId 定位「一次事件」
--    - 例：sourceType='first_visit_referrer', sourceKey='booking:abc123'
--    - 舊資料 sourceType/sourceKey 皆為 NULL，PG 視為 distinct，不會衝突
-- =========================================================================

ALTER TABLE "PointRecord" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "PointRecord" ADD COLUMN "sourceKey"  TEXT;

CREATE UNIQUE INDEX "uq_point_dedupe"
  ON "PointRecord"("customerId", "sourceType", "sourceKey");

-- =========================================================================
-- 5. CheckinPost：蒸足心得 / 打卡貼文（人工審核後記點）
-- =========================================================================

CREATE TABLE "CheckinPost" (
    "id"           TEXT NOT NULL,
    "storeId"      TEXT NOT NULL,
    "customerId"   TEXT NOT NULL,
    "content"      TEXT NOT NULL,
    "imageUrl"     TEXT,
    "status"       "CheckinPostStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt"   TIMESTAMP(3),
    "note"         TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckinPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CheckinPost_storeId_idx"    ON "CheckinPost"("storeId");
CREATE INDEX "CheckinPost_customerId_idx" ON "CheckinPost"("customerId");
CREATE INDEX "CheckinPost_status_idx"     ON "CheckinPost"("status");
CREATE INDEX "CheckinPost_createdAt_idx"  ON "CheckinPost"("createdAt");

ALTER TABLE "CheckinPost"
  ADD CONSTRAINT "CheckinPost_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckinPost"
  ADD CONSTRAINT "CheckinPost_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckinPost"
  ADD CONSTRAINT "CheckinPost_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
