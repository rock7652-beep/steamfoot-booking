-- Additive only. Existing bookings, account links, balances and snapshots remain intact.
-- Rollback: revert application, keep columns/data. Do not drop populated columns.
ALTER TABLE "CourseTemplate" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC', ADD COLUMN "classType" TEXT;
UPDATE "CourseTemplate" SET "visibility"='OFF' WHERE NOT "isActive";
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_visibility_check" CHECK ("visibility" IN ('PUBLIC','HIDDEN','OFF')), ADD CONSTRAINT "CourseTemplate_classType_check" CHECK ("classType" IS NULL OR "classType" IN ('PRIVATE','GROUP'));
ALTER TABLE "CourseRoom" ADD COLUMN "equipment" TEXT NOT NULL DEFAULT '', ADD COLUMN "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Staff" ADD COLUMN "courseCoachEnabled" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "courseQualificationsConfirmed" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "courseQualifiedTemplateIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "courseBirthday" DATE, ADD COLUMN "emergencyContactRelation" TEXT NOT NULL DEFAULT '';
-- Preserve existing course teachers; no new qualification is inferred from history.
UPDATE "Staff" s SET "courseCoachEnabled"=true FROM "Store" st
 WHERE st.id=s."storeId" AND st."industryModule"::text='COURSE'
 AND (EXISTS(SELECT 1 FROM "CourseSession" c WHERE c."storeId"=s."storeId" AND c."coachId"=s.id)
 OR EXISTS(SELECT 1 FROM "StaffMemberLink" l WHERE l."storeId"=s."storeId" AND l."staffId"=s.id)
 OR EXISTS(SELECT 1 FROM "User" u WHERE u.id=s."userId" AND u.role::text='CUSTOMER'));
