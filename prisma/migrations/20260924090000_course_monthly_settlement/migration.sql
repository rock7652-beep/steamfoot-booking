-- Course-only settings, immutable monthly revisions and developer payment ledger.
CREATE TABLE "CourseSettlementSetting" (
 "storeId" TEXT PRIMARY KEY REFERENCES "Store"(id),
 "profitEnabled" BOOLEAN NOT NULL DEFAULT true,
 "feeEnabled" BOOLEAN NOT NULL DEFAULT true,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE "CourseMonthlySettlement" (
 id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"(id),
 month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 revision INTEGER NOT NULL CHECK (revision > 0), fingerprint TEXT NOT NULL,
 snapshot JSONB NOT NULL, "actorUserId" TEXT NOT NULL REFERENCES "User"(id),
 reason TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("storeId",month,revision)
);
CREATE TABLE "CourseProfitPayment" (
 id TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "Store"(id),
 "purchaseId" TEXT NOT NULL, "staffId" TEXT NOT NULL REFERENCES "Staff"(id),
 "staffNameSnapshot" TEXT NOT NULL, amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 1000000),
 method TEXT NOT NULL CHECK (method IN ('CASH','OTHER')), note TEXT NOT NULL,
 "requestKey" TEXT NOT NULL, "actorUserId" TEXT NOT NULL REFERENCES "User"(id),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "voidedAt" TIMESTAMPTZ, "voidReason" TEXT, "voidedBy" TEXT REFERENCES "User"(id),
 FOREIGN KEY ("purchaseId","storeId") REFERENCES "CoursePurchase"(id,"storeId"),
 UNIQUE ("storeId","requestKey")
);
CREATE INDEX "CourseProfitPayment_purchase" ON "CourseProfitPayment" ("storeId","purchaseId");
ALTER TABLE "CourseSettlementSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseMonthlySettlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseProfitPayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CourseSettlementSetting", "CourseMonthlySettlement", "CourseProfitPayment" FROM PUBLIC, anon, authenticated;
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
 IF EXISTS (SELECT 1 FROM "CourseSettlementSetting" WHERE "storeId"=NEW."storeId" AND NOT "feeEnabled") THEN
   chosen := '{"mode":"CLASS","value":0}'::jsonb;
 END IF;
 INSERT INTO "CourseCompensationSnapshot" ("sessionId","storeId","staffId",rule,revision,"durationMinutes")
 VALUES (NEW.id,NEW."storeId",NEW."coachId",coalesce(chosen,'{"mode":"CLASS","value":0}'::jsonb),coalesce(rev,0),round(extract(epoch from (NEW."endsAt"-NEW."startsAt"))/60)::integer)
 ON CONFLICT ("sessionId") DO UPDATE SET "staffId"=EXCLUDED."staffId",rule=EXCLUDED.rule,revision=EXCLUDED.revision,"durationMinutes"=EXCLUDED."durationMinutes";
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION course_capture_compensation() FROM PUBLIC, anon, authenticated;
