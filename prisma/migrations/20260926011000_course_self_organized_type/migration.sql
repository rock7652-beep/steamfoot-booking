ALTER TABLE "CourseTemplate" DROP CONSTRAINT IF EXISTS "CourseTemplate_classType_check";
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_classType_check"
  CHECK ("classType" IS NULL OR "classType" IN ('PRIVATE', 'SELF_ORGANIZED', 'GROUP'));
