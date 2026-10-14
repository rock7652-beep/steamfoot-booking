-- Preserve the scheduling choice so fixed and one-time music classes remain
-- distinguishable on the calendar even when they use the same course setup.
ALTER TABLE public."CourseSession"
  ADD COLUMN "scheduleType" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "scheduleFrequency" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE public."CourseSession"
  ADD CONSTRAINT "CourseSession_scheduleType_check"
  CHECK ("scheduleType" IN ('LEGACY', 'FIXED', 'SINGLE', 'TRIAL'));

ALTER TABLE public."CourseSession"
  ADD CONSTRAINT "CourseSession_scheduleFrequency_check"
  CHECK ("scheduleFrequency" IN ('NONE', 'WEEKLY', 'BIWEEKLY'));
