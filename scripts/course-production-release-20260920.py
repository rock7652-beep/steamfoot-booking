#!/usr/bin/env python3
"""Assemble reviewed SQL only. No connection, credentials, or execution.

The Supabase migration tool applies the output to the explicitly approved project.
Original source hashes must match the previously verified fifteen-file manifest.
"""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def literal(value):
    return "'" + value.replace("'", "''") + "'"

def main():
    manifest = json.loads((ROOT / 'docs/course-full-migration-rehearsal-20260920.json').read_text())['manifest']
    guard = json.loads((ROOT / 'docs/course-production-history-guard-20260920.json').read_text())
    chunks = []
    ledger = []
    for entry in manifest:
        path = ROOT / entry['path']
        source = path.read_text()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], entry['path']
        body = source
        if path.name == '20260917143018_course_trial_separate_payment_attendance.sql':
            assert body.count('BEGIN;') == body.count('COMMIT;') == 1
            assert body.rstrip().endswith('COMMIT;')
            body = body.replace('BEGIN;', '', 1).rsplit('COMMIT;', 1)[0]
        else:
            assert not re.search(r'^\s*(BEGIN|COMMIT);', body, re.M)
        chunks.append('-- Source: ' + entry['path'] + '\n' + body)
        if entry['path'].startswith('prisma/'):
            ledger.append(prisma_insert(path.parent.name, entry['sha256'], 'Executed exact source in atomic course release'))
        else:
            version, name = path.stem.split('_', 1)
            ledger.append('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (' + ','.join([literal(version), literal(name), 'ARRAY[' + literal(source) + ']::text[]']) + ');')
    expected = ' UNION ALL '.join('SELECT ' + literal(x['name']) + ' AS name, ' + literal(x['checksum']) + ' AS checksum' for x in guard['active_prisma'])
    preflight = '''BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(2026092015);
DO $guard$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Course%' AND c.relkind='r')
 OR EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='IndustryModule' AND e.enumlabel='COURSE') THEN
  RAISE EXCEPTION 'Course already present or partial; do not replay';
 END IF;
 IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THEN RAISE EXCEPTION 'Unresolved migration failure'; END IF;
'''
    preflight += 'IF (' + guard['trial_schema_query'] + ') IS DISTINCT FROM ' + literal(guard['trial_schema_fingerprint']) + " THEN RAISE EXCEPTION 'TrialCare schema changed: re-audit before history repair'; END IF;\n"
    preflight += '''IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE (version,name) IN (('20260916054027','trial_care_public_spa_packages'),('20260916054015','trial_care_20260916'))) <> 2 THEN RAISE EXCEPTION 'Original TrialCare history missing'; END IF;
'''
    preflight += 'IF EXISTS (WITH expected AS (' + expected + '''), actual AS (SELECT migration_name AS name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) SELECT 1 FROM ((SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) d) THEN RAISE EXCEPTION 'Active Prisma history differs from audit'; END IF;
END $guard$;
CREATE TEMP TABLE course_release_legacy_guard (name text PRIMARY KEY, digest text) ON COMMIT DROP;
'''
    # Compare original fields within one snapshot; only hashes stay in temporary storage.
    excluded = {
        'Staff': ['phone','emergencyContactName','emergencyContactPhone','courseCoachEnabled','courseQualificationsConfirmed','courseQualifiedTemplateIds','courseBirthday','emergencyContactRelation'],
        'Customer': ['emergencyContactName','emergencyContactPhone'],
        'StaffMemberLink': ['courseMemberEnabled'],
        'MessageLog': ['courseBookingId','courseCardId'],
    }
    tables = ['Store','Staff','Customer','StaffMemberLink','MessageLog','Booking','SpaBooking','Transaction']
    checks=[]
    for table in tables:
        excluded_sql = 'ARRAY[' + ','.join(map(literal,excluded.get(table,[]))) + ']::text[]'
        digest='SELECT md5(coalesce(string_agg(md5((to_jsonb(t)-'+excluded_sql+')::text),\'\' ORDER BY id),\'\')) FROM public."'+table+'" t'
        preflight+='INSERT INTO course_release_legacy_guard VALUES ('+literal(table)+',('+digest+'));\n'
        checks.append('IF ('+digest+') IS DISTINCT FROM (SELECT digest FROM course_release_legacy_guard WHERE name='+literal(table)+") THEN RAISE EXCEPTION 'Legacy data changed: "+table+"'; END IF;")
    repairs=[]
    for name in ['20260916053215_trial_care_public_spa_packages','20260916090000_trial_care']:
        checksum=hashlib.sha256((ROOT/'prisma/migrations'/name/'migration.sql').read_bytes()).hexdigest()
        repairs.append(prisma_insert(name,checksum,'History reconciliation only; existing Supabase DDL and schema fingerprint verified; no SQL replay'))
    sql=preflight+'\n'+'\n'.join(chunks)+'\nDO $verify$ BEGIN\n'+'\n'.join(checks)+'''\nIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'Course%' AND c.relkind='r' AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'Course RLS missing'; END IF;
END $verify$;
'''+ '\n'.join(repairs+ledger)+'\nCOMMIT;\n'
    out=ROOT/'docs/course-production-release-20260920.sql'
    out.write_text(sql)
    print(json.dumps({'path':str(out),'sha256':hashlib.sha256(sql.encode()).hexdigest(),'source_migrations':len(manifest),'prisma_history_only':len(repairs),'legacy_tables_checked':tables}))

def prisma_insert(name,checksum,note):
    return 'INSERT INTO public._prisma_migrations (id,checksum,finished_at,migration_name,logs,started_at,applied_steps_count) VALUES (gen_random_uuid()::text,'+literal(checksum)+',clock_timestamp(),'+literal(name)+','+literal(note)+',clock_timestamp(),1);'

if __name__=='__main__':
    main()
