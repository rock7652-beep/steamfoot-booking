-- Nullable preserves legacy teacher-specific compensation. No snapshot backfill.
ALTER TABLE "CourseTemplate" ADD COLUMN "musicTeacherShare" DOUBLE PRECISION;
ALTER TABLE "CourseTemplate" ADD CONSTRAINT "CourseTemplate_musicTeacherShare_check"
 CHECK ("musicTeacherShare" IS NULL OR ("musicTeacherShare" >= 0 AND "musicTeacherShare" <= 1));

CREATE OR REPLACE FUNCTION course_capture_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE chosen jsonb; rev integer; course_price integer; trial_base integer; trial_mode text; teacher_share double precision;
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
 SELECT "musicPricePerLesson","musicTeacherFeeBase","musicTrialMode","musicTeacherShare" INTO course_price,trial_base,trial_mode,teacher_share
 FROM "CourseTemplate" WHERE id=NEW."templateId" AND "storeId"=NEW."storeId";
 -- Explicit product ratio takes precedence for newly scheduled classes only.
 IF teacher_share IS NOT NULL THEN
   chosen=jsonb_build_object('mode','SHARE','value',round((teacher_share*100)::numeric,2));
   rev=1;
 END IF;
 INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes","musicPricePerLesson","musicTeacherFeeBase","musicTrialMode")
 VALUES (NEW.id,NEW."storeId",NEW."coachId",coalesce(chosen,'{"mode":"CLASS","value":0}'::jsonb),coalesce(rev,0),round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer,course_price,trial_base,trial_mode)
 ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes","musicPricePerLesson"=EXCLUDED."musicPricePerLesson","musicTeacherFeeBase"=EXCLUDED."musicTeacherFeeBase","musicTrialMode"=EXCLUDED."musicTrialMode";
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_capture_compensation() FROM PUBLIC, anon, authenticated;
