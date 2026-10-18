-- REHEARSAL CANDIDATE ONLY: no production migration registration or deployment.
BEGIN;
SET LOCAL lock_timeout='1s';
SET LOCAL statement_timeout='15s';
DO $$
DECLARE old_check text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO old_check FROM pg_constraint
 WHERE conrelid='public."CoursePointEntry"'::regclass AND conname='CoursePointEntry_values' AND convalidated;
 IF old_check IS NULL OR md5(old_check)<>'acff8c4c1a3c1701a7415f896b058364' THEN RAISE EXCEPTION 'Ledger constraint drift; stop migration'; END IF;
 IF to_regclass('public."SportsStagingSessionRule"') IS NOT NULL THEN RAISE EXCEPTION 'Metadata already exists; stop migration'; END IF;
 ALTER TABLE public."CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values";
 EXECUTE format('ALTER TABLE public."CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK ((%s) OR (points > 0 AND (kind ~ %L OR kind ~ %L)))',
 old_check,'^CORRECT:(RESERVED|ATTENDED|NO_SHOW|CANCELLED):CANCELLED:[0-9a-f-]{36}$','^CANCEL_SOURCE:[^[:cntrl:]]+$');
END $$;
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
REVOKE ALL ON "SportsStagingSessionRule" FROM PUBLIC, anon, authenticated;

COMMIT;
