import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { SQL_SHA256, MIGRATION, validateInstallationScope, installationConnection,
  runReviewedInstallation, installationFailure, verifyInstallationPackage, migrationFailureCode } from '../install-subscription-referral-private-core.mjs';

const root=resolve(import.meta.dirname,'../..');
function scope(mode='inspect') { return {GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',
  GITHUB_REPOSITORY:'rock7652-beep/steamfoot-booking',GITHUB_SHA:'a'.repeat(40),REFERRAL_APPROVED_SOURCE_SHA:'a'.repeat(40),
  REFERRAL_APPROVED_SQL_SHA256:SQL_SHA256,REFERRAL_CONFIRMATION:mode==='inspect'?'READ_ONLY_REFERRAL_INSTALL_PREFLIGHT':'INSTALL_REFERRAL_PRIVATE_CORE_ONLY'}; }

test('only permits exact manual main scope and mode-specific authorization',()=>{
  validateInstallationScope(scope(),'inspect');validateInstallationScope(scope('apply'),'apply');
  for(const patch of [{GITHUB_ACTIONS:'false'},{GITHUB_REF:'refs/heads/other'},{GITHUB_EVENT_NAME:'pull_request'},
    {GITHUB_REPOSITORY:'other/repo'},{REFERRAL_APPROVED_SOURCE_SHA:'b'.repeat(40)},
    {REFERRAL_APPROVED_SQL_SHA256:'b'.repeat(64)},{REFERRAL_CONFIRMATION:''}]) {
    assert.throws(()=>validateInstallationScope({...scope('apply'),...patch},'apply'),e=>e.code==='SCOPE_REJECTED');
  }
  assert.throws(()=>validateInstallationScope(scope(),'apply'));
  assert.throws(()=>validateInstallationScope(scope('apply'),'inspect'));
});

test('rejects wrong targets and transaction pooler; rebuilds strict TLS engine options',()=>{
  const raw='postgresql://postgres.qijlnhtpbintanzpxkvf:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';
  for(const url of [undefined,raw.replace(':5432/',':6543/'),raw.replace('qijlnhtpbintanzpxkvf','ttworfzgwejdeolegkxl'),
    raw.replace('aws-0-ap-northeast-1.pooler.supabase.com','evil.example'),raw+'?sslmode=disable',raw+'?schema=other',
    raw.replace('postgres.qijlnhtpbintanzpxkvf','steamfoot_beauty_prod_20261025.qijlnhtpbintanzpxkvf')]) {
    assert.throws(()=>installationConnection(url,'/synthetic/ca.crt'),e=>e.code==='TARGET_REJECTED');
  }
  const config=installationConnection(raw+'?options=arbitrary&sslrootcert=untrusted','/synthetic/ca.crt');
  const url=new URL(config.prismaUrl);
  assert.equal(config.pg.options,'-c default_transaction_read_only=on');
  assert.equal(url.searchParams.get('sslaccept'),'strict');assert.equal(url.searchParams.get('sslcert'),'/synthetic/ca.crt');
  assert.equal(url.searchParams.has('options'),false);assert.equal(url.searchParams.has('sslrootcert'),false);
});

test('reviewed package and source checksum agree',()=>{
  const m=verifyInstallationPackage(root);assert.equal(m.sha256,SQL_SHA256);assert.equal(m.migrationName,MIGRATION);
  const source=readFileSync(resolve(root,'scripts/install-subscription-referral-private-core.mjs'),'utf8');
  assert.ok(source.includes('ssl:{ca,rejectUnauthorized:true}'));
  assert.ok(source.includes('client.connection.stream.authorized!==true'));
});

test('CLI refuses execution outside the protected workflow before touching a connection',()=>{
  try {
    execFileSync(process.execPath,[resolve(root,'scripts/install-subscription-referral-private-core.mjs'),'--apply'],
      {env:{DIRECT_URL:'postgresql://synthetic-secret@invalid.example/postgres'},stdio:['ignore','pipe','pipe']});
    assert.fail('CLI unexpectedly accepted an unprotected invocation');
  }catch(error){
    assert.equal(error.status,1);
    const report=JSON.parse(String(error.stderr));
    assert.equal(report.failure.code,'SCOPE_REJECTED');
    assert.equal(String(error.stderr).includes('synthetic-secret'),false);
  }
});

