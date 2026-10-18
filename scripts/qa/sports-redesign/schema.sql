-- Test station only. Installed by the guarded seed script, never ci-migrate.
CREATE TABLE IF NOT EXISTS "SportsStagingSessionRule" (
 "sessionId" text PRIMARY KEY,
 "storeId" text NOT NULL,
 frequency text NOT NULL CHECK (frequency IN ('SINGLE','WEEKLY','BIWEEKLY')),
 enrollment text NOT NULL CHECK (enrollment IN ('ASSIGNED','OPEN')),
 "planId" text,
 "trialPrice" integer NOT NULL CHECK ("trialPrice">=0),
 payload jsonb NOT NULL,
 FOREIGN KEY ("sessionId","storeId") REFERENCES "CourseSession"(id,"storeId") ON DELETE CASCADE,
 FOREIGN KEY ("planId","storeId") REFERENCES "CoursePointPlan"(id,"storeId")
);
CREATE INDEX IF NOT EXISTS "SportsStagingSessionRule_store" ON "SportsStagingSessionRule"("storeId");
ALTER TABLE "SportsStagingSessionRule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SportsStagingSessionRule" FROM PUBLIC;
