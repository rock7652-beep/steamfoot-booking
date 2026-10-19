import subprocess,json,pathlib,hashlib,datetime,os
root=pathlib.Path(__file__).resolve().parent
repo=root.parents[1]
candidate=(repo/'scripts/sql/sports-permanent-series-candidate.sql').read_text()
readiness=(root/'readiness.sql').read_text()
container='sports-pr1359-rehearsal-20261019'
env=os.environ.copy()
for key in ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']:env.pop(key,None)
base=['docker','--host=unix:///var/run/docker.sock','exec','-i',container]
results=[];log=[];observations=[]
def run(sql,user='postgres',db='postgres',ok=True):
 p=subprocess.run(base+['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',db],input=sql,text=True,capture_output=True,env=env)
 log.append({'user':user,'database':db,'sql':sql,'code':p.returncode,'out':p.stdout,'err':p.stderr})
 if ok and p.returncode:raise Exception(p.stderr)
 return p

def check(name,condition,detail=None):
 results.append({'name':name,'passed':bool(condition),'detail':detail})
 print(('PASS ' if condition else 'FAIL ')+name,flush=True)
 if not condition:raise Exception(name)

def ready(name,user='sports_app',prefix='',suffix='',expected=True):
 p=run(prefix+' SELECT row_to_json(r) FROM ('+readiness+') r; '+suffix,user=user)
 rows=[json.loads(x) for x in p.stdout.splitlines() if x.startswith('{')]
 row=rows[-1] if rows else None
 observations.append({'name':name,'expected':expected,'rows':rows})
 fields=['rls_enabled','version_matches','browser_blocked','app_can_use','columns_match','unique_request']
 actual=bool(row) and all(row[k] is True for k in fields)
 check(name,actual==expected,row)
 return row

