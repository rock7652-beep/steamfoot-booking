// Local-only backup/rollback rehearsal; never contacts a remote or deployed DB.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import pg from 'pg';
import {PrismaClient} from '@prisma/client';
import {verifyDigitalManagerReadiness} from '../digital-manager-migration-review.mjs';
const env=process.env;
if(env.DIGITAL_MANAGER_BACKUP_QA!=='1'||['VERCEL','VERCEL_ENV','VERCEL_GIT_COMMIT_REF','VERCEL_GIT_REPO_OWNER','VERCEL_GIT_REPO_SLUG','WORKERS_CI_BRANCH','CF_PAGES_BRANCH'].some(k=>env[k]))throw Error('Local-only backup QA scope required');
const container='codex-digital-manager-entry-pg17',source='digital_manager_release_handler_test',restored='digital_manager_backup_restore_test',role='postgres',out='/workspace/digital-manager-backup-qa';
const inspect=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspect.Config.Image,'postgres:17-alpine');assert.equal(inspect.Config.Labels.purpose,'isolated-digital-manager-release');
assert.deepEqual(inspect.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55438'}]);
const dumpPath=out+'/synthetic-after-migration.dump',reportPath=out+'/results.json';if(existsSync(dumpPath)||existsSync(reportPath))throw Error('Fresh artifact paths required');
const base={host:'127.0.0.1',port:55438,user:role},db=new pg.Client({...base,database:source});let restoreClient;
const tables=['Store','Customer','ServicePlan','Booking','Transaction','CourseSession','CourseBooking','QAConsumption','SteamfootStoreNotice','DigitalManagerNotice','DigitalManagerActivation','_prisma_migrations'];
const key={DigitalManagerActivation:'storeId'};
async function fingerprint(client){const out={};for(const table of tables){const id=key[table]??'id';const q=`SELECT count(*)::int AS count,md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."${id}"),'[]'::jsonb)::text) AS hash FROM public."${table}" x`;out[table]=(await client.query(q)).rows[0];}return out;}
const docker=(args,opts={})=>execFileSync('docker',['exec',container,...args],opts);
const rollback=readFileSync('prisma/reconciliation/20261030_digital_manager_rollback_review.sql','utf8');
try{
 await db.connect();const ident=(await db.query('SELECT current_database() AS db,current_user AS actor')).rows[0];assert.deepEqual(ident,{db:source,actor:role});
 assert.equal((await db.query('SELECT 1 FROM pg_database WHERE datname=$1',[restored])).rowCount,0,'restore database must not exist');
 assert.equal((await db.query(`SELECT to_regclass('public."QAConsumption"') AS present`)).rows[0].present,null,'fresh fixture required');
 const qaPrisma=new PrismaClient({datasourceUrl:`postgresql://postgres@127.0.0.1:55438/${source}`});try{assert.equal(await verifyDigitalManagerReadiness(qaPrisma),true)}finally{await qaPrisma.$disconnect()}
 await db.query(`CREATE TABLE public."QAConsumption"(id text PRIMARY KEY,"storeId" text,"bookingId" text,amount integer);
 INSERT INTO public."ServicePlan" (id,"storeId",name) VALUES ('backup-plan','steam','合成測試方案');
 INSERT INTO public."Transaction" (id,"storeId","planId","transactionType","paymentStatus",status) VALUES ('backup-payment','steam','backup-plan','PACKAGE_PURCHASE','PENDING','SUCCESS');
 INSERT INTO public."CourseSession" (id,"storeId","startsAt","endsAt") VALUES ('backup-session','course',now(),now()+interval '1 hour');
 INSERT INTO public."CourseBooking" (id,"storeId",status,"sessionId") VALUES ('backup-course-booking','course','RESERVED','backup-session');
 INSERT INTO public."QAConsumption" VALUES ('backup-consumption','steam','customer-booking',500);`);
 const beforeBackup=await fingerprint(db);
 const dump=docker(['pg_dump','-U',role,'-Fc','-d',source],{maxBuffer:64*1024*1024});assert.ok(dump.length>0);writeFileSync(dumpPath,dump,{flag:'wx',mode:0o600});
 const dumpSha=createHash('sha256').update(dump).digest('hex');
 await db.query(`INSERT INTO public."Transaction" (id,"storeId","planId","transactionType","paymentStatus",status) VALUES ('after-backup-payment','steam','backup-plan','PACKAGE_PURCHASE','PENDING','SUCCESS')`);
 const beforeRollback=await fingerprint(db);assert.equal(beforeRollback.Transaction.count,beforeBackup.Transaction.count+1);assert.equal(beforeRollback.DigitalManagerNotice.count,beforeBackup.DigitalManagerNotice.count+1);
 docker(['createdb','-U',role,restored]);
 const restore=spawnSync('docker',['exec','-i',container,'pg_restore','-U',role,'--exit-on-error','-d',restored],{input:dump,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(restore.status,0,restore.stderr);
 restoreClient=new pg.Client({...base,database:restored});await restoreClient.connect();assert.deepEqual(await fingerprint(restoreClient),beforeBackup);
 const restoredPrisma=new PrismaClient({datasourceUrl:`postgresql://postgres@127.0.0.1:55438/${restored}`});try{assert.equal(await verifyDigitalManagerReadiness(restoredPrisma),true)}finally{await restoredPrisma.$disconnect()}
 assert.equal((await restoreClient.query(`SELECT id FROM "Transaction" WHERE id='after-backup-payment'`)).rowCount,0,'a snapshot cannot contain later transactions');
 await db.query(`ALTER TABLE "CourseBooking" DISABLE TRIGGER course_incomplete_notice_resolution`);
 try{await assert.rejects(db.query(rollback));await db.query('ROLLBACK');}finally{await db.query(`ALTER TABLE "CourseBooking" ENABLE TRIGGER course_incomplete_notice_resolution`);}
 assert.deepEqual(await fingerprint(db),beforeRollback,'failed rollback must retain all records');
 await db.query(rollback);assert.deepEqual(await fingerprint(db),beforeRollback,'rollback must retain every sampled record and history');
 const state=(await db.query(`SELECT md5(p.prosrc) AS function_hash,(SELECT count(*)::int FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgname IN ('course_incomplete_notice_resolution','course_session_incomplete_notice_resolution','digital_manager_lead_notice','digital_manager_vip_notice','steamfoot_incomplete_notice_resolution','steamfoot_plan_payment_notice')) AS new_triggers FROM pg_proc p WHERE p.oid='public.record_steamfoot_store_notice()'::regprocedure`)).rows[0];
 assert.equal(state.function_hash,'1451cf57a92156d8df58c6c9bd9ecd76');assert.equal(state.new_triggers,0);
 const postPrisma=new PrismaClient({datasourceUrl:`postgresql://postgres@127.0.0.1:55438/${source}`});try{await assert.rejects(verifyDigitalManagerReadiness(postPrisma),/triggers_rejected|functions_rejected/)}finally{await postPrisma.$disconnect()}
 const result={isolated:true,postgresMajor:17,source,restoreDatabase:restored,dumpSha256:dumpSha,dumpBytes:dump.length,restoreMatchesBackup:true,restoredReadinessVerified:true,postBackupRecordPreservedInSource:true,postBackupRecordAbsentFromRestore:true,failedRollbackRetainedRecords:true,rollbackRetainedAllSampledTables:true,priorFunctionRestored:true,newTriggersRemoved:true,readinessBlocksReapplyingApplication:true,limitations:['Synthetic partial schema; not a production backup or clone','Restoration is to a separate empty database and represents the backup time only','Restore shares the original test cluster roles; independent role recreation was not tested','Prior application deployment and production backup/restore were not tested']};
 writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('PASS pg_dump backup and restore to separate empty local database');
 console.log('PASS data created after backup retained in source and absent from snapshot');
 console.log('PASS failed and completed rollback retained all synthetic business and notice rows');
 console.log('PASS prior trigger function restored and readiness blocks incompatible app');
}finally{await restoreClient?.end();await db.end();}
