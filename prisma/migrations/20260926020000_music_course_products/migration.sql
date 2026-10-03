ALTER TABLE "CourseTemplate"
  ADD COLUMN IF NOT EXISTS "musicPricePerLesson" INTEGER,
  ADD COLUMN IF NOT EXISTS "musicTermLessons" INTEGER,
  ADD COLUMN IF NOT EXISTS "musicValidityDaysPerTerm" INTEGER,
  ADD COLUMN IF NOT EXISTS "musicScheduleMode" TEXT,
  ADD COLUMN IF NOT EXISTS "musicTrialMode" TEXT,
  ADD COLUMN IF NOT EXISTS "musicTeacherFeeBase" INTEGER;
ALTER TABLE "CoursePointPlan" ADD COLUMN IF NOT EXISTS "musicTerms" INTEGER;
ALTER TABLE "CoursePointCard"
  ADD COLUMN IF NOT EXISTS "musicValidityDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "musicActivatedAt" TIMESTAMPTZ(3);
ALTER TABLE "CoursePointCard" ADD CONSTRAINT "CoursePointCard_music_validity_check"
  CHECK ("musicValidityDays" IS NULL OR "musicValidityDays" BETWEEN 1 AND 3650);
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_music_product_check"
  CHECK (("musicPricePerLesson" IS NULL OR "musicPricePerLesson" BETWEEN 0 AND 1000000)
     AND ("musicTermLessons" IS NULL OR "musicTermLessons" IN (4,8))
     AND ("musicValidityDaysPerTerm" IS NULL OR "musicValidityDaysPerTerm" BETWEEN 1 AND 3650)
     AND ("musicScheduleMode" IS NULL OR "musicScheduleMode" IN ('FIXED','APPOINTMENT'))
     AND ("musicTrialMode" IS NULL OR "musicTrialMode" IN ('FREE','PAID'))
     AND ("musicTeacherFeeBase" IS NULL OR "musicTeacherFeeBase" BETWEEN 0 AND 1000000));
ALTER TABLE "CoursePointPlan" ADD CONSTRAINT "CoursePointPlan_music_terms_check"
  CHECK ("musicTerms" IS NULL OR "musicTerms" BETWEEN 1 AND 100);
ALTER TABLE "CourseCompensationSnapshot"
  ADD COLUMN IF NOT EXISTS "musicPricePerLesson" INTEGER,
  ADD COLUMN IF NOT EXISTS "musicTeacherFeeBase" INTEGER,
  ADD COLUMN IF NOT EXISTS "musicTrialMode" TEXT;

-- Snapshot each selected teacher rule when a class is created or reassigned.
CREATE OR REPLACE FUNCTION course_capture_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE chosen jsonb; rev integer; course_price integer; trial_base integer; trial_mode text;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD."startsAt"<=CURRENT_TIMESTAMP AND (NEW."coachId"<>OLD."coachId" OR NEW."templateId"<>OLD."templateId" OR NEW."startsAt"<>OLD."startsAt" OR NEW."endsAt"<>OLD."endsAt") AND EXISTS (SELECT 1 FROM "CourseCompensationSnapshot" WHERE "sessionId"=OLD.id) THEN
     RAISE EXCEPTION 'Cannot change compensation snapshot of a started course';
   END IF;
   IF NEW."coachId"=OLD."coachId" AND NEW."templateId"=OLD."templateId" THEN RETURN NEW; END IF;
   IF OLD."startsAt"<=CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Cannot change compensation identity of a started course'; END IF;
 END IF;
 SELECT rules->0,revision INTO chosen,rev FROM "CourseCompensation"
 WHERE "storeId"=NEW."storeId" AND "templateId"=NEW."templateId" AND "staffId"=NEW."coachId" AND jsonb_array_length(rules)=1 AND rules->0->>'mode' IN ('CLASS','SHARE');
 SELECT "musicPricePerLesson","musicTeacherFeeBase","musicTrialMode" INTO course_price,trial_base,trial_mode
 FROM "CourseTemplate" WHERE id=NEW."templateId" AND "storeId"=NEW."storeId";
 INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes","musicPricePerLesson","musicTeacherFeeBase","musicTrialMode")
 VALUES (NEW.id,NEW."storeId",NEW."coachId",coalesce(chosen,'{"mode":"CLASS","value":0}'::jsonb),coalesce(rev,0),round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer,course_price,trial_base,trial_mode)
 ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes","musicPricePerLesson"=EXCLUDED."musicPricePerLesson","musicTeacherFeeBase"=EXCLUDED."musicTeacherFeeBase","musicTrialMode"=EXCLUDED."musicTrialMode";
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_capture_compensation() FROM PUBLIC, anon, authenticated;
