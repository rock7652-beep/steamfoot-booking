-- MessageLog 加入 triggerAt 欄位 + (ruleId, bookingId, triggerAt) 唯一索引
--
-- 目的：
--   1. 修正提醒系統 dedup 邏輯：原本 (ruleId, bookingId) 會導致改期後 triggerAt 變更
--      仍被誤判為「已發送過」，顧客收不到新時間的提醒。
--   2. 新規則：同 ruleId + bookingId + triggerAt 才算同一筆提醒；triggerAt 不同 → 可重發。
--
-- 範圍：
--   - 新增 triggerAt 欄位（nullable）— 既有 row 為 NULL，不需 backfill
--   - 新增 unique (ruleId, bookingId, triggerAt) — Postgres 對 NULL 不視為相等，
--     既有 NULL 行不會違反唯一性
--   - 移除舊的 idx_rule_booking 非唯一索引（被新 unique 索引的 prefix 覆蓋）
--
-- 兼容性：
--   - 舊的 SENT/PENDING log（triggerAt = NULL）不會擋掉新 tick 的同預約發送，
--     但目前 production 提醒系統幾乎沒成功發送過（cron 排程錯誤），影響面極小。
--   - 新引擎一律寫入 triggerAt，未來新行皆有值。

-- 1. 新增欄位（nullable）
ALTER TABLE "MessageLog"
    ADD COLUMN "triggerAt" TIMESTAMP(3);

-- 2. 移除舊索引（被 unique 索引覆蓋）
DROP INDEX IF EXISTS "idx_rule_booking";

-- 3. 新增 unique 索引（dedup 用）
CREATE UNIQUE INDEX "uniq_rule_booking_trigger"
    ON "MessageLog"("ruleId", "bookingId", "triggerAt");