try:
 run('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE sports_app LOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE untrusted_app LOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE no_login NOLOGIN; CREATE ROLE browser_parent LOGIN; GRANT browser_parent TO authenticated; CREATE TABLE public."Store"(id text PRIMARY KEY); INSERT INTO public."Store" VALUES (\'pilot\'),(\'other\'); CREATE TABLE public."CoursePointEntry"(id text PRIMARY KEY,points int); INSERT INTO public."CoursePointEntry" VALUES (\'existing-ledger\',6); CREATE TABLE public."CourseScheduleSeries"(id text PRIMARY KEY); INSERT INTO public."CourseScheduleSeries" VALUES (\'existing-music\');')
 baseline=run('SELECT md5(string_agg(t,\',\' ORDER BY t)) FROM (SELECT row_to_json(x)::text t FROM public."CoursePointEntry" x UNION ALL SELECT row_to_json(x)::text FROM public."CourseScheduleSeries" x) q;').stdout.strip()
 for name,setting in [('missing role',''),('browser role',"SET sports_migration.app_role='authenticated';"),('non LOGIN role',"SET sports_migration.app_role='no_login';"),('browser inherited role',"SET sports_migration.app_role='browser_parent';")]:
  p=run(setting+candidate,ok=False)
  check('candidate rejects '+name,p.returncode!=0)
  check('atomic rollback after '+name,run('SELECT to_regclass(\'public."SportsScheduleSeries"\') IS NULL;').stdout.strip()=='t')
 ready('missing table blocks activation',expected=False)
 run("SET sports_migration.app_role='sports_app';"+candidate)
 check('candidate installs exact SQL',run('SELECT count(*) FROM public."SportsScheduleSeries";').stdout.strip()=='0')
 check('actual connection is non owner, non superuser and no bypass',run('SELECT current_user<>(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=\'public."SportsScheduleSeries"\'::regclass) AND NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user;',user='sports_app').stdout.strip()=='t')
 ready('non owner readiness passes')
 ready('runtime search_path readiness passes',prefix='BEGIN; SET LOCAL search_path=pg_catalog,public;',suffix='ROLLBACK;')
 ready('ungranted LOGIN blocks activation',user='untrusted_app',expected=False)
 for role in ['anon','authenticated','service_role']:
  p=run('SET ROLE '+role+'; SELECT * FROM public."SportsScheduleSeries";',ok=False)
  check(role+' cannot SELECT',p.returncode!=0 and 'permission denied' in p.stderr)
  p=run('SET ROLE '+role+'; UPDATE public."SportsScheduleSeries" SET capacity=2;',ok=False)
  check(role+' cannot UPDATE',p.returncode!=0 and 'permission denied' in p.stderr)
 insert='INSERT INTO public."SportsScheduleSeries" (id,"storeId","requestKey","templateId","nameSnapshot","roomId","coachId","startsAt","endsAt","pointCost",capacity,frequency,"generatedThrough","createdById") VALUES (\'sports-series:fixture\',\'pilot\',\'fixture-key\',\'template\',\'合成固定課\',\'room\',\'coach\',\'2026-11-02T01:00Z\',\'2026-11-02T02:00Z\',1,1,\'WEEKLY\',\'2026-11-02\',\'operator\')'
 run(insert,user='sports_app')
 check('non owner INSERT and SELECT',run('SELECT count(*) FROM public."SportsScheduleSeries";',user='sports_app').stdout.strip()=='1')
 run('UPDATE public."SportsScheduleSeries" SET capacity=2 WHERE id=\'sports-series:fixture\';',user='sports_app')
 check('non owner UPDATE',run('SELECT capacity FROM public."SportsScheduleSeries";',user='sports_app').stdout.strip()=='2')
 for action in ['DELETE FROM public."SportsScheduleSeries"','TRUNCATE public."SportsScheduleSeries"','ALTER TABLE public."SportsScheduleSeries" ADD COLUMN forbidden text']:
  check('non owner denied '+action.split()[0],run(action,user='sports_app',ok=False).returncode!=0)
 check('duplicate request rejected',run(insert.replace('sports-series:fixture','sports-series:duplicate'),user='sports_app',ok=False).returncode!=0)
 check('invalid duration rejected',run('UPDATE public."SportsScheduleSeries" SET "endsAt"="startsAt";',user='sports_app',ok=False).returncode!=0)
 check('invalid frequency rejected',run('UPDATE public."SportsScheduleSeries" SET frequency=\'MONTHLY\';',user='sports_app',ok=False).returncode!=0)
 check('invalid learner JSON rejected',run('UPDATE public."SportsScheduleSeries" SET "learnerSnapshot"=\'{}\'::jsonb;',user='sports_app',ok=False).returncode!=0)
 check('unknown tenant FK rejected',run(insert.replace('sports-series:fixture','sports-series:foreign').replace("'pilot'","'absent'").replace('fixture-key','foreign-key'),user='sports_app',ok=False).returncode!=0)
 for name,mutation in [('disabled RLS','ALTER TABLE public."SportsScheduleSeries" DISABLE ROW LEVEL SECURITY;'),('changed default','ALTER TABLE public."SportsScheduleSeries" ALTER COLUMN "enrollmentMode" SET DEFAULT \'ASSIGNED\';'),('changed constraint','ALTER TABLE public."SportsScheduleSeries" DROP CONSTRAINT "SportsScheduleSeries_capacity_check";'),('changed policy','ALTER POLICY sports_series_app_select ON public."SportsScheduleSeries" USING (false);'),('browser grant','GRANT SELECT ON public."SportsScheduleSeries" TO authenticated;'),('missing app grant','REVOKE UPDATE ON public."SportsScheduleSeries" FROM sports_app;'),('missing unique key','ALTER TABLE public."SportsScheduleSeries" DROP CONSTRAINT "SportsScheduleSeries_store_request_key";')]:
  # Mutate within one isolated transaction, query as the real role, then rollback.
  ready(name+' blocks activation',user='postgres',prefix='BEGIN; '+mutation+' SET LOCAL ROLE sports_app;',suffix='ROLLBACK;',expected=False)
  ready(name+' rollback restores readiness')
 check('candidate repeat fails without overwriting',run("SET sports_migration.app_role='sports_app';"+candidate,ok=False).returncode!=0)
 check('repeat preserves row',run('SELECT count(*) FROM public."SportsScheduleSeries";',user='sports_app').stdout.strip()=='1')
 run('BEGIN; UPDATE public."SportsScheduleSeries" SET "untilDate"=\'2026-11-08\'; ROLLBACK;',user='sports_app')
 check('stop transaction rollback preserves ongoing rule',run('SELECT "untilDate" IS NULL FROM public."SportsScheduleSeries";',user='sports_app').stdout.strip()=='t')
 run('UPDATE public."SportsScheduleSeries" SET "untilDate"=\'2026-11-08\';',user='sports_app')
 check('controlled stop retains historical row',run('SELECT "untilDate"=\'2026-11-08\'::date AND "nameSnapshot"=\'合成固定課\' FROM public."SportsScheduleSeries";',user='sports_app').stdout.strip()=='t')
 ready('retained data remains usable after controlled stop')
 check('music and ledger fixtures unchanged',run('SELECT md5(string_agg(t,\',\' ORDER BY t)) FROM (SELECT row_to_json(x)::text t FROM public."CoursePointEntry" x UNION ALL SELECT row_to_json(x)::text FROM public."CourseScheduleSeries" x) q;').stdout.strip()==baseline)
 check('no Preview table created',run('SELECT to_regclass(\'public."SportsPreviewScheduleSeries"\') IS NULL;').stdout.strip()=='t')
except Exception as e:
 print('ERROR',e,flush=True)
 raise
finally:
 (root/'sql-transcript.json').write_text(json.dumps(log,ensure_ascii=False,indent=2))
 (root/'readiness-observations.json').write_text(json.dumps(observations,ensure_ascii=False,indent=2))
 (root/'results.json').write_text(json.dumps({'head':'7d4ea42cb77991e5fc0d19013bf5cd914df8a52c','candidate_sha256':hashlib.sha256(candidate.encode()).hexdigest(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results},ensure_ascii=False,indent=2))
