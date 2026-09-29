-- Private, store-scoped teacher defaults. Existing class snapshots are untouched.
CREATE TABLE "CourseTeacherCompensationSetting" (
 "storeId" text NOT NULL REFERENCES "Store"(id),
 "staffId" text NOT NULL,
 "defaultRatio" numeric(5,4),
 "subjectRules" jsonb NOT NULL DEFAULT '{}'::jsonb,
 revision integer NOT NULL DEFAULT 1,
 "updatedAt" timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY ("storeId","staffId"),
 FOREIGN KEY ("staffId","storeId") REFERENCES "Staff"(id,"storeId"),
 CHECK ("defaultRatio" IS NULL OR "defaultRatio" BETWEEN 0 AND 1),
 CHECK (jsonb_typeof("subjectRules")='object')
);
ALTER TABLE "CourseTeacherCompensationSetting" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseTeacherCompensationSetting" FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS "CoursePurchase_card_fee_idx" ON "CoursePurchase" ("storeId","cardId") WHERE "cardId" IS NOT NULL;

CREATE OR REPLACE FUNCTION course_capture_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE chosen jsonb; rev integer; course_price integer; trial_base integer; trial_mode text; teacher_share double precision; subject_id text; settings record; source text; is_music boolean;
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
 IF is_music AND chosen IS NOT NULL THEN
   chosen=chosen || jsonb_build_object('calculationVersion',2,'source',source);
 END IF;
 INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes","musicPricePerLesson","musicTeacherFeeBase","musicTrialMode")
 VALUES (NEW.id,NEW."storeId",NEW."coachId",coalesce(chosen,'{"mode":"UNSET"}'::jsonb),coalesce(rev,0),round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer,course_price,trial_base,trial_mode)
 ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes","musicPricePerLesson"=EXCLUDED."musicPricePerLesson","musicTeacherFeeBase"=EXCLUDED."musicTeacherFeeBase","musicTrialMode"=EXCLUDED."musicTrialMode";
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_capture_compensation() FROM PUBLIC, anon, authenticated;

-- Preserve store-owner access only; delegated staff get no new financial grants.
INSERT INTO "StaffPermission" (id,"staffId",permission,granted)
SELECT gen_random_uuid()::text,s.id,p.permission,true FROM "Staff" s
CROSS JOIN (VALUES ('teacher.compensation.read'),('teacher.compensation.manage'),('teacher.settlement.read'),('teacher.settlement.confirm'),('teacher.settlement.pay')) p(permission)
WHERE s."isOwner"=true AND s.status::text='ACTIVE' AND EXISTS(SELECT 1 FROM "StoreFeatureEntitlement" e WHERE e."storeId"=s."storeId" AND e."featureKey"='business.music' AND e.status::text='ENABLED')
ON CONFLICT ("staffId",permission) DO NOTHING;

-- Partial payments remain protected by store/session locks and unique request keys.
DROP INDEX "CourseFeePayment_active_session";
CREATE INDEX "CourseFeePayment_active_session" ON "CourseFeePayment" ("storeId","sessionId") WHERE "voidedAt" IS NULL;
