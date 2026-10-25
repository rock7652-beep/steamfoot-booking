"""Generate review-only release SQL from pinned local model/integrity references.

No database client, connection URL, or remote operation is used by this builder.
"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/qa/beauty-production-review-20261025"
MARKER = "beauty-production-20261025-v1"

READ = {
    "Store": ["id", "industryModule", "operatingStatus"],
    "Customer": ["id", "storeId", "userId", "name", "phone", "notes", "email", "gender", "birthday", "address", "emergencyContactName", "emergencyContactPhone", "assignedStaffId", "mergedIntoCustomerId", "createdAt", "updatedAt"],
    "Staff": ["id", "storeId", "userId", "displayName", "status"],
    "User": ["id", "status"],
    "CourseRoom": None,
    "BusinessHours": None,
    "SpecialBusinessDay": None,
    "SlotOverride": None,
    "CourseRental": None,
    "CourseDisplayOrder": None,
    "CashDrawerSession": None,
    "CashbookEntry": None,
    "TrialBookingLink": ["id", "storeId", "expiresAt", "consumedAt"],
    "CourseStoreNotice": None,
}
INSERT = {
    "Customer": ["id", "storeId", "name", "phone", "notes", "authSource", "customerStage", "selfBookingEnabled", "lineUserId", "lineLinkStatus", "lineLinkedAt", "createdAt", "updatedAt"],
    "CourseRoom": ["id", "storeId", "name", "capacity", "details", "category", "isActive", "createdAt", "equipment", "location", "rentalEnabled", "rentalHourlyRate", "rentalBufferMinutes"],
    "CashbookEntry": ["id", "storeId", "entryDate", "type", "paymentMethod", "category", "amount", "note", "createdByUserId", "updatedAt"],
    "CourseStoreNotice": None,
    "CourseDisplayOrder": ["storeId", "kind", "ids", "revision"],
}
UPDATE = {
    "Store": ["id"],  # SELECT FOR UPDATE requires an UPDATE privilege; trigger forbids actual mutation.
    "CashbookEntry": ["id"],  # Same lock-only grant, guarded below.
    "Customer": ["name", "phone", "notes", "email", "gender", "birthday", "address", "emergencyContactName", "emergencyContactPhone", "updatedAt"],
    "CourseRoom": ["name", "isActive", "capacity", "rentalEnabled", "rentalHourlyRate", "rentalBufferMinutes", "details", "category", "equipment", "location"],
    "TrialBookingLink": ["consumedAt"],
    "CashDrawerSession": ["updatedAt"],
    "CourseStoreNotice": None,
    "CourseDisplayOrder": ["ids", "revision"],
}


def quoted(values):
    return ",".join('"' + x + '"' for x in values)


def fragment(name):
    text = (OUT / name).read_text()
    return text.split("END $$;\n\n", 1)[1]


def guard():
    return f"""-- REVIEWED CANDIDATE ONLY. Explicit formal execution authorization is still required.
-- Never an automatic migration. Run with ON_ERROR_STOP and an externally pinned project/connection.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;
DO $$ BEGIN
 IF current_setting('beauty_release.review_id',true) IS DISTINCT FROM '{MARKER}'
 OR current_setting('beauty_release.expected_database',true) IS DISTINCT FROM current_database() THEN
  RAISE EXCEPTION 'Explicit reviewed release marker and expected database required';
 END IF;
