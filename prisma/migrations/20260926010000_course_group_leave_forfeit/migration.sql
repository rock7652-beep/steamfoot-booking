-- A published group class records leave while forfeiting one purchased lesson.
ALTER TABLE "CourseBooking" DROP CONSTRAINT IF EXISTS "CourseBooking_absence_kind_check";
ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_absence_kind_check"
  CHECK ("absenceKind" IS NULL OR "absenceKind" IN ('STUDENT_LEAVE', 'GROUP_LEAVE_FORFEITED'));
