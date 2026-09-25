-- Opt-in only. Existing RLS and grants remain unchanged.
ALTER TABLE "CourseSettlementSetting"
  ADD COLUMN IF NOT EXISTS "personalIncomeEnabled" BOOLEAN NOT NULL DEFAULT false;