END $$;
"""


def build():
    reference_manifest = json.loads((OUT / "manifest.json").read_text())
    expected_model = reference_manifest["sources"]["beauty-prisma/schema.prisma"]
    if hashlib.sha256((ROOT / "beauty-prisma/schema.prisma").read_bytes()).hexdigest() != expected_model:
        raise RuntimeError("Model changed since reference generation; regenerate and review references first")
    for name, digest in reference_manifest["files"].items():
        if hashlib.sha256((OUT / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError("Reviewed reference changed: " + name)
    model = fragment("01-model.reference.sql")
    integrity = fragment("02-integrity.reference.sql")
    tables = re.findall(r'^CREATE TABLE "(Beauty\w+)"', model, re.M)
    assert len(tables) == 14
    # Harden the existing immutable function's resolution without changing its business behavior.
    integrity = integrity.replace(
        'CREATE FUNCTION beauty_immutable_ledger() RETURNS trigger LANGUAGE plpgsql AS',
        'CREATE FUNCTION public.beauty_immutable_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS',
    )
    base = guard() + """DO $$ DECLARE ext text; t text; BEGIN
 IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Beauty%')
 OR EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'beauty_%') THEN
  RAISE EXCEPTION 'Beauty installation or functions already exist; stop, do not rerun or overwrite';
 END IF;
 FOREACH t IN ARRAY ARRAY['Store','Customer','CourseRoom','User','Staff','CourseStoreNotice','CourseRental','CourseDisplayOrder','CashbookEntry','CashDrawerSession','TrialBookingLink','BusinessHours','SpecialBusinessDay','SlotOverride'] LOOP
  IF to_regclass(format('public.%I',t)) IS NULL THEN RAISE EXCEPTION 'Missing shared prerequisite: %',t; END IF;
 END LOOP;
 IF to_regtype('public."IndustryModule"') IS NULL THEN RAISE EXCEPTION 'IndustryModule missing'; END IF;
 SELECT n.nspname INTO ext FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='btree_gist';
 IF ext IS NULL THEN RAISE EXCEPTION 'Approved btree_gist prerequisite missing'; END IF;
 PERFORM set_config('search_path',format('public,%I',ext),true);
END $$;
ALTER TYPE public."IndustryModule" ADD VALUE IF NOT EXISTS 'BEAUTY';
""" + model + "\n" + integrity + "\nCOMMIT;\n"
    (OUT / "10-install.candidate.sql").write_text(base)

    # Exact observed production constraint; drift must stop before replacing any shared object.
    notice = "CHECK ((kind = ANY (ARRAY['BOOKING'::text, 'LEAVE'::text, 'CANCEL'::text, 'MOVE'::text, 'STOP'::text, 'RESTORE'::text])))"
    role = guard() + """DO $$
DECLARE app_role text:=current_setting('beauty_release.runtime_role',true); t text; p record;
BEGIN
 IF app_role IS NULL OR app_role !~ '^steamfoot_beauty_[a-z][a-z0-9_]{0,39}$'
 OR EXISTS(SELECT FROM pg_roles WHERE rolname=app_role) THEN RAISE EXCEPTION 'Explicit NEW dedicated Beauty LOGIN role required'; END IF;
 IF EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'beauty_release_v1_%')
 OR to_regprocedure('public.beauty_release_lock_only_guard()') IS NOT NULL THEN RAISE EXCEPTION 'Release role/policies already installed; stop'; END IF;
"""
    role += " FOREACH t IN ARRAY ARRAY[" + ",".join("'" + x + "'" for x in tables + list(READ)) + "] LOOP\n"
    role += """  IF NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass(format('public.%I',t)) AND relkind IN ('r','p') AND relrowsecurity) THEN
   RAISE EXCEPTION 'Required RLS-enabled relation missing: %',t;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid='public."CourseRoom"'::regclass AND tgname='course_space_disable' AND NOT tgisinternal AND tgenabled IN ('O','A'))
 OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.course_space_disable_guard()') AND NOT prosecdef) THEN RAISE EXCEPTION 'Expected shared INVOKER room guard missing'; END IF;
