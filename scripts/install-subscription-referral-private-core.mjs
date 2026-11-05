import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stageSubscriptionReferralMigration } from './stage-subscription-referral-migration.mjs';
import { beautyProductionCaPath, verifyBeautyProductionCa } from './beauty-production-ca.mjs';

export const SQL_SHA256='9280d0494060f1e3cbff109bac26693868127b2e9c958cbe74600eccda5a1fd3';
export const MIGRATION='20261104235300_subscription_referral_private_core';
const project='qijlnhtpbintanzpxkvf';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const review='scripts/sql/subscription-referral-release-review';
const prismaCodes=new Set(['P1000','P1001','P1002','P1011','P3005','P3009','P3018']);
function isPrismaCode(value){return typeof value==='string'&&value.startsWith('PRISMA_')&&prismaCodes.has(value.slice(7));}
let phase='scope';
function fail(code){const error=new Error(code);error.code=code;throw error;}
export function migrationFailureCode(error){
  const match=String(error?.stderr??'').match(/\b(P\d{4})\b/);
  return match&&prismaCodes.has(match[1])?`PRISMA_${match[1]}`:'MIGRATION_FAILED';
}

export function validateInstallationScope(env,mode){
  const confirmation=mode==='inspect'?'READ_ONLY_REFERRAL_INSTALL_PREFLIGHT':'INSTALL_REFERRAL_PRIVATE_CORE_ONLY';
  if(!['inspect','apply'].includes(mode)||env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'
    ||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_REPOSITORY!=='rock7652-beep/steamfoot-booking'
    ||!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA??'')||env.REFERRAL_APPROVED_SOURCE_SHA!==env.GITHUB_SHA
    ||env.REFERRAL_APPROVED_SQL_SHA256!==SQL_SHA256||env.REFERRAL_CONFIRMATION!==confirmation)fail('SCOPE_REJECTED');
}

export function installationConnection(raw,caPath){
  let u;try{u=new URL(raw);}catch{fail('TARGET_REJECTED');}
  const user=decodeURIComponent(u.username);
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.pathname!=='/postgres'||u.hash
    ||Number(u.port||5432)!==5432
    ||!(u.hostname===`db.${project}.supabase.co`&&user==='postgres'
      ||/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&user===`postgres.${project}`)
    ||u.searchParams.get('sslmode')==='disable'
    ||u.searchParams.has('schema')&&u.searchParams.get('schema')!=='public')fail('TARGET_REJECTED');
  const pg={host:u.hostname,port:5432,user,password:decodeURIComponent(u.password),database:'postgres',
    connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:12000,
    application_name:'subscription-referral-private-installation-review',
    options:'-c default_transaction_read_only=on'};
  // Build a new engine URL; never inherit TLS overrides or startup options from the secret URL.
  u.search='';u.searchParams.set('schema','public');u.searchParams.set('sslmode','require');
  u.searchParams.set('sslaccept','strict');u.searchParams.set('sslcert',caPath);
  u.searchParams.set('connection_limit','1');u.searchParams.set('connect_timeout','5');
  return {pg,prismaUrl:u.toString()};
}

export function verifyInstallationPackage(repositoryRoot=root){
  const manifest=JSON.parse(readFileSync(join(repositoryRoot,review,'manifest.json'),'utf8'));
  if(manifest.sha256!==SQL_SHA256||manifest.migrationName!==MIGRATION)fail('PACKAGE_REJECTED');
  const expected=['StoreSubscriptionReferralCode','StoreSubscriptionReferral','StoreSubscriptionReferralPayment',
    'StoreSubscriptionReferralRefundReview','StoreSubscriptionReferralReward'];
  if(JSON.stringify(manifest.newTables)!==JSON.stringify(expected))fail('PACKAGE_REJECTED');
  for(const name of ['preflight.sql','postflight.sql']){
    if(createHash('sha256').update(readFileSync(join(repositoryRoot,review,name))).digest('hex')!==manifest.reviewFiles[name])fail('PACKAGE_REJECTED');
  }
  return manifest;
}

async function readonly(client,work){
  await client.query('BEGIN READ ONLY');
  try{return await work();}finally{await client.query('ROLLBACK');}
}
const ledgerSql='SELECT id,migration_name,checksum,finished_at,rolled_back_at,applied_steps_count,md5(to_jsonb(m)::text) AS record_digest FROM public."_prisma_migrations" m ORDER BY id';
function historicalRows(rows){return rows.filter(row=>row.migration_name!==MIGRATION);}

