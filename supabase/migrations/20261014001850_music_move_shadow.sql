-- Persist visual replacement of a moved lesson without deleting its history.
ALTER TABLE "CourseSession" ADD COLUMN IF NOT EXISTS "rescheduleShadowHidden" boolean NOT NULL DEFAULT false;
UPDATE "CourseSession" old SET "rescheduleShadowHidden"=true
WHERE old."rescheduledFromStartsAt" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "CourseSession" live WHERE live."storeId"=old."storeId" AND live.id<>old.id
    AND live."cancelledAt" IS NULL AND live."releasedAt" IS NULL
    AND (live."roomId"=old."rescheduledFromRoomId" OR live."coachId"=old."rescheduledFromCoachId")
    AND live."startsAt"<old."rescheduledFromEndsAt" AND live."endsAt">old."rescheduledFromStartsAt"
);