"""
    role += " IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.\"CourseStoreNotice\"'::regclass AND conname='CourseStoreNotice_kind_check') IS DISTINCT FROM $expected$" + notice + "$expected$ THEN RAISE EXCEPTION 'Shared notice constraint drift; stop before changing it'; END IF;\n"
    role += """ EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',app_role);
 -- No password is installed. Provision the new secret separately through a reviewed secure channel.
 IF has_schema_privilege(app_role,'public','CREATE') OR EXISTS(
  SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND (has_table_privilege(app_role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(app_role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
 ) THEN RAISE EXCEPTION 'Unexpected PUBLIC privileges inherited by new role'; END IF;
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',current_database(),app_role);
 EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',app_role);
"""

    def grant(table, operation, columns=None):
        nonlocal role
        op = operation + ("(" + quoted(columns) + ")" if columns else "")
        role += " EXECUTE format('GRANT " + op + ' ON public."' + table + '" TO %I' + "',app_role);\n"
        expr = " WITH CHECK(true)" if operation == "INSERT" else " USING(true)" + (" WITH CHECK(true)" if operation == "UPDATE" else "")
        role += " EXECUTE format('CREATE POLICY beauty_release_v1_" + operation.lower() + ' ON public."' + table + '" FOR ' + operation + " TO %I" + expr + "',app_role);\n"

    append_only = {"BeautyLedger", "BeautyPayment", "BeautySettlement", "BeautyCommand", "BeautyTransactionRevision"}
    for t in tables:
        grant(t, "SELECT")
        grant(t, "INSERT")
        if t not in append_only:
            grant(t, "UPDATE")
    for op, mapping in [("SELECT", READ), ("INSERT", INSERT), ("UPDATE", UPDATE)]:
        for t, columns in mapping.items():
            grant(t, op, columns)
    # Restrictive module firewall also holds if a shared table already has a permissive PUBLIC policy.
    for t in tables + list(READ):
        if t == "Store":
            scope = '"industryModule"::text=\'BEAUTY\''
        elif t == "User":
            scope = 'EXISTS(SELECT 1 FROM public."Staff" s WHERE s."userId"="User".id) OR EXISTS(SELECT 1 FROM public."Customer" c WHERE c."userId"="User".id)'
        else:
            scope = 'EXISTS(SELECT 1 FROM public."Store" bs WHERE bs.id="' + t + '"."storeId" AND bs."industryModule"::text=\'BEAUTY\')'
        statement = 'CREATE POLICY beauty_release_v1_scope ON public."' + t + '" AS RESTRICTIVE FOR ALL TO %I USING(' + scope + ') WITH CHECK(' + scope + ')'
        role += " EXECUTE format('" + statement.replace("'", "''") + "',app_role);\n"
    role += """END $$;
-- Preserve all six shared course kinds; new outcomes require Beauty namespaced subjects.
ALTER TABLE public."CourseStoreNotice" DROP CONSTRAINT "CourseStoreNotice_kind_check";
ALTER TABLE public."CourseStoreNotice" ADD CONSTRAINT "CourseStoreNotice_kind_check"
 CHECK(kind IN ('BOOKING','LEAVE','CANCEL','MOVE','STOP','RESTORE') OR ("subjectKey" LIKE 'beauty:%' AND kind IN ('COMPLETE','NO_SHOW')));
-- Column UPDATE(id) exists solely to permit SELECT FOR UPDATE. Actual updates are prohibited for this role.
CREATE FUNCTION public.beauty_release_lock_only_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user=TG_ARGV[0] THEN RAISE EXCEPTION 'Beauty runtime may lock but not mutate this shared relation'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.beauty_release_lock_only_guard() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE app_role text:=current_setting('beauty_release.runtime_role',true); t text; BEGIN
 FOREACH t IN ARRAY ARRAY['Store','CashbookEntry'] LOOP
  EXECUTE format('CREATE TRIGGER beauty_release_lock_only BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.beauty_release_lock_only_guard(%L)',t,app_role);
 END LOOP;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname=app_role AND (NOT rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
 OR EXISTS(SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=app_role)
 OR EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(app_role,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES'))
 OR has_column_privilege(app_role,'public."User"','passwordHash','SELECT') THEN RAISE EXCEPTION 'Runtime privilege postflight failed'; END IF;
END $$;
COMMIT;
"""
    (OUT / "20-runtime-role.candidate.sql").write_text(role)
    manifest = {
        "status": "CANDIDATE_REQUIRES_FORMAL_AUTHORIZATION",
        "marker": MARKER,
        "project": "qijlnhtpbintanzpxkvf",
        "databaseGuardDoesNotProveProjectIdentity": True,
        "sharedRead": READ, "sharedInsert": INSERT, "sharedUpdate": UPDATE,
        "appendOnly": sorted(append_only),
        "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.glob("*.candidate.sql")},
        "sources": {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in ["beauty-prisma/schema.prisma", "src/server/actions/beauty.ts", "src/server/actions/beauty-display-order.ts", "src/server/beauty/access.ts", "src/server/beauty/transaction-correction.ts"]},
    }
    (OUT / "release-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print("Generated schema and restricted LOGIN-role candidates locally; no database operations.")


if __name__ == "__main__":
    build()
