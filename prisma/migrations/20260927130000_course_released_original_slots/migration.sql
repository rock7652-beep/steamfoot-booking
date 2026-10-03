-- A class whose teacher is on leave or whose entire roster has taken leave
-- stays visible, while its physical room and teacher slot may host a one-off.
ALTER TABLE "CourseSession" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMPTZ(3);

UPDATE "CourseSession" s SET "releasedAt" = CURRENT_TIMESTAMP
WHERE s."cancelledAt" IS NULL AND NOT EXISTS (SELECT 1 FROM "CourseBooking" b WHERE b."sessionId" = s.id AND b."storeId" = s."storeId" AND b.status <> 'CANCELLED') AND (
  s."teacherAttendance" = 'LEAVE' OR (
    EXISTS (SELECT 1 FROM "CourseBooking" b WHERE b."sessionId" = s.id AND b."storeId" = s."storeId" AND b.status = 'CANCELLED' AND b."absenceKind" IN ('STUDENT_LEAVE', 'GROUP_LEAVE_FORFEITED'))
  )
);

ALTER TABLE "CourseSession" DROP CONSTRAINT IF EXISTS "CourseSession_room_overlap";
ALTER TABLE "CourseSession" DROP CONSTRAINT IF EXISTS "CourseSession_coach_overlap";
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_room_overlap" EXCLUDE USING gist (
  "storeId" WITH =, "roomId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("cancelledAt" IS NULL AND "releasedAt" IS NULL);
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_coach_overlap" EXCLUDE USING gist (
  "storeId" WITH =, "coachId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&
) WHERE ("cancelledAt" IS NULL AND "releasedAt" IS NULL);