function harness({rejected=false,corruptHistory=false,corruptPost=false,oldTarget=false}={}) {
  let applied=false;const queries=[];
  const old={id:'old',migration_name:'synthetic_prior',checksum:'old-checksum',finished_at:'2026-01-01',rolled_back_at:null,applied_steps_count:1};
  const client={query:async sql=>{
    queries.push(sql);
    if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
    if(sql.startsWith('SELECT current_database()'))return {rows:[{database:'postgres',role:'postgres'}]};
    if(sql.startsWith('-- Read-only review report.'))return {rows:[{preflight:{readOnly:true,newTablesAllAbsent:!rejected,
      requiredColumnsMatch:true,canCreateInPublic:true,canReferenceParents:true,unresolvedMigrations:0}}]};
    if(sql.startsWith('SELECT id,migration_name'))return {rows:[{...old,checksum:applied&&corruptHistory?'changed':'old-checksum'},
      ...applied||oldTarget?[{id:'new',migration_name:MIGRATION,checksum:SQL_SHA256,finished_at:'2026-11-05',rolled_back_at:null,applied_steps_count:1}]:[]]};
    if(sql.startsWith('-- Read-only report after'))return {rows:[{postflight:{readOnly:true,allFivePresent:applied,allFiveRls:true,
      apiRolesHaveNoPrivileges:true,publicHasNoPrivileges:true,constraints:{p:5,f:11,u:9},
      migration:{checksum:corruptPost?'wrong':SQL_SHA256,finished:true,rolledBack:false}}}]};
    if(sql.startsWith('SELECT EXISTS'))return {rows:[{occupied:false}]};
    throw new Error('Unexpected query in fixture');
  }};
  let calls=0;
  return {client,queries,get deployCalls(){return calls;},deploy:async()=>{calls++;applied=true;return {ok:true};}};
}

test('inspect never invokes the installer even when preflight passes',async()=>{
  const h=harness();const result=await runReviewedInstallation({...h,mode:'inspect',repositoryRoot:root});
  assert.equal(result.canInstall,true);assert.equal(result.databaseWritesPerformed,false);assert.equal(h.deployCalls,0);
  assert.equal(h.queries.some(sql=>/^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|GRANT|CREATE)\b/.test(sql)),false);
});

test('apply stops before deploy if a target exists or its ledger was already recorded',async()=>{
  for(const options of [{rejected:true},{oldTarget:true}]){
    const h=harness(options);
    await assert.rejects(runReviewedInstallation({...h,mode:'apply',repositoryRoot:root}),e=>e.code==='PREFLIGHT_REJECTED');
    assert.equal(h.deployCalls,0);assert.equal(h.queries.at(-1),'ROLLBACK');
  }
});

test('successful apply performs one deploy and checks historical ledger and empty private tables',async()=>{
  const h=harness();const result=await runReviewedInstallation({...h,mode:'apply',repositoryRoot:root});
  assert.equal(h.deployCalls,1);assert.equal(result.historicalLedgerUnchanged,true);assert.equal(result.newTablesEmpty,true);
  assert.equal(result.subscriptionChangesPerformed,false);assert.equal(result.campaignEnablementPerformed,false);
  assert.equal(h.queries.filter(sql=>sql.startsWith('SELECT EXISTS')).length,5);
});

test('migration failure is not retried or automatically resolved',async()=>{
  const h=harness();let calls=0;
  await assert.rejects(runReviewedInstallation({...h,mode:'apply',repositoryRoot:root,
    deploy:async()=>{calls++;return {ok:false};}}),e=>e.code==='MIGRATION_FAILED');
  assert.equal(calls,1);assert.equal(h.queries.some(sql=>/^\s*(INSERT|UPDATE|DELETE|ALTER)\b/i.test(sql)),false);
});

test('postflight rejects altered history or mismatched checksum without repair',async()=>{
  for(const options of [{corruptHistory:true},{corruptPost:true}]){
    const h=harness(options);
    await assert.rejects(runReviewedInstallation({...h,mode:'apply',repositoryRoot:root}),e=>e.code==='POSTFLIGHT_REJECTED');
    assert.equal(h.deployCalls,1);assert.equal(h.queries.at(-1),'ROLLBACK');
  }
});

test('failure output never includes raw secrets, unknown codes or arbitrary stages',()=>{
  const secret='synthetic-secret-do-not-emit';
  const result=installationFailure({code:secret,message:secret,stack:secret},secret);
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.deepEqual(result,{stage:'unknown',code:'UNCLASSIFIED',automaticRepairOrRetryPerformed:false});
  assert.equal(JSON.stringify(installationFailure({code:{toString:()=> 'PRISMA_P3018',secret}},'migration')).includes(secret),false);
});

test('known Prisma failures are classified without emitting their raw stderr',()=>{
  const secret='synthetic-secret-do-not-emit';
  const code=migrationFailureCode({stderr:`Error: P3018 ${secret}`});
  assert.equal(code,'PRISMA_P3018');
  assert.equal(installationFailure({code},'migration').code,'PRISMA_P3018');
  assert.equal(migrationFailureCode({stderr:secret}),'MIGRATION_FAILED');
  assert.equal(JSON.stringify(installationFailure({code,message:secret},'migration')).includes(secret),false);
});
