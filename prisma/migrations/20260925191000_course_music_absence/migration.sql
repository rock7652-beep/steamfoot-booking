ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS "absenceKind" TEXT;
ALTER TABLE "CourseSession"
  ADD COLUMN IF NOT EXISTS "teacherAttendance" TEXT NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS "teacherAttendanceAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "teacherAttendanceById" TEXT,
  ADD COLUMN IF NOT EXISTS "teacherAttendanceReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "teacherMakeupForSessionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSession_teacherMakeupForSessionId_key"
  ON "CourseSession"("teacherMakeupForSessionId");
ALTER TABLE "CourseSession" DROP CONSTRAINT IF EXISTS "CourseSession_values_check";
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_values_check" CHECK (
  "endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '480 minutes'
  AND (("pointCost" BETWEEN 1 AND 10000 AND "teacherMakeupForSessionId" IS NULL)
       OR ("pointCost" = 0 AND "teacherMakeupForSessionId" IS NOT NULL))
  AND capacity BETWEEN 1 AND 500 AND "requestIndex" >= 0
);
ALTER TABLE "CourseBooking" DROP CONSTRAINT IF EXISTS "CourseBooking_values";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK (
  status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW')
  AND (("bookingKind" = 'CARD' AND "cardId" IS NOT NULL AND "pointCost" > 0 AND "trialPrice" IS NULL)
       OR ("bookingKind" = 'TRIAL' AND "cardId" IS NULL AND "pointCost" = 0 AND "trialPrice" BETWEEN 0 AND 1000000)
       OR ("bookingKind" = 'TEACHER_MAKEUP' AND "cardId" IS NULL AND "pointCost" = 0 AND "trialPrice" IS NULL))
);
DO $$ BEGIN
  ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_teacher_attendance_check"
    CHECK ("teacherAttendance" IN ('SCHEDULED', 'NO_SHOW', 'LEAVE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_absence_kind_check"
    CHECK ("absenceKind" IS NULL OR "absenceKind" = 'STUDENT_LEAVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
