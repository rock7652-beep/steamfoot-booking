// Exact reviewed migration only; no application imports, notifications or card debits.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {installationConnection} from './install-subscription-referral-private-core.mjs';
import {beautyProductionCaPath,verifyBeautyProductionCa} from './beauty-production-ca.mjs';
export const MIGRATION='20261112071000_course_card_provider_agreement';
export const CHECKSUM='6c11a30f461f92b49be311e5e358588cfddf4d0cd9a6fb0913f1ce78ca89262d';
const reject=code=>{throw new Error(code)};
export function validateScope(env,mode){
 if(!['inspect','apply'].includes(mode)||env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_REPOSITORY!=='rock7652-beep/steamfoot-booking'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')||env.COURSE_APPROVED_SHA!==env.GITHUB_SHA||env.COURSE_SQL_SHA256!==CHECKSUM||env.COURSE_CONFIRMATION!==(mode==='apply'?'INSTALL_COURSE_PROVIDER_AGREEMENT_ONLY':'READ_ONLY_COURSE_PROVIDER_AGREEMENT'))reject('SCOPE_REJECTED');
}
export function stageMigration(){
 const sql=readFileSync(`prisma/migrations/${MIGRATION}/migration.sql`);
 if(createHash('sha256').update(sql).digest('hex')!==CHECKSUM)reject('CHECKSUM_REJECTED');
 const dir=mkdtempSync(join(tmpdir(),'course-provider-agreement-'));
 const migration=join(dir,'migrations',MIGRATION);mkdirSync(migration,{recursive:true});
 writeFileSync(join(migration,'migration.sql'),sql);writeFileSync(join(dir,'migrations/migration_lock.toml'),'provider = "postgresql"\n');
 const schema=join(dir,'schema.prisma');writeFileSync(schema,'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n directUrl = env("DIRECT_URL")\n}\n');
 return {dir,schema};
}
const ledgerSql='SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count,md5(to_jsonb(m)::text) AS digest FROM public._prisma_migrations m ORDER BY id';
const cardSql=`SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(card)-'chargeSettingsSnapshot' ORDER BY id)::text,'[]')) AS digest FROM "CoursePointCard" card`;
const feesSql=`SELECT md5(coalesce(jsonb_agg(to_jsonb(fee) ORDER BY "storeId","templateId","staffId")::text,'[]')) AS digest FROM "CourseCompensation" fee`;
const readinessSql=`SELECT
 EXISTS(SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='CoursePointCard' AND column_name='chargeSettingsSnapshot' AND data_type='jsonb') AS column_ready,
 to_regclass('public."CoursePointCard_storeId_planId_idx"') IS NOT NULL AS index_ready,
 EXISTS(SELECT FROM pg_trigger WHERE tgname='course_card_charge_settings_snapshot' AND tgrelid='public."CoursePointCard"'::regclass AND tgenabled='O') AS trigger_ready,
 EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.course_card_capture_charge_settings()') AND NOT prosecdef AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) AS private_invoker_ready`;
async function snapshot(client){
 await client.query('BEGIN READ ONLY');try{
  const identity=(await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  if(identity.database!=='postgres'||identity.role!=='postgres')reject('IDENTITY_REJECTED');
  return {ledger:(await client.query(ledgerSql)).rows,cards:(await client.query(cardSql)).rows[0],fees:(await client.query(feesSql)).rows[0],ready:(await client.query(readinessSql)).rows[0]};
 }finally{await client.query('ROLLBACK');}
}
export async function installReviewed({client,mode,deploy}){
 const staged=stageMigration();try{
  const before=await snapshot(client);
  if(before.ledger.some(r=>!r.finished_at&&!r.rolled_back_at))reject('UNRESOLVED_MIGRATION');
  const prior=before.ledger.filter(r=>r.migration_name===MIGRATION);
  if(prior.length){
   if(prior.length!==1||prior[0].checksum!==CHECKSUM||!prior[0].finished_at||prior[0].rolled_back_at||prior[0].applied_steps_count!==1||!Object.values(before.ready).every(Boolean))reject('EXISTING_INSTALLATION_REJECTED');
   return {mode,alreadyInstalled:true,verified:true,databaseWritesPerformed:false};
  }
  if(Object.values(before.ready).some(Boolean))reject('PARTIAL_SCHEMA_REJECTED');
  if(mode==='inspect')return {mode,canInstall:true,cards:before.cards.count,databaseWritesPerformed:false};
  if(mode!=='apply')reject('MODE_REJECTED');
  await deploy(staged.schema);
  const after=await snapshot(client),installed=after.ledger.filter(r=>r.migration_name===MIGRATION);
  if(installed.length!==1||installed[0].checksum!==CHECKSUM||!installed[0].finished_at||installed[0].rolled_back_at||installed[0].applied_steps_count!==1||!Object.values(after.ready).every(Boolean))reject('POSTFLIGHT_REJECTED');
  if(JSON.stringify(before.ledger)!==JSON.stringify(after.ledger.filter(r=>r.migration_name!==MIGRATION)))reject('OTHER_LEDGER_CHANGED');
  if(JSON.stringify(before.cards)!==JSON.stringify(after.cards)||JSON.stringify(before.fees)!==JSON.stringify(after.fees))reject('BUSINESS_ROWS_CHANGED_REQUIRES_REVIEW');
  return {mode,verified:true,cards:after.cards.count,originalCardRowsUnchanged:true,originalCompensationRowsUnchanged:true,otherMigrationHistoryUnchanged:true,databaseWritesPerformed:true};
 }finally{rmSync(staged.dir,{recursive:true,force:true});}
}
async function main(){
 const mode=process.argv[2];validateScope(process.env,mode);verifyBeautyProductionCa();
 const connection=installationConnection(process.env.DIRECT_URL,beautyProductionCaPath());
 const {Client}=await import('pg');
 const client=new Client({...connection.pg,application_name:'course-provider-agreement-installation',ssl:{ca:readFileSync(beautyProductionCaPath()),rejectUnauthorized:true}});
 await client.connect();try{
  const result=await installReviewed({client,mode,deploy:async schema=>{
   try{execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema',schema],{env:{...process.env,DATABASE_URL:connection.prismaUrl,DIRECT_URL:connection.prismaUrl},stdio:'pipe',timeout:120000});}
   catch{reject('PRISMA_DEPLOY_FAILED');}
  }});
  console.log(JSON.stringify({...result,sourceCommit:process.env.GITHUB_SHA,migration:MIGRATION,checksum:CHECKSUM,verifiedTls:true}));
 }finally{await client.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({failure:error.message?.match(/^[A-Z_]+$/)?error.message:'INSTALLATION_FAILED',databaseCode:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:undefined}));process.exitCode=1;});
