#!/usr/bin/env python3
"""Local, disposable PostgreSQL rehearsal only; accepts no database URL.

Requires the explicitly named Docker context/container, with networking disabled,
no host mounts and no published ports. Does not run Prisma/Supabase deployment tools.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
DOCKER = ["docker", "--context", "colima-course-release-audit"]
CONTAINER = "course-release-pg"
MIGRATIONS = [
    "prisma/migrations/20260915090000_add_course_scheduling/migration.sql",
    "prisma/migrations/20260915140000_course_points_booking/migration.sql",
    "prisma/migrations/20260915150000_course_coach_member_mode/migration.sql",
    "supabase/migrations/20260915082019_course_catalog_categories.sql",
    "supabase/migrations/20260915123055_course_catalog_details.sql",
    "supabase/migrations/20260916024857_course_attendance_and_staff_contacts.sql",
    "supabase/migrations/20260916090234_course_portal_integration.sql",
    "supabase/migrations/20260917000515_course_purchase_refunds.sql",
    "supabase/migrations/20260917002754_course_purchase_corrections.sql",
    "supabase/migrations/20260917011137_course_customer_emergency_contacts.sql",
    "supabase/migrations/20260917030753_course_reminder_links.sql",
    "supabase/migrations/20260917081039_course_negotiated_refund.sql",
    "supabase/migrations/20260917094700_course_low_balance_reminders.sql",
    "supabase/migrations/20260917143018_course_trial_separate_payment_attendance.sql",
    "supabase/migrations/20260918235710_course_batch2_catalog_qualifications.sql",
]

BASELINE = '''
CREATE TYPE "IndustryModule" AS ENUM ('STEAMFOOT','SPA');
CREATE TABLE "Store" (id text PRIMARY KEY, "industryModule" "IndustryModule" NOT NULL);
CREATE TABLE "User" (id text PRIMARY KEY, role text NOT NULL DEFAULT 'CUSTOMER');
CREATE TABLE "Staff" (id text PRIMARY KEY, "storeId" text NOT NULL, "displayName" text NOT NULL, "userId" text);
CREATE UNIQUE INDEX "Staff_id_storeId_key" ON "Staff"(id,"storeId");
CREATE TABLE "Customer" (id text PRIMARY KEY, "storeId" text NOT NULL);
CREATE UNIQUE INDEX "Customer_id_storeId_key" ON "Customer"(id,"storeId");
CREATE TABLE "StaffMemberLink" (id text PRIMARY KEY, "staffId" text, "storeId" text, "userId" text);
CREATE TABLE "MessageLog" (id text PRIMARY KEY, "storeId" text NOT NULL, "bookingId" text, "spaBookingId" text);
-- Synthetic sentinels, not a production clone or app-level regression test.
CREATE TABLE legacy_outcomes (module text PRIMARY KEY, booking text, balance int, income int);
INSERT INTO "Store" VALUES ('steam','STEAMFOOT'),('spa','SPA');
INSERT INTO "User" (id) VALUES ('actor');
INSERT INTO "Staff" (id,"storeId","displayName") VALUES ('coach','steam','Preserved coach'),('coach2','spa','Other store');
INSERT INTO "Customer" VALUES ('a','steam'),('b','spa');
INSERT INTO "StaffMemberLink" VALUES ('link','coach','steam','actor');
INSERT INTO legacy_outcomes VALUES ('STEAMFOOT','COMPLETED',8,1000),('SPA','RESERVED',5,2000);
ALTER TABLE "Store" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StaffMemberLink" ENABLE ROW LEVEL SECURITY;
-- Exercise even permissive legacy default grants: RLS must still deny clients.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
'''

PREFLIGHT = '''
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname LIKE 'Course%' AND c.relkind='r')
 OR EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
            WHERE t.typname='IndustryModule' AND e.enumlabel='COURSE') THEN
   RAISE EXCEPTION 'Course rollout already applied or partial: stop and reconcile';
 END IF;
END $$;
'''


def run(args, sql=None):
    return subprocess.run(args, input=sql, text=True, capture_output=True, check=False)


def query(db, sql, error=None):
    result = run(DOCKER + ["exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-v",
                          "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", db], sql)
    if error:
        if result.returncode == 0 or error not in result.stderr:
            raise RuntimeError(f"Expected {error}: {result.stdout} {result.stderr}")
    elif result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def snapshot(db):
    return query(db, '''SELECT jsonb_build_object(
      'stores',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Store" t),
      'staff',(SELECT jsonb_agg(to_jsonb(t)-'phone'-'emergencyContactName'-'emergencyContactPhone'-'courseCoachEnabled'-'courseQualificationsConfirmed'-'courseQualifiedTemplateIds'-'courseBirthday'-'emergencyContactRelation' ORDER BY id) FROM "Staff" t),
      'links',(SELECT jsonb_agg(to_jsonb(t)-'courseMemberEnabled' ORDER BY id) FROM "StaffMemberLink" t),
      'customers',(SELECT jsonb_agg(to_jsonb(t)-'emergencyContactName'-'emergencyContactPhone' ORDER BY id) FROM "Customer" t),
      'outcomes',(SELECT jsonb_agg(to_jsonb(t) ORDER BY module) FROM legacy_outcomes t));''')


def main():
    inspection = run(DOCKER + ["inspect", CONTAINER])
    if inspection.returncode:
        raise RuntimeError(inspection.stderr)
    info = json.loads(inspection.stdout)[0]
    unsafe_mounts = any(m["Type"] != "volume" or m["Destination"] != "/var/lib/postgresql/data" for m in info["Mounts"])
    if info["HostConfig"]["NetworkMode"] != "none" or unsafe_mounts or info["HostConfig"].get("PortBindings"):
        raise RuntimeError("Refusing container with network, host mounts or published ports")
    version = query("postgres", "SHOW server_version;")
    if not version.startswith("17.6"):
        raise RuntimeError(f"Expected production-matching PostgreSQL 17.6, got {version}")
    query("postgres", """DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    END $$;""")
    db = "course_rehearsal_" + uuid.uuid4().hex[:12]
    query("postgres", f'CREATE DATABASE "{db}";')
    manifest = [{"path": path, "sha256": hashlib.sha256((ROOT / path).read_bytes()).hexdigest()} for path in MIGRATIONS]
    chunks = []
    for path in MIGRATIONS:
        body = (ROOT / path).read_text()
        # The trial migration has its own transaction. Only remove its exact
        # outer envelope to prevent an inner COMMIT breaking atomic rehearsal.
        if path.endswith("20260917143018_course_trial_separate_payment_attendance.sql"):
            assert body.count("BEGIN;") == 1 and body.count("COMMIT;") == 1
            assert body.rstrip().endswith("COMMIT;")
            body = body.replace("BEGIN;", "", 1).rsplit("COMMIT;", 1)[0]
        elif "BEGIN;" in body or "COMMIT;" in body:
            raise RuntimeError(f"Review unexpected transaction envelope: {path}")
        chunks.append(body)
    prefix = "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';\n" + PREFLIGHT
    bundle = prefix + "\n".join(chunks) + "\nCOMMIT;"
    checks = []
    try:
        query(db, BASELINE)
        before = snapshot(db)
        # Failure after all DDL, before COMMIT must undo tables, enum and shared columns.
        query(db, prefix + "\n".join(chunks) + "\nSELECT 1/0; COMMIT;", "22012")
        assert query(db, "SELECT to_regclass('public.\"CourseRoom\"') IS NULL;") == "t"
        assert query(db, "SELECT count(*) FROM pg_enum WHERE enumlabel='COURSE';") == "0"
        assert query(db, "SELECT count(*) FROM information_schema.columns WHERE table_name='Staff' AND column_name='phone';") == "0"
        assert query(db, "SELECT count(*) FROM information_schema.columns WHERE table_name='Customer' AND column_name='emergencyContactName';") == "0"
        assert snapshot(db) == before
        checks.append("late failure rolls back all fifteen migrations, enum and shared-column changes")
        query(db, 'DROP INDEX "Customer_id_storeId_key";')
        query(db, bundle, "42830")
        assert query(db, "SELECT to_regclass('public.\"CourseRoom\"') IS NULL;") == "t"
        assert query(db, "SELECT count(*) FROM pg_enum WHERE enumlabel='COURSE';") == "0"
        query(db, 'CREATE UNIQUE INDEX "Customer_id_storeId_key" ON "Customer"(id,"storeId");')
        query(db, 'CREATE TABLE "CourseRoom" (id text);')
        query(db, bundle, "Course rollout already applied or partial")
        query(db, 'DROP TABLE "CourseRoom";')
        checks.append("missing scoped dependency rolls back; partial course schema fails closed")
        query(db, bundle)
        assert snapshot(db) == before
        checks.append("ordered exact SQL applies atomically; synthetic legacy rows unchanged")
        query(db, bundle, "Course rollout already applied or partial")
        assert snapshot(db) == before
        checks.append("replay fails closed without changes")
        assert query(db, 'SELECT bool_and(NOT "courseCoachEnabled" AND NOT "courseQualificationsConfirmed" AND cardinality("courseQualifiedTemplateIds")=0) FROM "Staff";') == "t"
        assert query(db, "SELECT count(*) FROM pg_constraint WHERE conname IN ('CourseTemplate_visibility_check','CourseTemplate_classType_check','CourseTrialPayment_void_consistency');") == "3"
        checks.append("batch2 preserves legacy staff defaults; trial and catalog constraints present")
        assert query(db, "SELECT count(*) FROM pg_class WHERE relname LIKE 'Course%' AND relkind='r' AND relrowsecurity;") == "13"
        assert query(db, 'SELECT "courseMemberEnabled" AND phone=\'\' AND "emergencyContactName"=\'\' AND "emergencyContactPhone"=\'\' FROM "StaffMemberLink" CROSS JOIN "Staff" LIMIT 1;') == "t"
        query(db, '''
INSERT INTO "CourseRoom" (id,"storeId",name) VALUES ('room','steam','Room');
INSERT INTO "CourseRoom" (id,"storeId",name) VALUES ('room2','steam','Other room');
INSERT INTO "Staff" (id,"storeId","displayName") VALUES ('coach3','steam','Other coach');
INSERT INTO "CourseTemplate" (id,"storeId",name,"durationMinutes","pointCost",capacity,"updatedAt") VALUES ('template','steam','Class',60,3,2,now());
INSERT INTO "CourseSession" (id,"storeId","templateId","roomId","coachId","nameSnapshot","startsAt","endsAt","pointCost",capacity,"requestKey","requestIndex","createdById")
VALUES ('session','steam','template','room','coach','Class','2026-09-18T10:00:00+08:00','2026-09-18T11:00:00+08:00',3,2,'request',0,'actor');
INSERT INTO "CoursePointPlan" (id,"storeId",name,points,"validDays") VALUES ('plan','steam','Points',10,30);
INSERT INTO "CoursePointCard" (id,"storeId","planId","nameSnapshot",remaining,"expiresAt","requestKey") VALUES ('card','steam','plan','Points',10,'2026-12-01T00:00:00+08:00','card-request');
INSERT INTO "CourseCardMember" VALUES ('card','steam','a');
INSERT INTO "CourseBooking" (id,"storeId","sessionId","cardId","customerId","operatorUserId","operatorName","customerName","pointCost","requestKey","updatedAt") VALUES ('booking','steam','session','card','a','actor','Operator','Attendee',3,'booking-request',now());
''')
        query(db, "INSERT INTO \"MessageLog\" (id,\"storeId\",\"courseBookingId\") VALUES ('course-reminder','steam','booking');")
        query(db, "INSERT INTO \"MessageLog\" (id,\"storeId\",\"courseBookingId\") VALUES ('cross-store-reminder','spa','booking');", "23503")
        query(db, "INSERT INTO \"MessageLog\" (id,\"storeId\",\"courseBookingId\",\"bookingId\") VALUES ('mixed-reminder','steam','booking','legacy');", "23514")
        query(db, "INSERT INTO \"MessageLog\" (id,\"storeId\",\"courseCardId\") VALUES ('cross-card-reminder','spa','card');", "23503")
        checks.append("course notification links reject cross-store bookings/cards and mixed legacy booking models")
        query(db, '''INSERT INTO "CoursePurchase" (id,"storeId","customerId","planId",name,unit,points,price,"validDays","templateIds","transferLastFive","requestKey","cardId",status) VALUES ('purchase','steam','a','plan','Plan','POINT',10,1000,30,'{}','12345','purchase-key','card','REFUNDED');
INSERT INTO "CoursePurchaseRefund" (id,"storeId","purchaseId",amount,points,reason,"actorUserId","requestKey") VALUES ('refund1','steam','purchase',400,6,'Agreed','actor','refund-key-1');
INSERT INTO "CoursePurchaseRefund" (id,"storeId","purchaseId",amount,points,method,reason,"actorUserId","requestKey") VALUES ('refund2','steam','purchase',100,0,'BANK_TRANSFER','Supplement','actor','refund-key-2');''')
        assert query(db, '''SELECT method FROM "CoursePurchaseRefund" WHERE id='refund1';''') == "OTHER"
        query(db, '''UPDATE "CoursePurchaseRefund" SET method='INVALID' WHERE id='refund2';''', "23514")
        query(db, '''UPDATE "CoursePurchaseRefund" SET points=-1 WHERE id='refund2';''', "23514")
        query(db, '''UPDATE "CoursePurchaseRefund" SET "requestKey"='refund-key-1' WHERE id='refund2';''', "23505")
        checks.append("refund methods and nonnegative retired quota validated; supplemental refund allowed; request keys remain unique")
        assert query(db, 'SELECT "lowBalanceEnabled", "lowBalanceThreshold" IS NULL FROM "CoursePointPlan" WHERE id=\'plan\';') == "f|t"
        query(db, 'UPDATE "CoursePointPlan" SET "lowBalanceEnabled"=true WHERE id=\'plan\';', "23514")
        query(db, 'UPDATE "CoursePointPlan" SET "lowBalanceThreshold"=-1 WHERE id=\'plan\';', "23514")
        query(db, 'INSERT INTO "CourseBalanceReminderPreference" (id,"storeId","customerId") VALUES (\'pref\',\'steam\',\'a\');')
        query(db, 'INSERT INTO "CourseBalanceReminderPreference" (id,"storeId","customerId") VALUES (\'cross-pref\',\'steam\',\'b\');', "23503")
        query(db, 'INSERT INTO "CourseBalanceReminderPreference" (id,"storeId","customerId") VALUES (\'duplicate-pref\',\'steam\',\'a\');', "23505")
        checks.append("low balance defaults disabled with no threshold; invalid settings, cross-store preferences and duplicate preferences rejected")
        query(db, 'UPDATE "CoursePointCard" SET remaining=-1;', "23514")
        query(db, 'INSERT INTO "CourseCardMember" VALUES (\'card\',\'steam\',\'b\');', "23503")
        query(db, '''INSERT INTO "CourseBooking" (id,"storeId","sessionId","cardId","customerId","operatorUserId","operatorCustomerId","operatorName","customerName","pointCost",status,"requestKey","createdAt","updatedAt","checkedInAt",notes) SELECT 'duplicate',"storeId","sessionId","cardId","customerId","operatorUserId","operatorCustomerId","operatorName","customerName","pointCost",status,'different-request',"createdAt","updatedAt","checkedInAt",notes FROM "CourseBooking";''', "23505")
        query(db, '''INSERT INTO "CourseSession" SELECT 'overlap',"storeId","templateId","roomId",'coach3',"nameSnapshot","startsAt","endsAt","pointCost",capacity,"cancelledAt",'overlap-request',"requestIndex","createdById","createdAt" FROM "CourseSession";''', "CourseSession_room_overlap")
        query(db, '''INSERT INTO "CourseSession" SELECT 'overlap',"storeId","templateId",'room2',"coachId","nameSnapshot","startsAt","endsAt","pointCost",capacity,"cancelledAt",'overlap-request',"requestIndex","createdById","createdAt" FROM "CourseSession";''', "CourseSession_coach_overlap")
        query(db, '''UPDATE "CourseBooking" SET status='NO_SHOW';
INSERT INTO "CoursePointEntry" (id,"storeId","cardId","bookingId",kind,points,"actorUserId") VALUES ('entry','steam','card','booking','CORRECT:ATTENDED:NO_SHOW:11111111-1111-1111-1111-111111111111',3,'actor');''')
        checks.append("negative balance, cross-store member, duplicate learner and overlapping room/coach blocked; no-show/correction supported")
        assert query(db, "SELECT \"bookingKind\" FROM \"CourseBooking\" WHERE id='booking';") == "CARD"
        query(db, "UPDATE \"CourseTemplate\" SET visibility='BAD';", "23514")
        query(db, "UPDATE \"CourseTemplate\" SET \"classType\"='BAD';", "23514")
        checks.append("existing card bookings default CARD; invalid catalog modes rejected")
        for role in ("anon", "authenticated"):
            assert query(db, f'SET ROLE {role}; SELECT count(*) FROM "CoursePointCard";') == "0"
            query(db, f'SET ROLE {role}; INSERT INTO "CourseRoom" (id,"storeId",name) VALUES (\'browser\',\'steam\',\'Forbidden\');', "42501")
            query(db, f'SET ROLE {role}; SELECT * FROM "CoursePurchase";', "42501")
            query(db, f'SET ROLE {role}; SELECT * FROM "CoursePurchaseRefund";', "42501")
            query(db, f'SET ROLE {role}; SELECT * FROM "CourseBalanceReminderPreference";', "42501")
            query(db, f'SET ROLE {role}; SELECT * FROM "CourseTrialPayment";', "42501")
        checks.append("both browser roles denied rows/writes under permissive default grants; purchase privileges revoked")
        print(json.dumps({"postgres": version, "checks": checks, "manifest": manifest,
                          "scope": "synthetic dependency baseline, not production clone or app transaction acceptance"}, indent=2))
    finally:
        query("postgres", f'DROP DATABASE "{db}";')


if __name__ == "__main__":
    main()
