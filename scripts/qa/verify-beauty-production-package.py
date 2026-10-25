"""Real PostgreSQL acceptance in the task-owned, network-disabled Docker container.

Never accepts a URL, Docker host, database name, or container from the caller.
All data is synthetic. No deployed application or remote database is contacted.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "docs/qa/beauty-production-review-20261025"
EVIDENCE = ROOT / "docs/beauty/evidence/20261025-production-package"
CONTAINER = "beauty-release-qa-20261025"
DB = "beauty_release_qa"
ROLE = "steamfoot_beauty_release_qa"
DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]
ENV = {k: v for k, v in os.environ.items() if k not in {"DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"}}
checks = []


def sql(text, user="postgres", database=DB):
    if user in {"anon", "authenticated", "service_role"}:
        text = 'SET ROLE "' + user + '";\n' + text
        user = "postgres"  # Supabase browser roles are NOLOGIN; exercise their actual ACL/RLS with SET ROLE.
    return subprocess.run(DOCKER + ["exec", "-i", CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-U", user, "-d", database], input=text, text=True, capture_output=True, env=ENV)


def run(name, text, user="postgres", error=None):
    result = sql("\\set VERBOSITY verbose\n" + text, user)
    if error:
        ok = result.returncode != 0 and error in result.stderr
    else:
        ok = result.returncode == 0
    checks.append({"name": name, "passed": ok, "expectedError": error, "role": user})
    if not ok:
        raise RuntimeError(name + "\n" + result.stderr[-3000:] + "\n" + result.stdout[-1000:])
    print("PASS " + name, flush=True)
    return result.stdout.strip()


def expect(name, text, expected, user=ROLE):
    value = run(name, text, user)
    if value.splitlines()[-1] != expected:
        raise RuntimeError(name + ": " + value + " != " + expected)


def marker():
    return f"SET beauty_release.review_id='beauty-production-20261025-v1'; SET beauty_release.expected_database='{DB}'; SET beauty_release.runtime_role='{ROLE}';\n"


def bootstrap():
    info = json.loads(subprocess.check_output(DOCKER + ["inspect", CONTAINER], env=ENV, text=True))[0]
    assert info["HostConfig"]["NetworkMode"] == "none" and not info["HostConfig"]["PortBindings"]
    for _ in range(50):
        logs = subprocess.run(DOCKER + ["logs", CONTAINER], capture_output=True, text=True, env=ENV)
        initialized = "PostgreSQL init process complete; ready for start up" in logs.stdout + logs.stderr
        if initialized and sql("SELECT 1", database="postgres").returncode == 0:
            break
        time.sleep(0.2)
    else:
        raise RuntimeError("Local PostgreSQL did not start")
    run_create = sql('CREATE DATABASE "' + DB + '";', database="postgres")
    if run_create.returncode:
        raise RuntimeError("Refusing to reuse existing QA database: " + run_create.stderr)
    shared = []
    for schema in ["prisma", "course-prisma/schema.prisma"]:
        result = subprocess.run(["node", "node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema-datamodel", schema, "--script"], cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
        shared.append(result.stdout)
    shared[0] = shared[0].replace("CREATE TYPE \"IndustryModule\" AS ENUM ('BEAUTY', 'STEAMFOOT', 'SPA', 'COURSE');", "CREATE TYPE \"IndustryModule\" AS ENUM ('STEAMFOOT', 'SPA', 'COURSE');")
    run("shared-main-and-course-model-prerequisites", "\n".join(shared))
    run("synthetic-shared-security-prerequisites", """CREATE EXTENSION btree_gist;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE ROLE qa_legacy_reader NOLOGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER TABLE "CourseStoreNotice" ADD CONSTRAINT "CourseStoreNotice_kind_check" CHECK(kind IN ('BOOKING','LEAVE','CANCEL','MOVE','STOP','RESTORE'));
