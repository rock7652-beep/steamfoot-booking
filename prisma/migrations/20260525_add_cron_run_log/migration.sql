-- ============================================================
-- CronRunLog — durable evidence of cron invocations (PR-R1)
-- ============================================================
-- 動機：2026-05-23 / 5-24 提醒 cron 連續兩天沒成功跑，但 Vercel Hobby plan 的
-- runtime log 保留只有 ~1 小時，事後無法 forensic。MessageLog 也不夠 —
-- 引擎掃到 0 筆 booking 時根本不會寫 MessageLog，從 DB 無法區分
-- 「cron 沒跑」vs「cron 跑了但沒事做」。
--
-- 本 migration 新增 durable 紀錄：
--   - cron route 進場寫 STARTED
--   - 結束更新 OK / OK_EMPTY / PARTIAL / FAILED + counts
--   - 若 cron 完全沒被 trigger，DB 連 STARTED 都不會有 →
--     dashboard 用「過了 18:30 仍無紀錄」推論 platform-level miss
--
-- 安全性：純 additive — 新增 enum + 新表 + 1 個 index
--   - 不動 MessageLog / ReminderRule / Booking / Customer / Transaction
--   - 新表初始為空；舊 cron route 即使不寫入也不影響其他功能
--   - 無 FK out，刪除 cron run 紀錄不影響其他表
--
-- 不可回頭改：本 migration 部署後若需修正，發增量 migration，不修改本檔
-- ============================================================

-- CreateEnum: cron run lifecycle 狀態機
--   STARTED  → 進場寫入，尚未結束（finishedAt = null）
--   OK       → 全部 sub-task 正常 + 至少送出 1 筆
--   OK_EMPTY → 全部正常但 bookingsScanned = 0（合法的安靜日）
--   PARTIAL  → reminder 子任務完成但其他 sub-task（report snapshot / downgrade ...）fail
--   FAILED   → reminder 子任務 throw
CREATE TYPE "CronRunStatus" AS ENUM ('STARTED', 'OK', 'OK_EMPTY', 'PARTIAL', 'FAILED');

-- CreateTable: CronRunLog
CREATE TABLE "CronRunLog" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "CronRunStatus" NOT NULL DEFAULT 'STARTED',
    "bookingsScanned" INTEGER,
    "sent" INTEGER,
    "skipped" INTEGER,
    "failed" INTEGER,
    "summary" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "CronRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: dashboard 查詢「最近一次 / 今天的 cron run」用 (jobName, startedAt DESC)
-- 不需要其他 index：CronRunLog 是低寫入低讀取（每天 ~1 筆 insert + ~每次 dashboard load 1 query）
CREATE INDEX "CronRunLog_jobName_startedAt_idx" ON "CronRunLog"("jobName", "startedAt" DESC);
