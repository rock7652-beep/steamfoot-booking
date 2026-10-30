// Review-only scoped migration runner. Not registered in ci-migrate or enabled for production.
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
export const DIGITAL_MANAGER_REVIEW_TARGET='20261030150000_digital_manager_notice';
export const DIGITAL_MANAGER_REVIEW_FILE='prisma/reconciliation/20261030_digital_manager_scoped_with_beauty_review.sql';
export const DIGITAL_MANAGER_REVIEW_CHECKSUM='7effc6fba18452850c179b6cca993e84405bf9e76729dc19ef9a088f7a57246d';
export const PREFLIGHT_FILE='scripts/qa/digital-manager-preflight-snapshot.sql';
export const PREFLIGHT_CHECKSUM='1d8c45f6968016787c62c0d704825205abc8ef7989162a84e8e342b575d60406';
export const OBSERVED_PRODUCTION_FINGERPRINT='787252b4c60e4819ffa2f79f9969fa3d';
const sha=s=>createHash('sha256').update(s).digest('hex');
const md5=s=>createHash('md5').update(s).digest('hex');
const fail=code=>{throw Error(`digital_manager_${code}`)};
function checked(path,expected){const s=readFileSync(path,'utf8');if(sha(s)!==expected)fail('checksum_mismatch');return s;}
export function verifyReviewFiles(){return {sql:checked(DIGITAL_MANAGER_REVIEW_FILE,DIGITAL_MANAGER_REVIEW_CHECKSUM),preflight:checked(PREFLIGHT_FILE,PREFLIGHT_CHECKSUM)};}
function createScope(sql){
 const dir=mkdtempSync(join(tmpdir(),'digital-manager-migration-'));
 try{const migrations=join(dir,'migrations');mkdirSync(join(migrations,DIGITAL_MANAGER_REVIEW_TARGET),{recursive:true});writeFileSync(join(migrations,DIGITAL_MANAGER_REVIEW_TARGET,'migration.sql'),sql);writeFileSync(join(migrations,'migration_lock.toml'),'provider = "postgresql"\n');const schema=join(dir,'schema.prisma');writeFileSync(schema,'datasource db {\n provider = "postgresql"\n url = env("DIRECT_URL")\n}\n');return {dir,schema,cleanup:()=>rmSync(dir,{recursive:true,force:true})};}catch(e){rmSync(dir,{recursive:true,force:true});throw e;}
}
const policyExpected=[
 ['DigitalManagerActivation','beauty_digital_activation_insert','INSERT','3a7ac8a2092fc743e423336f473c7dac','96f0708ae3228bc45a1007132e406640'],
 ['DigitalManagerActivation','beauty_digital_activation_read','SELECT','96f0708ae3228bc45a1007132e406640','3a7ac8a2092fc743e423336f473c7dac'],
 ['DigitalManagerActivation','beauty_digital_activation_update','UPDATE','96f0708ae3228bc45a1007132e406640','96f0708ae3228bc45a1007132e406640'],
 ['DigitalManagerNotice','beauty_digital_manager_insert','INSERT','3a7ac8a2092fc743e423336f473c7dac','7a15a460f6cc98ed34bb61cd0d46408d'],
 ['DigitalManagerNotice','beauty_digital_manager_read','SELECT','7a15a460f6cc98ed34bb61cd0d46408d','3a7ac8a2092fc743e423336f473c7dac'],
 ['DigitalManagerNotice','beauty_digital_manager_update','UPDATE','7a15a460f6cc98ed34bb61cd0d46408d','7a15a460f6cc98ed34bb61cd0d46408d'],
];
const triggerExpected=[
 ['course_incomplete_notice_resolution','CourseBooking','resolve_course_incomplete_notice','59c61b4cbe0d213403170ee262d10bc8'],
 ['course_session_incomplete_notice_resolution','CourseSession','resolve_course_session_incomplete_notices','f7f031ef140e76cc232bc102536c5651'],
 ['digital_manager_lead_notice','DigitalButlerLead','record_digital_manager_lead_notice','1a9763849993db75aa8e15507b02cc93'],
 ['digital_manager_vip_notice','SessionBalanceNotification','record_digital_manager_vip_notice','adec1f8658a7c14c7d777b2c713f9016'],
 ['steamfoot_incomplete_notice_resolution','Booking','resolve_steamfoot_incomplete_notice','98c77e7a8950bba2dbb19697cc8bfd0e'],
 ['steamfoot_plan_payment_notice','Transaction','record_steamfoot_plan_payment_notice','7d29c43af9769d73bd422010db0a4152'],
];
export async function verifyDigitalManagerPostflight(tx,sql=verifyReviewFiles().sql){
 const tables=await tx.$queryRawUnsafe(`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
  md5((SELECT string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin,d.adrelid),'<NULL>'),'|' ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) AS columns,
  md5((SELECT string_agg(x.conname || ':' || x.contype::text || ':' || pg_get_constraintdef(x.oid) || ':' || x.convalidated::text,'|' ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid)) AS constraints,
  md5((SELECT string_agg(i.relname || ':' || pg_get_indexdef(i.oid) || ':' || x.indisvalid::text || ':' || x.indisready::text,'|' ORDER BY i.relname) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=c.oid)) AS indexes,
  EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_access,
  EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated') AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS client_access
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('DigitalManagerActivation','DigitalManagerNotice') ORDER BY c.relname`);
 const expected=[['DigitalManagerActivation','16925753649f65b714a73d8922707a12','bcfa9795d00ded5ecd086a9f3160cd20','88bbe74feccb2aa14801f718c9451ff3'],['DigitalManagerNotice','8a49d81a26c84b01cf5745debb9f42ff','0ae80852487b38e60f56a0c8414864d2','12f0ae0ccf8d0cf426d7b0366050131f']];
 if(tables.length!==2||tables.some((r,i)=>!r.rls||r.forced||r.public_access||r.client_access||JSON.stringify([r.name,r.columns,r.constraints,r.indexes])!==JSON.stringify(expected[i])))fail('tables_rejected');
 const policies=await tx.$queryRawUnsafe(`SELECT tablename,policyname,cmd,roles::text[] AS roles,md5(coalesce(qual,'<NULL>')) AS qual,md5(coalesce(with_check,'<NULL>')) AS check FROM pg_policies WHERE schemaname='public' AND tablename IN ('DigitalManagerNotice','DigitalManagerActivation') ORDER BY tablename,policyname`);
 if(policies.length!==6||policies.some((p,i)=>JSON.stringify(p.roles)!==JSON.stringify(['steamfoot_beauty_prod_20261025'])||JSON.stringify([p.tablename,p.policyname,p.cmd,p.qual,p.check])!==JSON.stringify(policyExpected[i])))fail('policies_rejected');
 const triggers=await tx.$queryRawUnsafe(`SELECT t.tgname,c.relname,p.proname,t.tgenabled::text AS enabled,md5(pg_get_triggerdef(t.oid)) AS hash FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname IN ('course_incomplete_notice_resolution','course_session_incomplete_notice_resolution','digital_manager_lead_notice','digital_manager_vip_notice','steamfoot_incomplete_notice_resolution','steamfoot_plan_payment_notice') ORDER BY t.tgname`);
 if(triggers.length!==6||triggers.some((r,i)=>r.enabled!=='O'||JSON.stringify([r.tgname,r.relname,r.proname,r.hash])!==JSON.stringify(triggerExpected[i])))fail('triggers_rejected');
 const expectedFunctions=Object.fromEntries([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(\) RETURNS trigger[\s\S]*?AS \$notice\$([\s\S]*?)\$notice\$;/g)].map(m=>[m[1],md5(m[2])]));
 if(Object.keys(expectedFunctions).length!==7)fail('function_source_rejected');
 const funcs=await tx.$queryRawUnsafe(`SELECT p.proname,md5(p.prosrc) AS hash,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_access,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_access FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('record_steamfoot_store_notice','record_steamfoot_plan_payment_notice','record_digital_manager_lead_notice','record_digital_manager_vip_notice','resolve_steamfoot_incomplete_notice','resolve_course_incomplete_notice','resolve_course_session_incomplete_notices')`);
 if(funcs.length!==7||funcs.some(f=>f.prosecdef||f.anon_access||f.authenticated_access||f.hash!==expectedFunctions[f.proname]||JSON.stringify(f.proconfig)!==JSON.stringify(['search_path=pg_catalog, public'])))fail('functions_rejected');
 const [grants]=await tx.$queryRawUnsafe(`SELECT has_table_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"','SELECT') AND has_table_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"','INSERT') AND has_table_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerActivation"','SELECT') AND has_table_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerActivation"','INSERT') AND (SELECT bool_and(has_column_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"',c,'UPDATE')) FROM unnest(ARRAY['handledAt','handledById','handledByName','revision','updatedAt']) c) AND has_column_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerActivation"','activatedAt','UPDATE') AND NOT has_table_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"','DELETE,TRUNCATE,REFERENCES,TRIGGER') AND NOT has_table_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerActivation"','DELETE,TRUNCATE,REFERENCES,TRIGGER') AND (SELECT bool_and(NOT has_column_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerNotice"',c,'UPDATE')) FROM unnest(ARRAY['id','storeId','eventKey','eventType','targetId','createdAt']) c) AND NOT has_column_privilege('steamfoot_beauty_prod_20261025','public."DigitalManagerActivation"','storeId','UPDATE') AS ok`);
 if(!grants?.ok)fail('grants_rejected');
}
async function history(tx){const [r]=await tx.$queryRawUnsafe(`SELECT md5(coalesce(jsonb_agg(to_jsonb(m) ORDER BY id),'[]'::jsonb)::text) AS fingerprint FROM public._prisma_migrations m WHERE migration_name<>$1`,DIGITAL_MANAGER_REVIEW_TARGET);return r.fingerprint;}
/** Read-only readiness candidate for a separately guarded application deployment. */
export async function verifyDigitalManagerReadiness(prisma){
 const {sql}=verifyReviewFiles();
 const failed=await prisma.$queryRawUnsafe(`SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`);if(failed.length)fail('failed_history_rejected');
 const applied=await prisma.$queryRawUnsafe(`SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1`,DIGITAL_MANAGER_REVIEW_TARGET);
 if(applied.length!==1||applied[0].checksum!==DIGITAL_MANAGER_REVIEW_CHECKSUM||!applied[0].finished_at||applied[0].rolled_back_at||applied[0].applied_steps_count!==1)fail('readiness_ledger_rejected');
 await verifyDigitalManagerPostflight(prisma,sql);
 return true;
}
/** Private core: caller selects an explicitly guarded production or local context. */
async function runDigitalManagerReviewCore(prisma,runPrisma,expectedFingerprint,log=()=>{}){
 const {sql,preflight}=verifyReviewFiles();if(!/^[a-f0-9]{32}$/.test(expectedFingerprint))fail('fingerprint_invalid');
 return prisma.$transaction(async tx=>{
  const [lock]=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(2026103015::bigint) AS locked');if(!lock?.locked)fail('lock_unavailable');
  const failures=await tx.$queryRawUnsafe(`SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`);if(failures.length)fail('failed_history_rejected');
  const target=await tx.$queryRawUnsafe(`SELECT id FROM public._prisma_migrations WHERE migration_name=$1`,DIGITAL_MANAGER_REVIEW_TARGET);
  if(target.length){await verifyDigitalManagerReadiness(tx);log('already_applied_verified');return 'already-applied';}
  const [existing]=await tx.$queryRawUnsafe(`SELECT to_regclass('public."DigitalManagerNotice"') IS NOT NULL AS notice,to_regclass('public."DigitalManagerActivation"') IS NOT NULL AS activation`);if(existing.notice||existing.activation)fail('partial_schema_rejected');
  const [baseline]=await tx.$queryRawUnsafe(preflight);if(baseline?.fingerprint!==expectedFingerprint||baseline.relation_count!==12||baseline.function_count!==1)fail('preflight_rejected');
  const oldHistory=await history(tx),scope=createScope(sql);
  try{
   log('preflight_verified');if(runPrisma(['migrate','deploy','--schema',scope.schema]).exitCode!==0)fail('deploy_failed');
   const applied=await tx.$queryRawUnsafe(`SELECT checksum,finished_at,rolled_back_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1`,DIGITAL_MANAGER_REVIEW_TARGET);
   if(applied.length!==1||applied[0].checksum!==DIGITAL_MANAGER_REVIEW_CHECKSUM||!applied[0].finished_at||applied[0].rolled_back_at||applied[0].applied_steps_count!==1)fail('ledger_rejected');
   await verifyDigitalManagerPostflight(tx,sql);if(await history(tx)!==oldHistory)fail('unrelated_history_changed');log('postflight_verified');return 'applied';
  }finally{scope.cleanup();}
 },{maxWait:5000,timeout:180000,isolationLevel:'ReadCommitted'});
}