CREATE FUNCTION public.course_space_disable_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
 IF NOT NEW."isActive" AND EXISTS(SELECT 1 FROM "CourseRental" WHERE "storeId"=NEW."storeId" AND "roomId"=NEW.id AND "cancelledAt" IS NULL AND "endsAt">NOW()) THEN RAISE EXCEPTION 'SPACE_RENTAL_USAGE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER course_space_disable BEFORE UPDATE OF "isActive" ON "CourseRoom" FOR EACH ROW EXECUTE FUNCTION course_space_disable_guard();
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['Store','Customer','CourseRoom','Staff','User','CourseDisplayOrder','CourseStoreNotice','CashbookEntry','CashDrawerSession','TrialBookingLink','BusinessHours','SpecialBusinessDay','SlotOverride','CourseRental'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); END LOOP; END $$;
CREATE POLICY qa_existing_shared_policy ON "Customer" FOR SELECT TO qa_legacy_reader USING(true);
INSERT INTO "Store" (id,name,slug,"updatedAt","industryModule") VALUES ('qa-a','QA A','qa-a',NOW(),'COURSE'),('qa-b','QA B','qa-b',NOW(),'COURSE'),('qa-course','QA course','qa-course',NOW(),'COURSE');
INSERT INTO "User" (id,name,"passwordHash","updatedAt") VALUES ('qa-user','QA user','synthetic-secret-never-readable',NOW());
INSERT INTO "Staff" (id,"storeId","userId","displayName","updatedAt") VALUES ('qa-staff','qa-a','qa-user','QA staff',NOW());
INSERT INTO "Customer" (id,"storeId",name,phone,"assignedStaffId","updatedAt") VALUES ('qa-customer','qa-a','QA customer','0900000001','qa-staff',NOW()),('qa-foreign-customer','qa-b','QA other','0900000002',NULL,NOW());
INSERT INTO "CourseRoom" (id,"storeId",name) VALUES ('qa-room','qa-a','QA room'),('qa-foreign-room','qa-b','QA other room');
INSERT INTO "CourseRoom" (id,"storeId",name) VALUES ('qa-course-room','qa-course','QA course room');
INSERT INTO "CashDrawerSession" (id,"storeId","businessDate","openingBookBalance","openingActualCash","openingDifference","openedByUserId","updatedAt") VALUES ('qa-drawer','qa-a','2030-01-01',1000,1000,0,'qa-user',NOW());
""")
    return info["Image"]


def verify():
    image = bootstrap()
    install = (PACKAGE / "10-install.candidate.sql").read_text()
    runtime = (PACKAGE / "20-runtime-role.candidate.sql").read_text()
    expect("no-beauty-before-install", "SELECT count(*) FROM pg_class WHERE relname LIKE 'Beauty%';", "0", "postgres")
    run("missing-marker-stops-without-write", install, error="Explicit reviewed release marker")
    run("missing-prerequisite-stops-atomically", 'ALTER TABLE "CourseDisplayOrder" RENAME TO "qa_hidden_order";\n' + marker() + install, error="Missing shared prerequisite")
    expect("failed-preflight-leaves-no-beauty", "SELECT count(*) FROM pg_class WHERE relname LIKE 'Beauty%';", "0", "postgres")
    run("restore-only-local-test-prerequisite", 'ALTER TABLE "qa_hidden_order" RENAME TO "CourseDisplayOrder";')
    run("first-install-14-tables-and-integrity", marker() + install)
    expect("all-14-tables-have-rls", "SELECT count(*) FROM pg_class WHERE relname LIKE 'Beauty%' AND relkind='r' AND relrowsecurity;", "14", "postgres")
    run("schema-rerun-stops", marker() + install, error="already exist")
    run("public-inherited-privilege-stops-role-creation", 'GRANT SELECT ON "Staff" TO PUBLIC;\n' + marker() + runtime, error="Unexpected PUBLIC privileges")
    expect("failed-role-install-rolls-back-created-role", "SELECT count(*) FROM pg_roles WHERE rolname='" + ROLE + "';", "0", "postgres")
    run("remove-only-local-test-public-grant", 'REVOKE SELECT ON "Staff" FROM PUBLIC;')
    run("runtime-role-and-shared-permissions-install", marker() + runtime)
    run("enable-only-synthetic-beauty-stores", 'UPDATE "Store" SET "industryModule"=\'BEAUTY\' WHERE id IN (\'qa-a\',\'qa-b\');')
    run("role-rerun-stops", marker() + runtime, error="NEW dedicated Beauty LOGIN role required")
    expect("login-as-dedicated-runtime", "SELECT current_user;", ROLE)
    expect("runtime-is-not-owner-or-privileged", "SELECT (rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit)::text FROM pg_roles WHERE rolname=current_user;", "true")
    expect("preexisting-policy-preserved", "SELECT count(*) FROM pg_policies WHERE policyname='qa_existing_shared_policy';", "1", "postgres")
    expect("enum-addition-committed", "SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='IndustryModule' AND e.enumlabel='BEAUTY';", "1", "postgres")
    run("metadata-postflight-executes", marker() + (PACKAGE / "30-postflight.readonly.sql").read_text())
    expected_fields = json.loads((PACKAGE / "manifest.json").read_text())["tables"]
    actual_fields = json.loads(run("actual-14-table-column-coverage", "SELECT json_object_agg(table_name,fields) FROM (SELECT table_name,json_agg(column_name ORDER BY column_name) AS fields FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'Beauty%' GROUP BY table_name) c;"))
    assert {k: sorted(v) for k, v in actual_fields.items()} == {k: sorted(v) for k, v in expected_fields.items()}
    run("runtime-shared-lookups-and-profile-edits", """
