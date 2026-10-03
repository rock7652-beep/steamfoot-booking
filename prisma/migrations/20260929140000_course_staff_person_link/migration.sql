CREATE TABLE "CourseStaffPersonLink" (
  id TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "managerStaffId" TEXT NOT NULL,
  "instructorStaffId" TEXT NOT NULL,
  "linkedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseStaffPersonLink_pkey" PRIMARY KEY (id),
  CONSTRAINT "CourseStaffPersonLink_distinct_staff" CHECK ("managerStaffId" <> "instructorStaffId")
);

CREATE UNIQUE INDEX "CourseStaffPersonLink_managerStaffId_storeId_key" ON "CourseStaffPersonLink"("managerStaffId", "storeId");
CREATE UNIQUE INDEX "CourseStaffPersonLink_instructorStaffId_storeId_key" ON "CourseStaffPersonLink"("instructorStaffId", "storeId");
CREATE INDEX "CourseStaffPersonLink_storeId_idx" ON "CourseStaffPersonLink"("storeId");
ALTER TABLE "CourseStaffPersonLink" ADD CONSTRAINT "CourseStaffPersonLink_managerStaffId_storeId_fkey" FOREIGN KEY ("managerStaffId", "storeId") REFERENCES "Staff"(id, "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseStaffPersonLink" ADD CONSTRAINT "CourseStaffPersonLink_instructorStaffId_storeId_fkey" FOREIGN KEY ("instructorStaffId", "storeId") REFERENCES "Staff"(id, "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseStaffPersonLink" ADD CONSTRAINT "CourseStaffPersonLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseStaffPersonLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CourseStaffPersonLink" FROM anon, authenticated;

ALTER TABLE "Staff" ADD COLUMN "courseDefaultClassFee" NUMERIC(10,0);
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_courseDefaultClassFee_nonnegative" CHECK ("courseDefaultClassFee" IS NULL OR "courseDefaultClassFee" BETWEEN 0 AND 1000000);

-- Preserve old session snapshots; resolve coach default only when creating or reassigning a class.
CREATE OR REPLACE FUNCTION course_capture_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE chosen jsonb; rev integer; course_price integer; trial_base integer; trial_mode text; teacher_share double precision; subject_id text; settings record; source text; is_music boolean; default_class_fee numeric(10,0);
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD."startsAt"<=CURRENT_TIMESTAMP AND (NEW."coachId"<>OLD."coachId" OR NEW."templateId"<>OLD."templateId" OR NEW."startsAt"<>OLD."startsAt" OR NEW."endsAt"<>OLD."endsAt") AND EXISTS (SELECT 1 FROM "CourseCompensationSnapshot" WHERE "sessionId"=OLD.id) THEN
     RAISE EXCEPTION 'Cannot change compensation snapshot of a started course';
   END IF;
   IF NEW."coachId"=OLD."coachId" AND NEW."templateId"=OLD."templateId" THEN RETURN NEW; END IF;
   IF OLD."startsAt"<=CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Cannot change compensation identity of a started course'; END IF;
 END IF;
 SELECT EXISTS(SELECT 1 FROM "StoreFeatureEntitlement" WHERE "storeId"=NEW."storeId" AND "featureKey"='business.music' AND status::text='ENABLED') INTO is_music;
 SELECT rules->0,revision INTO chosen,rev FROM "CourseCompensation"
 WHERE "storeId"=NEW."storeId" AND "templateId"=NEW."templateId" AND "staffId"=NEW."coachId" AND jsonb_array_length(rules)=1 AND rules->0->>'mode' IN ('CLASS','SHARE');
 SELECT "musicPricePerLesson","musicTeacherFeeBase","musicTrialMode","musicTeacherShare","musicSubjectId" INTO course_price,trial_base,trial_mode,teacher_share,subject_id
 FROM "CourseTemplate" WHERE id=NEW."templateId" AND "storeId"=NEW."storeId";
 source='PLAN_OVERRIDE';
 IF is_music AND chosen IS NULL THEN
   SELECT "defaultRatio","subjectRules",revision INTO settings FROM "CourseTeacherCompensationSetting" WHERE "storeId"=NEW."storeId" AND "staffId"=NEW."coachId";
   IF settings."subjectRules" ? subject_id THEN
     chosen=settings."subjectRules"->subject_id; rev=settings.revision; source='SUBJECT_OVERRIDE';
   ELSIF settings."defaultRatio" IS NOT NULL THEN
     chosen=jsonb_build_object('mode','SHARE','value',settings."defaultRatio"*100); rev=settings.revision; source='TEACHER_DEFAULT';
   ELSIF teacher_share IS NOT NULL THEN
     chosen=jsonb_build_object('mode','SHARE','value',round((teacher_share*100)::numeric,2)); rev=1; source='PRODUCT_DEFAULT';
   END IF;
 END IF;
 IF NOT is_music AND chosen IS NULL THEN
   SELECT "courseDefaultClassFee" INTO default_class_fee FROM "Staff"
   WHERE id=NEW."coachId" AND "storeId"=NEW."storeId";
   IF default_class_fee IS NOT NULL THEN
     chosen=jsonb_build_object('mode','CLASS','value',default_class_fee);
     rev=1;
   END IF;
 END IF;
 IF is_music AND chosen IS NOT NULL THEN
   chosen=chosen || jsonb_build_object('calculationVersion',2,'source',source);
 END IF;
 INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes","musicPricePerLesson","musicTeacherFeeBase","musicTrialMode")
 VALUES (NEW.id,NEW."storeId",NEW."coachId",coalesce(chosen,'{"mode":"UNSET"}'::jsonb),coalesce(rev,0),round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer,course_price,trial_base,trial_mode)
 ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes","musicPricePerLesson"=EXCLUDED."musicPricePerLesson","musicTeacherFeeBase"=EXCLUDED."musicTeacherFeeBase","musicTrialMode"=EXCLUDED."musicTrialMode";
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_capture_compensation() FROM PUBLIC, anon, authenticated;
