#!/usr/bin/env python3
"""Create a new loopback-only PG17 database for production-runtime QA. No DSN input."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import uuid

assert os.environ.get('BEAUTY_PRODUCTION_SETUP') == '1', 'Explicit local setup opt-in required'
ROOT = Path(__file__).resolve().parents[2]
OUT = Path('/tmp/beauty-production-qa')
OUT.mkdir(mode=0o700, exist_ok=True)
assert not (OUT / 'env.json').exists(), 'Refuse to overwrite an existing review environment'
name = 'steamfoot-beauty-prodqa-' + uuid.uuid4().hex[:8]
admin_password, app_password = secrets.token_hex(24), secrets.token_hex(24)
envfile = OUT / 'postgres.env'
envfile.write_text('POSTGRES_PASSWORD=' + admin_password + '\nPOSTGRES_DB=beauty_1374_prodqa\n')
envfile.chmod(0o600)
env = {k:v for k,v in os.environ.items() if k not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
docker = ['docker','--host=unix:///var/run/docker.sock']

def run(args, data=None):
    r = subprocess.run(args, input=data, text=True, capture_output=True, cwd=ROOT, env=env, timeout=120)
    if r.returncode:
        raise RuntimeError(r.stderr.replace(admin_password,'[redacted]').replace(app_password,'[redacted]')[-1500:])
    return r.stdout

run(docker + ['run','-d','--name',name,'--label','steamfoot.task=beauty-1374-production-qa','--publish','127.0.0.1:32769:5432','--env-file',str(envfile),'postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24'])
envfile.unlink()
for _ in range(100):
    r = subprocess.run(docker+['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True)
    if r.returncode == 0:
        break
    time.sleep(.25)

def sql(text):
    return run(docker+['exec','-i',name,'psql','-X','-U','postgres','-d','beauty_1374_prodqa','-v','ON_ERROR_STOP=1','-Atq'],text)

sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE beauty_1374_prodapp LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '"+app_password+"'; CREATE EXTENSION btree_gist;")
for schema in ('prisma/schema.prisma','course-prisma/schema.prisma','spa-prisma/schema.prisma'):
    baseline = run([str(ROOT/'node_modules/.bin/prisma'),'migrate','diff','--from-empty','--to-schema-datamodel',schema,'--script'])
    sql(baseline)
sql('GRANT USAGE ON SCHEMA public TO beauty_1374_prodapp; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO beauty_1374_prodapp;')
sql("SET beauty_migration.app_role='beauty_1374_prodapp';\n"+(ROOT/'scripts/sql/beauty-module-candidate.sql').read_text())
url='postgresql://beauty_1374_prodapp:'+app_password+'@127.0.0.1:32769/beauty_1374_prodqa'
values={'NODE_ENV':'production','BEAUTY_PRODUCTION_QA':'1','BEAUTY_MODULE_ENABLED':'0','BEAUTY_NOTIFICATIONS_ENABLED':'0','DATABASE_URL':url,'DIRECT_URL':url,'AUTH_URL':'http://localhost:3115','NEXTAUTH_URL':'http://localhost:3115','AUTH_SECRET':secrets.token_hex(32),'AUTH_TRUST_HOST':'true','CRON_SECRET':secrets.token_hex(32),'NEXT_TELEMETRY_DISABLED':'1','TZ':'Asia/Taipei'}
(OUT/'env.json').write_text(json.dumps(values))
(OUT/'env.json').chmod(0o600)
(OUT/'fixture.json').write_text(json.dumps({'container':name,'port':32769,'database':'beauty_1374_prodqa','restrictedRole':True,'postgresVersion':sql('SHOW server_version;').strip(),'synthetic':True}))
print(json.dumps({'prepared':True,'synthetic':True,'database':'beauty_1374_prodqa','port':32769,'postgresVersion':sql('SHOW server_version;').strip()}))