BEGIN;
SELECT id FROM "Store" WHERE id='qa-a' AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text='ACTIVE' FOR UPDATE;
SELECT s.id,s."displayName",s.status,u.status FROM "Staff" s JOIN "User" u ON u.id=s."userId" WHERE s."storeId"='qa-a';
SELECT c.id,c.name,RIGHT(c.phone,4),c."createdAt",s."displayName" FROM "Customer" c LEFT JOIN "User" u ON u.id=c."userId" LEFT JOIN "Staff" s ON s.id=c."assignedStaffId" AND s."storeId"=c."storeId" WHERE c."storeId"='qa-a';
SELECT kind,ids,revision FROM "CourseDisplayOrder" WHERE "storeId"='qa-a';
INSERT INTO "CourseDisplayOrder" ("storeId",kind,ids,revision) VALUES ('qa-a','room',ARRAY['qa-room'],1) ON CONFLICT ("storeId",kind) DO UPDATE SET ids=EXCLUDED.ids,revision="CourseDisplayOrder".revision+1;
SELECT ids,revision FROM "CourseDisplayOrder" WHERE "storeId"='qa-a' FOR UPDATE;
SELECT * FROM "BusinessHours" WHERE "storeId"='qa-a'; SELECT * FROM "SpecialBusinessDay" WHERE "storeId"='qa-a';
SELECT date,"startTime",type,capacity,reason FROM "SlotOverride" WHERE "storeId"='qa-a';
SELECT id,"roomId","occupiedStartsAt","occupiedEndsAt" FROM "CourseRental" WHERE "storeId"='qa-a';
UPDATE "Customer" SET name='QA changed',phone='0900000001',email=NULL,gender=NULL,birthday=NULL,address=NULL,"emergencyContactName"=NULL,"emergencyContactPhone"=NULL,"updatedAt"=NOW() WHERE id='qa-customer' AND "storeId"='qa-a';
UPDATE "CourseRoom" SET name='QA changed',"isActive"=false,capacity=1,"rentalEnabled"=true,"rentalHourlyRate"=100,"rentalBufferMinutes"=15,details='',category='',equipment='',location='' WHERE id='qa-room' AND "storeId"='qa-a';
UPDATE "CashDrawerSession" SET "updatedAt"=NOW() WHERE id='qa-drawer';
ROLLBACK;
""", ROLE)
    run("password-hash-read-denied", 'SELECT "passwordHash" FROM "User";', ROLE, "42501")
    run("full-user-profile-read-denied", 'SELECT * FROM "User";', ROLE, "42501")
    run("staff-profile-write-denied", 'UPDATE "Staff" SET "displayName"=\'bad\';', ROLE, "42501")
    run("drawer-amount-write-denied", 'UPDATE "CashDrawerSession" SET "openingActualCash"=0;', ROLE, "42501")
    run("store-lock-grant-cannot-mutate-store", 'UPDATE "Store" SET id=id WHERE id=\'qa-a\';', ROLE, "lock but not mutate")
    expect("non-beauty-store-invisible-to-runtime", 'SELECT count(*) FROM "Store" WHERE id=\'qa-course\';', "0")
    expect("course-room-cannot-be-modified-by-beauty-runtime", 'WITH changed AS (UPDATE "CourseRoom" SET name=\'bad\' WHERE id=\'qa-course-room\' RETURNING id) SELECT count(*) FROM changed;', "0")
    run("non-beauty-insert-rejected-by-rls", 'INSERT INTO "CourseRoom" (id,"storeId",name) VALUES (\'qa-invalid-room\',\'qa-course\',\'bad\');', ROLE, "42501")
    run("restrictive-module-policy-survives-permissive-public-policy", 'CREATE POLICY qa_public_room_read ON "CourseRoom" FOR SELECT TO PUBLIC USING(true);')
    expect("public-policy-does-not-expose-course-room", 'SELECT count(*) FROM "CourseRoom" WHERE id=\'qa-course-room\';', "0")
    run("browser-role-cannot-read-beauty", 'SELECT * FROM "BeautyService";', "anon", "42501")
    run("authenticated-role-cannot-read-beauty", 'SELECT * FROM "BeautyService";', "authenticated", "42501")
    run("service-role-not-granted-beauty", 'SELECT * FROM "BeautyService";', "service_role", "42501")
    run("runtime-beauty-catalog-and-card-writes", """
