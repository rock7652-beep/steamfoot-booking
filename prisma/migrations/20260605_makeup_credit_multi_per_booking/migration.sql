-- ============================================================
-- PR-NoShow-1：補課券改為「一筆未到可產生多張」（依 people 數）
-- ============================================================
-- 規格：店長標記未到「扣堂並給 10 日補課資格」時，people=N → 建 N 張券，
--   一張券抵 1 人 / 1 堂；多人預約使用時依最早到期優先（顧客端，下一支 PR）。
--
-- 安全性：純放寬約束 — 1 個 DROP INDEX（unique）+ 1 個 CREATE INDEX（一般）
--   · 不刪資料、不改欄位型別、不動 FK（MakeupCredit_originalBookingId_fkey 保留）
--   · 既有「一筆未到一張券」資料完全相容（一對多容納單筆無虞）
--   · 既有 unique 約束從未被多張券違反過 → DROP 不可能因現有資料失敗
--
-- 不可回頭改：本 migration 部署後若需修正，發增量 migration，不修改本檔
-- 回退方式：DROP INDEX "MakeupCredit_originalBookingId_idx"
--   → CREATE UNIQUE INDEX "MakeupCredit_originalBookingId_key" ON "MakeupCredit"("originalBookingId");
--   （回退前提：DB 內每筆 originalBookingId 仍唯一；若已有多張券則不可回退）
-- ============================================================

-- DropIndex: 解除 originalBookingId 唯一約束（保留 FK）
DROP INDEX "MakeupCredit_originalBookingId_key";

-- CreateIndex: 改為一般 index（revert / 顯示時取某筆未到產生的所有補課券）
CREATE INDEX "MakeupCredit_originalBookingId_idx" ON "MakeupCredit"("originalBookingId");
