-- Course-only additive fields. Existing purchases keep NULL allocation snapshots.
ALTER TABLE "CoursePointPlan" ADD COLUMN "storeCost" INTEGER NOT NULL DEFAULT 0 CHECK ("storeCost">=0), ADD COLUMN "termSessionIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "CoursePointCard" ADD COLUMN "termSessionIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "CoursePurchase" ADD COLUMN "storeCostSnapshot" INTEGER, ADD COLUMN "developerProfitSnapshot" INTEGER, ADD COLUMN "developerNameSnapshot" TEXT, ADD COLUMN "termSessionIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "CoursePurchase" ADD CONSTRAINT "course_allocation_nonnegative" CHECK (("storeCostSnapshot" IS NULL AND "developerProfitSnapshot" IS NULL) OR ("storeCostSnapshot" IS NOT NULL AND "developerProfitSnapshot" IS NOT NULL AND "storeCostSnapshot">=0 AND "developerProfitSnapshot">=0 AND "storeCostSnapshot"+"developerProfitSnapshot"=price));
-- New sessions use only the individual per-class fee. Keep historical snapshots unchanged.
CREATE OR REPLACE FUNCTION course_capture_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE chosen jsonb; rev integer;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD."startsAt"<=CURRENT_TIMESTAMP AND (NEW."coachId"<>OLD."coachId" OR NEW."templateId"<>OLD."templateId" OR NEW."startsAt"<>OLD."startsAt" OR NEW."endsAt"<>OLD."endsAt") AND EXISTS (SELECT 1 FROM "CourseCompensationSnapshot" WHERE "sessionId"=OLD.id) THEN
     RAISE EXCEPTION 'Cannot change compensation snapshot of a started course';
   END IF;
   IF NEW."coachId"=OLD."coachId" AND NEW."templateId"=OLD."templateId" THEN RETURN NEW; END IF;
   IF OLD."startsAt"<=CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Cannot change compensation identity of a started course'; END IF;
 END IF;
 SELECT rules->0,revision INTO chosen,rev FROM "CourseCompensation"
 WHERE "storeId"=NEW."storeId" AND "templateId"=NEW."templateId" AND "staffId"=NEW."coachId" AND jsonb_array_length(rules)=1 AND rules->0->>'mode'='CLASS';
 INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes")
 VALUES (NEW.id,NEW."storeId",NEW."coachId",coalesce(chosen,'{"mode":"CLASS","value":0}'::jsonb),coalesce(rev,0),round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer)
 ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes";
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_capture_compensation() FROM PUBLIC, anon, authenticated;
