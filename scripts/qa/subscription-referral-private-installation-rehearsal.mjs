// Explicit local Docker rehearsal. No connection URL input, dotenv, external network or published ports.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, chmodSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runReviewedInstallation, MIGRATION, SQL_SHA256 } from '../install-subscription-referral-private-core.mjs';

if(process.argv.slice(2).join(' ')!=='--rehearse')throw new Error('Only --rehearse is supported; local Docker only');
const root=resolve(import.meta.dirname,'../..');
const {Client}=await import('pg');
const image='postgres@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b';
const socket=mkdtempSync(join(tmpdir(),'referral-install-runner-pg17-'));chmodSync(socket,0o777);
const container=`referral-runner-qa-${randomUUID()}`;
const database='subscription_referral_runner_qa';
const fixture=readFileSync(join(root,'scripts/sql/subscription-referral-release-review/rehearsal-fixture.sql'),'utf8');
const checks=[];const clients=[];let started=false;let deployCalls=0;
function docker(args){return execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
async function connection(name){const c=new Client({host:socket,user:'postgres',database:name,connectionTimeoutMillis:3000});
  await c.connect();clients.push(c);return c;}
async function deploy(staged,name=database){
  deployCalls++;
  const url=`postgresql://postgres@localhost:5432/${name}?host=${encodeURIComponent(socket)}`;
  try{execFileSync(process.execPath,[join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',staged.schema],{
    cwd:staged.directory,timeout:30000,encoding:'utf8',stdio:['ignore','pipe','pipe'],
    env:{PATH:process.env.PATH,DATABASE_URL:url,DIRECT_URL:url,CHECKPOINT_DISABLE:'1',PRISMA_HIDE_UPDATE_MESSAGE:'true'}});
    return {ok:true};
  }catch{return {ok:false};}
}
try{
  docker(['run','--detach','--name',container,'--network','none','--memory','512m','--cpus','1',
    '--tmpfs','/var/lib/postgresql/data:rw,size=256m','--mount',`type=bind,source=${socket},target=/qa`,
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e',`POSTGRES_DB=${database}`,image,
    'postgres','-c','listen_addresses=','-c','unix_socket_directories=/var/run/postgresql,/qa']);started=true;
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    try{
      // Ignore the entrypoint's temporary initialization server; wait for final PID 1.
      if(docker(['exec',container,'cat','/proc/1/comm']).trim()!=='postgres')throw new Error('Initialization in progress');
      docker(['exec',container,'psql','-h','/qa','-U','postgres','-d',database,'-Atc','SELECT current_database()']);
      ready=true;break;
    }
    catch{await new Promise(resolve=>setTimeout(resolve,250));}
  }
  assert.equal(ready,true);
  const client=await connection(database);
  const identity=(await client.query(`SELECT current_database() AS name,inet_server_addr() IS NULL AS unix_only,current_setting('server_version_num')::int AS version`)).rows[0];
  assert.equal(identity.name,database);assert.equal(identity.unix_only,true);assert.equal(Math.floor(identity.version/10000),17);
  await client.query(fixture);
  await client.query(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
  const before=(await client.query(`SELECT jsonb_agg(to_jsonb(s) ORDER BY id) AS rows FROM "Store" s`)).rows[0].rows;
  const args={client,repositoryRoot:root,expectedDatabase:database,deploy};
  const inspected=await runReviewedInstallation({...args,mode:'inspect'});
  assert.equal(inspected.canInstall,true);assert.equal(inspected.databaseWritesPerformed,false);assert.equal(deployCalls,0);
  checks.push('inspect_mode_reads_actual_catalog_without_invoking_prisma');
  const applied=await runReviewedInstallation({...args,mode:'apply'});
  assert.equal(deployCalls,1);assert.equal(applied.historicalLedgerUnchanged,true);assert.equal(applied.newTablesEmpty,true);
  assert.equal(applied.postflight.apiRolesHaveNoPrivileges,true);assert.equal(applied.postflight.migration.checksum,SQL_SHA256);
  assert.deepEqual((await client.query(`SELECT jsonb_agg(to_jsonb(s) ORDER BY id) AS rows FROM "Store" s`)).rows[0].rows,before);
  checks.push('apply_mode_runs_one_actual_prisma_migration_and_preserves_business_rows_and_history');
  checks.push('actual_postflight_confirms_five_private_tables_constraints_checksum_and_revoked_api_grants');
  const afterward=await runReviewedInstallation({...args,mode:'inspect'});
  assert.equal(afterward.canInstall,false);assert.equal(afterward.postflight.allFivePresent,true);assert.equal(deployCalls,1);
  await assert.rejects(runReviewedInstallation({...args,mode:'apply'}),e=>e.code==='PREFLIGHT_REJECTED');
  assert.equal(deployCalls,1);
  checks.push('reinspection_reports_existing_installation_and_reapply_stops_before_deploy');
  await client.query('CREATE DATABASE subscription_referral_runner_failure_qa');
  const failing=await connection('subscription_referral_runner_failure_qa');await failing.query(fixture);
  await assert.rejects(runReviewedInstallation({client:failing,repositoryRoot:root,expectedDatabase:'subscription_referral_runner_failure_qa',mode:'apply',
    deploy:async staged=>{
      await failing.query('CREATE TABLE "StoreSubscriptionReferralPayment" (id text)');
      return deploy(staged,'subscription_referral_runner_failure_qa');
    }}),e=>e.code==='MIGRATION_FAILED');
  const failed=(await failing.query(`SELECT to_regclass('public."StoreSubscriptionReferralCode"') IS NULL AS code_absent,
    to_regclass('public."StoreSubscriptionReferral"') IS NULL AS relation_absent,
    (SELECT count(*)::int FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NULL AND rolled_back_at IS NULL) AS failed_ledger`,[MIGRATION])).rows[0];
  assert.deepEqual(failed,{code_absent:true,relation_absent:true,failed_ledger:1});assert.equal(deployCalls,2);
  checks.push('mid_install_failure_rolls_back_ddl_and_runner_does_not_retry_resolve_or_delete_failed_ledger');
  const evidence={image,postgresVersion:identity.version,migration:MIGRATION,checksum:SQL_SHA256,checks,
    isolation:'new disposable Docker PostgreSQL 17; no network or published ports; Unix socket; synthetic data only',
    limitations:['Exercises the exported install orchestration using an explicitly local connection, not the production CLI or secrets.',
      'No production migration, new role grants, campaign enablement, subscription changes or real user data involved.']};
  writeFileSync(join(root,'artifacts/subscription-referral-management/private-installation-runner-rehearsal.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence,null,2));
}finally{
  for(const client of clients)await client.end();
  if(started)docker(['rm','--force',container]);
  rmSync(socket,{recursive:true,force:true});
}
