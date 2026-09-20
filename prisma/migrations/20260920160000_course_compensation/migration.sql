-- Additive, course-only. No existing plan, balance or staff identity updates.
CREATE TABLE "CourseCompensation" (
  "storeId" TEXT NOT NULL REFERENCES "Store"(id),
  "templateId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL DEFAULT '',
  rules JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("storeId","templateId","staffId"),
  FOREIGN KEY ("templateId","storeId") REFERENCES "CourseTemplate"(id,"storeId"),
  CHECK (jsonb_typeof(rules)='array')
);
CREATE TABLE "CourseCompensationSnapshot" (
  "sessionId" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  rule JSONB NOT NULL,
  revision INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("sessionId","storeId") REFERENCES "CourseSession"(id,"storeId")
);
ALTER TABLE "CourseCompensation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseCompensationSnapshot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseCompensation", "CourseCompensationSnapshot" FROM PUBLIC, anon, authenticated;
ALTER TABLE "CourseCompensationSnapshot" ADD COLUMN "durationMinutes" INTEGER NOT NULL;
-- Trigger covers single, repeated and copied scheduling without exposing settings to members.
CREATE FUNCTION course_capture_compensation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE chosen jsonb; rev integer;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF OLD."startsAt"<=CURRENT_TIMESTAMP AND (NEW."coachId"<>OLD."coachId" OR NEW."templateId"<>OLD."templateId" OR NEW."startsAt"<>OLD."startsAt" OR NEW."endsAt"<>OLD."endsAt") AND EXISTS (SELECT 1 FROM "CourseCompensationSnapshot" WHERE "sessionId"=OLD.id) THEN
     RAISE EXCEPTION 'Cannot change compensation snapshot of a started course';
   END IF;
   IF NEW."coachId"=OLD."coachId" AND NEW."templateId"=OLD."templateId" THEN
     IF NEW."startsAt"<>OLD."startsAt" OR NEW."endsAt"<>OLD."endsAt" THEN
       UPDATE "CourseCompensationSnapshot" SET "durationMinutes"=round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer WHERE "sessionId"=NEW.id AND "storeId"=NEW."storeId";
     END IF;
     RETURN NEW;
   END IF;
   IF OLD."startsAt"<=CURRENT_TIMESTAMP THEN
     RAISE EXCEPTION 'Cannot change compensation identity of a started course';
   END IF;
 END IF;
 SELECT rules->0,revision INTO chosen,rev FROM "CourseCompensation"
 WHERE "storeId"=NEW."storeId" AND "templateId"=NEW."templateId" AND "staffId"=NEW."coachId";
 IF chosen IS NULL THEN
   SELECT rules->0,revision INTO chosen,rev FROM "CourseCompensation"
   WHERE "storeId"=NEW."storeId" AND "templateId"=NEW."templateId" AND "staffId"='' AND jsonb_array_length(rules)=1;
 END IF;
 INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes")
 VALUES (NEW.id,NEW."storeId",NEW."coachId",coalesce(chosen,'{"mode":"UNSET"}'::jsonb),coalesce(rev,0),round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer)
 ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes";
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_capture_compensation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER course_capture_compensation AFTER INSERT OR UPDATE OF "coachId","templateId","startsAt","endsAt" ON "CourseSession" FOR EACH ROW EXECUTE FUNCTION course_capture_compensation();