INSERT INTO "BeautySetting" ("storeId",notifications) VALUES ('qa-a',false);
INSERT INTO "BeautyService" (id,"storeId",name,duration,price,"singleChargeName","singlePriceConfigured","chargeTechnicianRule","trialDuration") VALUES ('qa-service','qa-a','QA service',60,1000,'QA single',true,NULL,45);
INSERT INTO "BeautyService" (id,"storeId",name,duration,price) VALUES ('qa-foreign-service','qa-b','QA other',60,1000);
INSERT INTO "BeautyTechnician" (id,"storeId",name,gender,"serviceIds",weekly) VALUES ('qa-tech','qa-a','QA tech','FEMALE',ARRAY['qa-service'],'[]');
INSERT INTO "BeautyPlan" (id,"storeId",name,sessions,price,"validDays","serviceIds") VALUES ('qa-plan','qa-a','QA plan',5,5000,30,ARRAY['qa-service']);
INSERT INTO "BeautyCard" (id,"storeId","customerId","memberIds","planId",name,sessions,remaining,"listPrice",paid,"serviceIds","allowShared","expiresAt") VALUES ('qa-card','qa-a','qa-customer',ARRAY['qa-customer'],'qa-plan','QA card',5,5,5000,5000,ARRAY['qa-service'],false,'2030-02-01');
INSERT INTO "BeautyGroup" (id,"storeId","customerId","contactName",phone,"startsAt") VALUES ('qa-group','qa-a','qa-customer','QA','0900000001','2030-01-01T09:00:00Z');
INSERT INTO "BeautyAppointment" (id,"storeId","groupId","customerId","personName","personPhone","serviceId","serviceName","technicianId","locationId",preference,"startsAt","endsAt","occupiedEndsAt",duration,buffer,price,"isTrial",rate,"cancelDeduct","noShowDeduct") VALUES ('qa-appointment','qa-a','qa-group','qa-customer','QA','0900000001','qa-service','QA service','qa-tech','qa-room','ANY','2030-01-01T09:00:00Z','2030-01-01T10:00:00Z','2030-01-01T10:15:00Z',60,15,1000,false,'{}',false,false);
INSERT INTO "BeautyPayment" (id,"storeId","appointmentId",kind,amount,method,note,"actorUserId") VALUES ('qa-sale','qa-a','qa-appointment','SALE',900,'CASH','QA','qa-user');
INSERT INTO "CashbookEntry" (id,"storeId","entryDate",type,"paymentMethod",category,amount,note,"createdByUserId","updatedAt") VALUES ('beauty:qa-sale','qa-a','2030-01-01','INCOME','CASH','QA',900,'QA','qa-user',NOW());
INSERT INTO "BeautyLedger" (id,"storeId","cardId",kind,delta) VALUES ('qa-grant','qa-a','qa-card','GRANT',5);
INSERT INTO "BeautyTransactionRevision" ("storeId","transactionId",revision,note,"actorUserId") VALUES ('qa-a','qa-sale',1,'QA correction','qa-user');
INSERT INTO "BeautyCommand" ("storeId","requestKey","actorKey",intent,result) VALUES ('qa-a','qa-request','qa-user','QA','{}');
""", ROLE)
    expect("store-scoped-query-does-not-return-foreign-customer", 'SELECT count(*) FROM "Customer" WHERE id=\'qa-foreign-customer\' AND "storeId"=\'qa-a\';', "0")
    run("cross-store-customer-fk-denied", 'UPDATE "BeautyAppointment" SET "customerId"=\'qa-foreign-customer\' WHERE id=\'qa-appointment\';', ROLE, "23503")
    run("cross-store-service-fk-denied", 'UPDATE "BeautyAppointment" SET "serviceId"=\'qa-foreign-service\' WHERE id=\'qa-appointment\';', ROLE, "23503")
    run("cross-store-room-fk-denied", 'UPDATE "BeautyAppointment" SET "locationId"=\'qa-foreign-room\' WHERE id=\'qa-appointment\';', ROLE, "23503")
    run("overlapping-room-and-technician-denied", '''INSERT INTO "BeautyAppointment" SELECT (jsonb_populate_record(NULL::"BeautyAppointment",to_jsonb(b)||'{"id":"qa-overlap"}')).* FROM "BeautyAppointment" b WHERE id='qa-appointment';''', ROLE, "23P01")
    run("pending-companion-cannot-use-nonshared-card", '''INSERT INTO "BeautyAppointment" SELECT (jsonb_populate_record(NULL::"BeautyAppointment",to_jsonb(b)||'{"id":"qa-pending","customerId":null,"cardId":"qa-card","startsAt":"2030-01-02T09:00:00Z","endsAt":"2030-01-02T10:00:00Z","occupiedEndsAt":"2030-01-02T10:15:00Z"}')).* FROM "BeautyAppointment" b WHERE id='qa-appointment';''', ROLE, "companion card requires")
    run("runtime-shared-customer-and-room-create", '''BEGIN;
INSERT INTO "Customer" (id,"storeId",name,phone,notes,"authSource","customerStage","selfBookingEnabled","createdAt","updatedAt") VALUES ('qa-new-customer','qa-a','QA new','0900000003','','MANUAL','LEAD',false,NOW(),NOW());
INSERT INTO "CourseRoom" (id,"storeId",name,capacity,details,category,"isActive","createdAt",equipment,location,"rentalEnabled","rentalHourlyRate","rentalBufferMinutes") VALUES ('qa-new-room','qa-a','QA new room',1,'','',true,NOW(),'','',true,100,15);
ROLLBACK;''', ROLE)
    run("cashbook-select-for-update-allowed", 'BEGIN; SELECT amount,type::text,"paymentMethod"::text,"entryDate" FROM "CashbookEntry" WHERE id=\'beauty:qa-sale\' AND "storeId"=\'qa-a\' FOR UPDATE; ROLLBACK;', ROLE)
    run("cashbook-lock-grant-cannot-rewrite-id", 'UPDATE "CashbookEntry" SET id=id WHERE id=\'beauty:qa-sale\';', ROLE, "lock but not mutate")
    run("payment-update-denied", 'UPDATE "BeautyPayment" SET amount=1;', ROLE, "42501")
    run("ledger-update-denied", 'UPDATE "BeautyLedger" SET delta=99;', ROLE, "42501")
    run("revision-update-denied", 'UPDATE "BeautyTransactionRevision" SET note=\'bad\';', ROLE, "42501")
    run("payment-delete-denied", 'DELETE FROM "BeautyPayment";', ROLE, "42501")
    run("payment-truncate-denied", 'TRUNCATE "BeautyPayment";', ROLE, "42501")
    run("immutable-trigger-protects-even-migration-role", 'UPDATE "BeautyPayment" SET amount=1;', "postgres", "financial history is immutable")
    run("revision-trigger-protects-even-migration-role", 'UPDATE "BeautyTransactionRevision" SET note=\'bad\';', "postgres", "revisions are immutable")
    run("command-replay-cannot-overwrite-receipt", 'INSERT INTO "BeautyCommand" ("storeId","requestKey","actorKey",intent,result) VALUES (\'qa-a\',\'qa-request\',\'qa-user\',\'QA\',\'{"bad":true}\');', ROLE, "23505")
    run("command-receipt-update-denied", 'UPDATE "BeautyCommand" SET result=\'{}\';', ROLE, "42501")
    run("notice-upsert-preserves-shared-course-kinds", """
