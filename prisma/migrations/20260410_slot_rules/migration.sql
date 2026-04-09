-- 排程規則化：從固定模板改為規則即時運算
-- BusinessHours 新增 slotInterval（時段間隔）和 defaultCapacity（每時段名額）

ALTER TABLE "BusinessHours" ADD COLUMN IF NOT EXISTS "slotInterval" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "BusinessHours" ADD COLUMN IF NOT EXISTS "defaultCapacity" INTEGER NOT NULL DEFAULT 6;

-- SpecialBusinessDay 新增 slotInterval 和 defaultCapacity（nullable = 沿用每週規則）
ALTER TABLE "SpecialBusinessDay" ADD COLUMN IF NOT EXISTS "slotInterval" INTEGER;
ALTER TABLE "SpecialBusinessDay" ADD COLUMN IF NOT EXISTS "defaultCapacity" INTEGER;
