#!/usr/bin/env python3
"""Destructive cases ONLY in a labelled, network-none Docker PG17 container.

No DSN argument; never reads .env, connects to existing databases or deploys.
Opt in with BEAUTY_RELEASE_REHEARSAL=1. Leaves the owned container stopped and
private backups in /tmp. No host mounts or published ports are allowed.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
assert os.environ.get('BEAUTY_RELEASE_REHEARSAL') == '1', 'Explicit rehearsal opt-in required'
IMAGE = 'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'
RUN = uuid.uuid4().hex[:8]
NAME = 'steamfoot-beauty-release-' + RUN
OUT = Path('/tmp/beauty-release-rehearsal') / RUN
OUT.mkdir(parents=True, mode=0o700)
ENV = {k: v for k, v in os.environ.items() if k not in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD', 'PGSERVICE', 'PGOPTIONS')}
D = ['docker', '--host=unix:///var/run/docker.sock']
RESULTS = []
STAGE = 'start'
BASE = 'beauty_release_base'
APP = 'beauty_release_app'
CANDIDATE = (ROOT / 'scripts/sql/beauty-module-candidate.sql').read_text()
SQL_HASH = hashlib.sha256(CANDIDATE.encode()).hexdigest()


def command(args, data=None, check=True, timeout=120):
    r = subprocess.run(args, input=data, text=True, capture_output=True, env=ENV, timeout=timeout, cwd=ROOT)
    if check and r.returncode:
        raise AssertionError(r.stderr.strip()[-1600:])
    return r


def docker(args, data=None, check=True):
    return command(D + args, data, check)


def sql(db, text, role='postgres', check=True):
    assert re.fullmatch(r'beauty_release_[a-z0-9_]+', db)
    assert role in ('postgres', APP, 'anon', 'authenticated', 'service_role', 'beauty_release_unrelated')
    return docker(['exec', '-i', NAME, 'psql', '-X', '-h', '127.0.0.1', '-U', role, '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq'], text, check)


def scalar(db, text):
    return sql(db, text).stdout.strip()


def clone(suffix, template=BASE):
    db = 'beauty_release_' + suffix
    assert template == 'template0' or re.fullmatch(r'beauty_release_[a-z0-9_]+', template)
    docker(['exec', NAME, 'createdb', '-U', 'postgres', '-T', template, db])
    return db


def dump(db):
    raw = docker(['exec', NAME, 'pg_dump', '-U', 'postgres', '--no-comments', db]).stdout
    # PG17 emits randomized psql restrict tokens; omit only these paired guards
    # for comparisons. Keep the original guards in saved/restored backups.
    raw = re.sub(r'^\\(?:un)?restrict .*$\n?', '', raw, flags=re.M)
    # PG17 flattens an associative AND group when restoring this BETWEEN check.
    # Normalize only that exact spelling, retaining every predicate and OR group.
    return raw.replace('((duration >= 5) AND (duration <= 720)) AND', '(duration >= 5) AND (duration <= 720) AND')


def digest(db):
    return hashlib.sha256(dump(db).encode()).hexdigest()


def install(db, text=CANDIDATE, role=APP, expected=None):
    prefix = '' if role is None else "SET beauty_migration.app_role='" + role + "';\n"
    r = sql(db, prefix + text, check=expected is None)
    if expected is not None:
        assert r.returncode, 'Expected installation to fail'
        assert re.search(expected, r.stderr), r.stderr[-1000:]
    return r


def pass_case(label):
    RESULTS.append({'case': label, 'passed': True})
    print(json.dumps(RESULTS[-1], ensure_ascii=False), flush=True)


def fail_atomic(suffix, setup, pattern, text=CANDIDATE, role=APP):
    db = clone(suffix)
    if setup:
        sql(db, setup)
    before = digest(db)
    install(db, text, role, pattern)
    assert digest(db) == before, 'Failed installation changed schema, ACL or data'
    return db


def verify(db):
    assert scalar(db, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'Beauty%'") == '13'
    assert scalar(db, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'Beauty%' AND c.relrowsecurity") == '13'
    assert scalar(db, "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'Beauty%' AND policyname='beauty_backend' AND roles=ARRAY['beauty_release_app']::name[]") == '13'
    assert scalar(db, "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('beauty_payment_immutable','beauty_ledger_immutable','beauty_settlement_immutable')") == '3'
    assert scalar(db, "SELECT count(*) FROM pg_constraint WHERE conname IN ('beauty_teacher_overlap','beauty_location_overlap','beauty_customer_overlap') AND contype='x'") == '3'
    assert scalar(db, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'Beauty%' AND (has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('service_role',c.oid,'SELECT') OR has_table_privilege('beauty_release_unrelated',c.oid,'SELECT'))") == '0'


created = False
passed = False
try:
    STAGE = 'container'
    docker(['run', '-d', '--name', NAME, '--network', 'none', '--label', 'steamfoot.task=beauty-1374-release', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE])
    created = True
    meta = json.loads(docker(['inspect', NAME]).stdout)[0]
    assert meta['HostConfig']['NetworkMode'] == 'none' and not meta['HostConfig'].get('Binds')
    assert all(m['Type'] == 'volume' and m['Destination'] == '/var/lib/postgresql/data' for m in meta['Mounts'])
    assert not meta['HostConfig'].get('PortBindings') and meta['Config']['Labels']['steamfoot.task'] == 'beauty-1374-release'
    for _ in range(100):
        r = docker(['exec', NAME, 'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-Atc', 'show server_version'], check=False)
        if r.returncode == 0:
            break
        time.sleep(.25)
    version = r.stdout.strip()
    assert version.startswith('17.'), version
    STAGE = 'baseline'
    main = command([str(ROOT / 'node_modules/.bin/prisma'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script']).stdout
    course = command([str(ROOT / 'node_modules/.bin/prisma'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'course-prisma/schema.prisma', '--script']).stdout
    assert "CREATE TYPE \"IndustryModule\" AS ENUM ('BEAUTY'," in main
    main = main.replace("CREATE TYPE \"IndustryModule\" AS ENUM ('BEAUTY', ", "CREATE TYPE \"IndustryModule\" AS ENUM (", 1)
    docker(['exec', NAME, 'createdb', '-U', 'postgres', BASE])
    sql(BASE, "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE beauty_release_unrelated LOGIN; CREATE ROLE beauty_release_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; CREATE ROLE beauty_release_unsafe LOGIN; GRANT postgres TO beauty_release_unsafe;")
    sql(BASE, main + course)
    sql(BASE, '''CREATE EXTENSION btree_gist;
INSERT INTO "Store"(id,name,slug,"updatedAt") VALUES ('s','synthetic','synthetic',now()),('other','other','other',now());
INSERT INTO "User"(id,name,"updatedAt") VALUES ('u','synthetic',now());
INSERT INTO "Customer"(id,"storeId",name,phone,"updatedAt") VALUES ('c','s','synthetic','0900000000',now());
INSERT INTO "CourseRoom"(id,"storeId",name) VALUES ('room','s','synthetic'),('foreign','other','foreign');
CREATE TABLE "LegacyReleaseSentinel"(id text PRIMARY KEY, amount integer NOT NULL);
INSERT INTO "LegacyReleaseSentinel" VALUES ('preserve',7652);
ALTER TABLE "LegacyReleaseSentinel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_sentinel ON "LegacyReleaseSentinel" TO beauty_release_unrelated USING (false);
CREATE FUNCTION legacy_release_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER legacy_audit BEFORE UPDATE ON "LegacyReleaseSentinel" FOR EACH ROW EXECUTE FUNCTION legacy_release_audit();
GRANT SELECT ON "LegacyReleaseSentinel" TO beauty_release_unrelated;
GRANT SELECT ON "Store","Customer","User","CourseRoom" TO beauty_release_app;''')
    base_backup = docker(['exec', NAME, 'pg_dump', '-U', 'postgres', '--no-comments', BASE]).stdout
    (OUT / 'preinstall.sql').write_text(base_backup)
    (OUT / 'preinstall.sql').chmod(0o600)
    pass_case('專用無網路PG17容器，完整main/course Prisma空白基準及舊資料／RLS／trigger哨兵；備份未含正式資料')
    STAGE = 'prerequisites'
    fail_atomic('no_extension', 'DROP EXTENSION btree_gist;', 'btree_gist')
    fail_atomic('no_role', '', 'restricted backend LOGIN', role=None)
    fail_atomic('super_role', '', 'restricted backend LOGIN', role='postgres')
    fail_atomic('inherited_owner', '', 'inherit migration/schema owner', role='beauty_release_unsafe')
    pass_case('缺extension、缺app_role、superuser及繼承管理角色皆在DDL前拒絕，整庫dump一致')
    fail_atomic('partial', 'CREATE TABLE "BeautyUnexpected"(id text); INSERT INTO "BeautyUnexpected" VALUES (\'preserve\');', 'Beauty objects already exist')
    pass_case('部分安裝狀態安全停止，保留未知Beauty物件及原資料，不猜測修補或刪除')
    fail_atomic('fk_failure', 'DROP INDEX "CourseRoom_id_storeId_key" CASCADE;', 'no unique constraint matching')
    pass_case('缺共用複合唯一鍵造成中段FK安裝失敗，新增enum／表／約束全數回滾，整庫dump一致')
    fail_atomic('late_failure', '', 'deliberate rehearsal failure', CANDIDATE.replace('COMMIT;', "DO $$ BEGIN RAISE EXCEPTION 'deliberate rehearsal failure'; END $$;\nCOMMIT;"))
    pass_case('RLS與GRANT完成後、COMMIT前注入失敗，表／enum／函式／policy／ACL全數回滾')
    STAGE = 'disconnect'
    db = clone('disconnect')
    before = digest(db)
    text = "SET application_name='beauty-release-disconnect'; SET beauty_migration.app_role='beauty_release_app';\n" + CANDIDATE.replace('COMMIT;', 'SELECT pg_sleep(20);\nCOMMIT;')
    proc = subprocess.Popen(D + ['exec', '-i', NAME, 'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    proc.stdin.write(text)
    proc.stdin.close()
    for _ in range(100):
        pid = scalar(db, "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name='beauty-release-disconnect' AND wait_event='PgSleep'")
        if pid:
            break
        time.sleep(.1)
    assert pid and pid.isdigit(), 'Never reached pre-commit pause'
    scalar(db, 'SELECT pg_terminate_backend(' + pid + ')')
    assert proc.wait(timeout=10) != 0
    assert digest(db) == before
    install(db)
    verify(db)
    pass_case('COMMIT前真正終止安裝連線，確認完整回滾；再用原SQL可成功安裝')
    STAGE = 'extension namespace'
    old = command(['git', 'show', '14848383:scripts/sql/beauty-module-candidate.sql']).stdout
    ext = clone('extension_schema')
    sql(ext, 'CREATE SCHEMA extensions; ALTER EXTENSION btree_gist SET SCHEMA extensions;')
    before = digest(ext)
    install(ext, old)
    verify(ext)
    ext = clone('extension_schema_new')
    sql(ext, 'CREATE SCHEMA extensions; ALTER EXTENSION btree_gist SET SCHEMA extensions;')
    install(ext)
    verify(ext)
    assert scalar(ext, "SELECT extnamespace::regnamespace FROM pg_extension WHERE extname='btree_gist'") == 'extensions'
    pass_case('原候選及修正版均可在btree_gist位於extensions時成功安裝；不移動extension，13表仍在public')
    shadow = clone('shadow_old')
    sql(shadow, 'CREATE SCHEMA release_shadow;')
    install(shadow, 'SET search_path=release_shadow,public;\n' + old)
    assert scalar(shadow, "SELECT count(*) FROM information_schema.tables WHERE table_schema='release_shadow' AND table_name LIKE 'Beauty%'") == '13'
    shadow = clone('shadow_new')
    sql(shadow, 'CREATE SCHEMA release_shadow;')
    install(shadow, 'SET search_path=release_shadow,public;\n' + CANDIDATE)
    verify(shadow)
    assert scalar(shadow, "SELECT count(*) FROM information_schema.tables WHERE table_schema='release_shadow' AND table_name LIKE 'Beauty%'") == '0'
    pass_case('原候選會隨search_path誤建13表到shadow；修正版釘選public後13表／policy／trigger位置正確')
    STAGE = 'success'
    db = clone('success')
    legacy_before = scalar(db, '''SELECT jsonb_build_array((SELECT jsonb_agg(t) FROM "Store" t),(SELECT jsonb_agg(t) FROM "Customer" t),(SELECT jsonb_agg(t) FROM "CourseRoom" t),(SELECT jsonb_agg(t) FROM "LegacyReleaseSentinel" t));''')
    install(db)
    verify(db)
    assert scalar(db, '''SELECT jsonb_build_array((SELECT jsonb_agg(t) FROM "Store" t),(SELECT jsonb_agg(t) FROM "Customer" t),(SELECT jsonb_agg(t) FROM "CourseRoom" t),(SELECT jsonb_agg(t) FROM "LegacyReleaseSentinel" t));''') == legacy_before
    assert scalar(db, "SELECT count(*) FROM pg_policies WHERE tablename='LegacyReleaseSentinel' AND policyname='legacy_sentinel'") == '1'
    assert scalar(db, "SELECT count(*) FROM pg_trigger WHERE tgname='legacy_audit'") == '1'
    before_inspect = digest(db)
    inspection = sql(db, "SET beauty_migration.app_role='beauty_release_app';\n" + (ROOT / 'scripts/sql/beauty-module-inspect.sql').read_text()).stdout
    (OUT / 'catalog-inspection.txt').write_text(inspection)
    assert digest(db) == before_inspect
    pass_case('成功安裝13表、13RLS及限定backend policy、3不可變trigger、3排他約束；既有哨兵資料／RLS／trigger不變')
    STAGE = 'restricted backend'
    sql(db, '''INSERT INTO "BeautyService"(id,"storeId",name,duration,price) VALUES ('svc','s','synthetic',60,1000);
INSERT INTO "BeautyTechnician"(id,"storeId",name,gender,"serviceIds",weekly) VALUES ('t','s','synthetic','FEMALE',ARRAY['svc'],'[]');
INSERT INTO "BeautyPlan"(id,"storeId",name,sessions,price,"validDays","serviceIds") VALUES ('plan','s','synthetic',5,5000,30,ARRAY['svc']);
INSERT INTO "BeautyCard"(id,"storeId","customerId","memberIds","planId",name,sessions,remaining,"listPrice",paid,"serviceIds","allowShared","expiresAt") VALUES ('card','s','c',ARRAY['c'],'plan','synthetic',5,5,5000,5000,ARRAY['svc'],false,'2099-01-01');
INSERT INTO "BeautyLedger"(id,"storeId","cardId",kind,delta) VALUES ('ledger','s','card','GRANT',5);
INSERT INTO "BeautyPayment"(id,"storeId","cardId",kind,amount,method,note,"actorUserId") VALUES ('payment','s','card','SALE',5000,'OTHER','synthetic','u');
INSERT INTO "BeautySettlement"(id,"storeId",month,fingerprint,lines,"actorUserId") VALUES ('settlement','s','2026-10','synthetic','[]','u');''', APP)
    for role in ('anon', 'authenticated', 'service_role', 'beauty_release_unrelated'):
        assert sql(db, 'SELECT * FROM "BeautyPayment";', role, False).returncode
    for table in ('BeautyLedger', 'BeautyPayment', 'BeautySettlement'):
        r = sql(db, f'UPDATE "{table}" SET id=id;', APP, False)
        assert r.returncode and 'immutable' in r.stderr
        assert sql(db, f'DELETE FROM "{table}";', APP, False).returncode
    pass_case('真正restricted LOGIN可合法寫入；anon／authenticated／service_role／無關LOGIN均拒讀，三種財務表UPDATE及DELETE拒絕')
    before = digest(db)
    install(db, expected='Beauty objects already exist')
    assert digest(db) == before
    pass_case('已成功且已有帳務時重跑安全拒絕；完整schema／ACL／資料dump不變，無重複表或刪帳')
    STAGE = 'backup restore'
    backup = docker(['exec', NAME, 'pg_dump', '-U', 'postgres', '--no-comments', db]).stdout
    (OUT / 'populated.sql').write_text(backup)
    (OUT / 'populated.sql').chmod(0o600)
    restored = clone('restored', 'template0')
    sql(restored, backup)
    verify(restored)
    assert digest(restored) == digest(db)
    for values in [(4,0,1,'NULL'),(721,0,1,'NULL'),(60,-1,1,'NULL'),(60,0,-1,'NULL'),(60,0,1,'-1')]:
        duration, buffer, price, trial = values
        invalid = sql(restored, f'''INSERT INTO "BeautyService"(id,"storeId",name,duration,buffer,price,"trialPrice") VALUES ('invalid','s','invalid',{duration},{buffer},{price},{trial});''', APP, False)
        assert invalid.returncode and 'beauty_service_values' in invalid.stderr
    assert sql(restored, 'UPDATE "BeautyPayment" SET id=id;', APP, False).returncode
    clean = clone('preinstall_restored', 'template0')
    sql(clean, base_backup)
    assert digest(clean) == digest(BASE)
    install(clean)
    verify(clean)
    pass_case('安裝前備份可還原到新庫再安裝；含不可變財務資料的安裝後備份可完整還原，資料／policy／ACL／trigger一致')
    STAGE = 'bounded locks'
    lock_db = clone('lock_timeout')
    locker = subprocess.Popen(D + ['exec', '-i', NAME, 'psql', '-X', '-U', 'postgres', '-d', lock_db, '-v', 'ON_ERROR_STOP=1', '-Atq'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
    locker.stdin.write('BEGIN; LOCK TABLE "Store" IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(20); ROLLBACK;\n')
    locker.stdin.close()
    for _ in range(80):
        locked = scalar(lock_db, "SELECT count(*) FROM pg_locks WHERE relation='\"Store\"'::regclass AND mode='AccessExclusiveLock' AND granted")
        if locked == '1':
            break
        time.sleep(.1)
    assert locked == '1'
    start = time.monotonic()
    install(lock_db, expected='lock timeout')
    elapsed = time.monotonic() - start
    assert 4 <= elapsed < 12, elapsed
    assert scalar(lock_db, "SELECT count(*) FROM pg_class WHERE relname LIKE 'Beauty%'") == '0'
    scalar(lock_db, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event='PgSleep'")
    locker.wait(timeout=10)
    assert digest(lock_db) == digest(BASE)
    pass_case('共用Store遭排他鎖時約5秒安全失敗，候選不無限等待；解鎖後無部分表／enum或原資料變動')
    STAGE = 'complete'
    passed = True
finally:
    report = {'runId': RUN, 'container': NAME, 'image': IMAGE, 'postgresVersion': locals().get('version'), 'candidateSha256': SQL_HASH, 'baselineMainSha256': hashlib.sha256(locals().get('main', '').encode()).hexdigest(), 'baselineCourseSha256': hashlib.sha256(locals().get('course', '').encode()).hexdigest(), 'synthetic': True, 'network': 'none', 'publishedPorts': False, 'hostMounts': False, 'passed': passed, 'stage': STAGE, 'results': RESULTS, 'limitations': ['Generated full main/course schema, not production migration history or hosted custom objects', 'No production connection or Supabase pooler/extension privilege proof', 'LOGIN/ACL verified via isolated trust auth; not production credential authentication', 'Private backup/restore into fresh database, not hosted PITR or overwrite of business data', 'Dump comparisons normalize randomized psql restrict guards and one equivalent associative AND grouping in the duration check', 'Application deployment, feature activation, LINE and real money not exercised']}
    (OUT / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if created:
        docker(['stop', NAME], check=False)
    print(json.dumps({'output': str(OUT), 'passed': passed, 'stage': STAGE}), flush=True)