INSERT INTO "CourseStoreNotice" (id,"storeId","subjectKey",kind,"customerName","courseName","coachName","startsAt",details,"updatedAt") VALUES ('qa-notice','qa-a','beauty:qa-appointment','COMPLETE','QA','QA','QA',NOW(),'{}',NOW());
INSERT INTO "CourseStoreNotice" (id,"storeId","subjectKey",kind,"customerName","courseName","coachName","startsAt",details,"updatedAt") VALUES ('qa-notice-next','qa-a','beauty:qa-appointment','NO_SHOW','QA','QA','QA',NOW(),'{}',NOW()) ON CONFLICT ("storeId","subjectKey") DO UPDATE SET kind=EXCLUDED.kind,revision="CourseStoreNotice".revision+1;
""", ROLE)
    run("beauty-notice-kind-cannot-leak-into-course-subject", 'UPDATE "CourseStoreNotice" SET "subjectKey"=\'course:qa\' WHERE id=\'qa-notice\';', ROLE, "23514")
    run("all-original-course-notice-kinds-still-valid", '''INSERT INTO "CourseStoreNotice" (id,"storeId","subjectKey",kind,"customerName","courseName","coachName","startsAt",details,"updatedAt") SELECT 'qa-course-'||k,'qa-course','course:'||k,k,'QA','QA','QA',NOW(),'{}',NOW() FROM unnest(ARRAY['BOOKING','LEAVE','CANCEL','MOVE','STOP','RESTORE']) k;''')
    expect("six-original-course-notices-preserved", 'SELECT count(*) FROM "CourseStoreNotice" WHERE "storeId"=\'qa-course\';', "6", "postgres")
    expect("course-notices-invisible-to-beauty-runtime", 'SELECT count(*) FROM "CourseStoreNotice" WHERE "storeId"=\'qa-course\';', "0")
    run("non-runtime-shared-store-writes-still-work", 'UPDATE "Store" SET name=\'QA course unchanged semantics\' WHERE id=\'qa-course\';')
    expect("finance-and-command-originals-remain-intact", 'SELECT (SELECT amount FROM "BeautyPayment" WHERE id=\'qa-sale\')::text||\':\'||(SELECT delta FROM "BeautyLedger" WHERE id=\'qa-grant\')::text||\':\'||(SELECT result::text FROM "BeautyCommand" WHERE "requestKey"=\'qa-request\');', "900:5:{}")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    result = {"postgresVersion": run("postgres-version", "SHOW server_version;"), "image": image, "network": "none", "ports": [], "syntheticOnly": True, "remoteWrites": False, "checks": checks, "candidateHashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in PACKAGE.glob("*.candidate.sql")}, "limitations": ["DB role is trusted server-side. Restrictive RLS blocks non-Beauty stores, not access between different Beauty stores. Application actor/store/permission checks remain required.", "Main/course schemas and RLS prerequisites are locally generated fixtures, not a backup or full production clone.", "No production roles, credentials, data, deployment or LINE settings changed."]}
    (EVIDENCE / "postgres-results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(f"All {len(checks)} PostgreSQL checks passed.", flush=True)


if __name__ == "__main__":
    verify()