/** Validate provenance before constructing a production database client. */
export function assertDigitalManagerProductionEnvironment(env=process.env){
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.NODE_ENV!=='production'||env.VERCEL_GIT_COMMIT_REF!=='main'||env.VERCEL_GIT_REPO_OWNER!=='rock7652-beep'||env.VERCEL_GIT_REPO_SLUG!=='steamfoot-booking'||env.WORKERS_CI_BRANCH||env.CF_PAGES_BRANCH)fail('production_provenance_rejected');
 const valid=(value,port)=>{try{const u=new URL(value),project='qijlnhtpbintanzpxkvf',user=decodeURIComponent(u.username);return ['postgres:','postgresql:'].includes(u.protocol)&&u.pathname==='/postgres'&&!u.hash&&u.port===port&&((u.hostname===`db.${project}.supabase.co`&&user==='postgres')||(u.hostname.endsWith('.pooler.supabase.com')&&user===`postgres.${project}`))&&[...u.searchParams].every(([k,v])=>['schema','pgbouncer','sslmode','connection_limit','pool_timeout','connect_timeout','sslaccept','sslcert','sslrootcert','statement_cache_size'].includes(k)&&u.searchParams.getAll(k).length===1&&(k!=='schema'||v==='public')&&(k!=='sslmode'||['require','verify-ca','verify-full'].includes(v))&&(k!=='sslaccept'||v==='strict'));}catch{return false;}};
 if(!valid(env.DATABASE_URL,'6543')||!valid(env.DIRECT_URL,'5432'))fail('production_connection_rejected');
}
export async function runDigitalManagerProductionCandidate(prisma,runPrisma,env=process.env,log=()=>{}){
 assertDigitalManagerProductionEnvironment(env);
 if(env.PRODUCTION_MIGRATION_TARGET!==DIGITAL_MANAGER_REVIEW_TARGET)fail('production_target_rejected');
 return runDigitalManagerReviewCore(prisma,runPrisma,OBSERVED_PRODUCTION_FINGERPRINT,log);
}
/** Dedicated loopback-only rehearsal; no deployed metadata or production endpoint. */
export function assertDigitalManagerLocalEnvironment(env=process.env){
 const url='postgresql://postgres@127.0.0.1:55438/digital_manager_release_handler_test';
 if(env.DIGITAL_MANAGER_MIGRATION_QA!=='1'||env.NODE_ENV!=='test'||env.DATABASE_URL!==url||env.DIRECT_URL!==url||['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','WORKERS_CI_BRANCH','CF_PAGES_BRANCH'].some(k=>env[k]))fail('local_scope_rejected');
}
export async function runDigitalManagerLocalRehearsal(prisma,runPrisma,env=process.env,log=()=>{}){
 assertDigitalManagerLocalEnvironment(env);
 const files=verifyReviewFiles();const [snapshot]=await prisma.$queryRawUnsafe(files.preflight);
 return runDigitalManagerReviewCore(prisma,runPrisma,snapshot.fingerprint,log);
}
