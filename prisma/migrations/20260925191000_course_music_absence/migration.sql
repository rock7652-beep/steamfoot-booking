ALTER TABLE "CourseBooking" ADD COLUMN IF NOT EXISTS "absenceKind" TEXT;
ALTER TABLE "CourseSession"
  ADD COLUMN IF NOT EXISTS "teacherAttendance" TEXT NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS "teacherAttendanceAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "teacherAttendanceById" TEXT,
  ADD COLUMN IF NOT EXISTS "teacherAttendanceReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "teacherMakeupForSessionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CourseSession_teacherMakeupForSessionId_key"
  ON "CourseSession"("teacherMakeupForSessionId");
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
