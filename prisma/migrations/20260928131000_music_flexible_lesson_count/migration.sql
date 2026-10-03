BEGIN;
ALTER TABLE "CourseTemplate" DROP CONSTRAINT "CourseTemplate_music_product_check";
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_music_product_check"
  CHECK (("musicPricePerLesson" IS NULL OR "musicPricePerLesson" BETWEEN 0 AND 1000000)
     AND ("musicTermLessons" IS NULL OR "musicTermLessons" BETWEEN 1 AND 1000)
     AND ("musicValidityDaysPerTerm" IS NULL OR "musicValidityDaysPerTerm" BETWEEN 1 AND 3650)
     AND ("musicScheduleMode" IS NULL OR "musicScheduleMode" IN ('FIXED','APPOINTMENT'))
     AND ("musicTrialMode" IS NULL OR "musicTrialMode" IN ('FREE','PAID'))
     AND ("musicTeacherFeeBase" IS NULL OR "musicTeacherFeeBase" BETWEEN 0 AND 1000000));
COMMIT;
