-- 提醒規則：支援相對時間（預約前 X 小時）與固定時間（前一天 20:00）

ALTER TABLE "ReminderRule" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE "ReminderRule" ADD COLUMN IF NOT EXISTS "offsetMinutes" INTEGER;
ALTER TABLE "ReminderRule" ADD COLUMN IF NOT EXISTS "offsetDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ReminderRule" ADD COLUMN IF NOT EXISTS "fixedTime" TEXT;

-- 將既有的 BEFORE_BOOKING_1D 規則設定為 fixed type, 1 day before, 20:00
UPDATE "ReminderRule"
SET "type" = 'fixed', "offsetDays" = 1, "fixedTime" = '20:00'
WHERE "triggerType" = 'BEFORE_BOOKING_1D';

-- 將既有的 BEFORE_BOOKING_2H 規則設定為 relative type, 120 minutes
UPDATE "ReminderRule"
SET "type" = 'relative', "offsetMinutes" = 120
WHERE "triggerType" = 'BEFORE_BOOKING_2H';