/** Uses an already verified connection; injected deploy is only called after all preconditions. */
export async function runReviewedInstallation({client,mode,deploy,repositoryRoot=root,expectedDatabase='postgres'}){
  if(!['inspect','apply'].includes(mode))fail('SCOPE_REJECTED');
  const manifest=verifyInstallationPackage(repositoryRoot);
  const staged=stageSubscriptionReferralMigration(repositoryRoot);
  try{
    if(staged.checksum!==SQL_SHA256||staged.migrationName!==MIGRATION)fail('PACKAGE_REJECTED');
    phase='preflight';
    const before=await readonly(client,async()=>{
      const identity=(await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];
      if(identity.database!==expectedDatabase||identity.role!=='postgres')fail('IDENTITY_REJECTED');
      const report=(await client.query(readFileSync(join(repositoryRoot,review,'preflight.sql'),'utf8'))).rows[0].preflight;
      const ledger=(await client.query(ledgerSql)).rows;
      return {identity,report,ledger};
    });
    const allowed=['readOnly','newTablesAllAbsent','requiredColumnsMatch','canCreateInPublic','canReferenceParents']
      .every(key=>before.report[key]===true)&&Number(before.report.unresolvedMigrations)===0
      &&before.ledger.every(row=>row.migration_name!==MIGRATION);
    if(mode==='inspect'){
      const postflight=await readonly(client,async()=>(await client.query(readFileSync(join(repositoryRoot,review,'postflight.sql'),'utf8'))).rows[0].postflight);
      return {mode,project,identity:before.identity,canInstall:allowed,preflight:before.report,postflight,databaseWritesPerformed:false};
    }
    if(!allowed)fail('PREFLIGHT_REJECTED');
    phase='migration';
    const outcome=await deploy(staged);
    if(outcome?.ok!==true)fail(isPrismaCode(outcome?.code)?outcome.code:'MIGRATION_FAILED');
    phase='postflight';
    const after=await readonly(client,async()=>{
      const report=(await client.query(readFileSync(join(repositoryRoot,review,'postflight.sql'),'utf8'))).rows[0].postflight;
      const ledger=(await client.query(ledgerSql)).rows;
      let empty=true;
      for(const table of manifest.newTables){
        // Identifiers come only from the checksum-reviewed manifest, never request input.
        if(!/^StoreSubscriptionReferral(?:Code|Payment|RefundReview|Reward)?$/.test(table))fail('PACKAGE_REJECTED');
        if((await client.query(`SELECT EXISTS(SELECT 1 FROM public."${table}" LIMIT 1) AS occupied`)).rows[0].occupied)empty=false;
      }
      return {report,ledger,empty};
    });
    const historicalUnchanged=JSON.stringify(historicalRows(before.ledger))===JSON.stringify(historicalRows(after.ledger));
    const targetRows=after.ledger.filter(row=>row.migration_name===MIGRATION);
    if(!['readOnly','allFivePresent','allFiveRls','apiRolesHaveNoPrivileges','publicHasNoPrivileges'].every(key=>after.report[key]===true)
      ||after.report.constraints?.p!==5||after.report.constraints?.f!==11||after.report.constraints?.u!==9
      ||after.report.migration?.checksum!==SQL_SHA256||after.report.migration?.finished!==true||after.report.migration?.rolledBack!==false
      ||targetRows.length!==1||!historicalUnchanged||!after.empty)fail('POSTFLIGHT_REJECTED');
    return {mode,project,migration:MIGRATION,checksum:SQL_SHA256,identity:before.identity,
      historicalLedgerUnchanged:historicalUnchanged,newTablesEmpty:true,postflight:after.report,
      subscriptionChangesPerformed:false,campaignEnablementPerformed:false};
  }finally{rmSync(staged.directory,{recursive:true,force:true});}
}

export function installationFailure(error,stage=phase){
  const codes=new Set(['SCOPE_REJECTED','TARGET_REJECTED','PACKAGE_REJECTED','IDENTITY_REJECTED','PREFLIGHT_REJECTED',
    'MIGRATION_FAILED','POSTFLIGHT_REJECTED','TLS_REJECTED','ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET','ENETUNREACH','EHOSTUNREACH',
    'SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','ERR_MODULE_NOT_FOUND','28P01','42501','42P01','42703']);
  const stages=new Set(['scope','package','certificate','target','driver','connect','TLS','preflight','migration','postflight']);
  return {stage:stages.has(stage)?stage:'unknown',code:codes.has(error?.code)
    ||isPrismaCode(error?.code)?error.code:'UNCLASSIFIED',
    automaticRepairOrRetryPerformed:false};
}

async function main(){
  const mode=process.argv.slice(2).join(' ')==='--inspect'?'inspect':process.argv.slice(2).join(' ')==='--apply'?'apply':null;
  validateInstallationScope(process.env,mode);
  phase='package';verifyInstallationPackage();
  phase='certificate';const ca=verifyBeautyProductionCa().toString();
  phase='target';
  const config=installationConnection(process.env.DIRECT_URL,beautyProductionCaPath());
  phase='driver';
  const {Client}=await import('pg');
  const client=new Client({...config.pg,ssl:{ca,rejectUnauthorized:true}});
  let result;
  try{
    phase='connect';await client.connect();phase='TLS';
    if(client.connection?.stream?.encrypted!==true||client.connection.stream.authorized!==true)fail('TLS_REJECTED');
    result=await runReviewedInstallation({client,mode,deploy:async staged=>{
      try{
        execFileSync(process.execPath,[join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',staged.schema],{
          cwd:staged.directory,timeout:90000,encoding:'utf8',stdio:['ignore','pipe','pipe'],
          env:{...process.env,DATABASE_URL:config.prismaUrl,DIRECT_URL:config.prismaUrl,CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'true'}});
        return {ok:true};
      }catch(error){return {ok:false,code:migrationFailureCode(error)};}
    }});
  }finally{await client.end();}
  console.log(JSON.stringify({...result,verifiedTls:true,sourceCommit:process.env.GITHUB_SHA},null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error(JSON.stringify({failure:installationFailure(error)}));process.exitCode=1;});
}
