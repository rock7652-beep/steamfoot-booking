// Exercises the production target handler + real Prisma CLI on the exact disposable DB.
// The production entrypoint is never given fake production URLs or bypass flags.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {assertImageAnnouncementsAcceptance,IMAGE_ACCEPTANCE_DATABASE} from '../image-announcements-acceptance-scope.mjs';
import {IMAGE_ANNOUNCEMENTS_MIGRATION as target,IMAGE_ANNOUNCEMENTS_MIGRATION_FILE,runImageAnnouncementsMigration,readImageAnnouncementsSnapshot,hasExpectedImageAnnouncementsSchema} from '../image-announcements-production-migration.mjs';
assertImageAnnouncementsAcceptance(process.env);
const db=new PrismaClient({datasourceUrl:IMAGE_ACCEPTANCE_DATABASE});
const tmp=mkdtempSync('/tmp/image-migration-rehearsal-'),schema=join(tmp,'schema.prisma'),migrations=join(tmp,'migrations');
const out=resolve('artifacts/image-announcements-migration-20261020');mkdirSync(out,{recursive:true});
const results=[];let stage='setup',deploys=0;
const sql=readFileSync(IMAGE_ANNOUNCEMENTS_MIGRATION_FILE,'utf8');
writeFileSync(schema,`datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\ngenerator client {\n provider = "prisma-client-js"\n}\nmodel Store {\n id String @id\n}\n`);
mkdirSync(migrations);writeFileSync(join(migrations,'migration_lock.toml'),'provider = "postgresql"\n');
function migration(name,content){mkdirSync(join(migrations,name),{recursive:true});writeFileSync(join(migrations,name,'migration.sql'),content);}
function cli(args){if(args[1]==='deploy')deploys++;try{return{exitCode:0,output:execFileSync('node_modules/.bin/prisma',[...args,'--schema',schema],{encoding:'utf8',env:{...process.env,DATABASE_URL:IMAGE_ACCEPTANCE_DATABASE,DIRECT_URL:IMAGE_ACCEPTANCE_DATABASE,PGOPTIONS:'-c lock_timeout=5s -c statement_timeout=120s'},stdio:['ignore','pipe','pipe']})};}catch(e){return{exitCode:e.status??1,output:String(e.stdout??'')+String(e.stderr??'')};}}
async function step(name,fn){stage=name;await fn();results.push({step:name,passed:true});writeFileSync(join(out,'progress.json'),JSON.stringify(results,null,2));console.log(name+': passed');}
async function clearTarget(){await db.$executeRawUnsafe('DROP TABLE IF EXISTS "ImageAnnouncementAsset"');await db.$executeRawUnsafe('DROP TABLE IF EXISTS "ImageAnnouncementSet"');await db.$executeRawUnsafe('DELETE FROM _prisma_migrations WHERE migration_name=$1',target);}
const run=()=>runImageAnnouncementsMigration(db,cli,event=>console.log(event));
try{
 const existing=await db.$queryRawUnsafe(`SELECT to_regclass('public."Store"') ::text AS present`);assert.equal(existing[0].present,null,'Rehearsal requires an empty disposable DB; do not run seed first');
 migration('20261019000000_rehearsal_baseline','CREATE TABLE "Store" (id TEXT PRIMARY KEY); INSERT INTO "Store" VALUES (\'preserved-store\');');
 assert.equal(cli(['migrate','deploy']).exitCode,0);
 await db.$executeRawUnsafe('CREATE ROLE anon');await db.$executeRawUnsafe('CREATE ROLE authenticated');await db.$executeRawUnsafe('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC,anon,authenticated');
 migration(target,sql);
 await step('first-apply-actual-prisma-migration-and-exact-schema',async()=>{assert.equal(await run(),'applied');const s=await readImageAnnouncementsSnapshot(db);assert.ok(hasExpectedImageAnnouncementsSchema(s),JSON.stringify(s));assert.equal(s.ledger.length,1);assert.deepEqual(await db.$queryRawUnsafe('SELECT id FROM "Store"'),[{id:'preserved-store'}]);});
 await step('rerun-preserves-published-data-and-ledger',async()=>{await db.$executeRawUnsafe(`INSERT INTO "ImageAnnouncementSet"("storeId",items) VALUES ('preserved-store','[{"id":"preserved-image"}]')`);await db.$executeRawUnsafe(`INSERT INTO "ImageAnnouncementAsset"(id,"storeId",content,"mimeType") VALUES ('preserved-image','preserved-store',decode('abcd','hex'),'image/jpeg')`);const count=deploys;assert.equal(await run(),'already-applied');assert.equal(deploys,count);assert.equal((await db.$queryRawUnsafe('SELECT id FROM "ImageAnnouncementAsset"'))[0].id,'preserved-image');});
 await step('anonymous-and-authenticated-direct-access-denied',async()=>{for(const role of ['anon','authenticated'])await assert.rejects(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE '+role);await tx.$queryRawUnsafe('SELECT * FROM "ImageAnnouncementAsset"');}),/permission denied/);});
 await step('schema-and-access-drift-block-rerun',async()=>{const count=deploys;for(const [change,undo] of [['ALTER TABLE "ImageAnnouncementAsset" DISABLE ROW LEVEL SECURITY','ALTER TABLE "ImageAnnouncementAsset" ENABLE ROW LEVEL SECURITY'],['GRANT SELECT ON "ImageAnnouncementAsset" TO PUBLIC','REVOKE ALL ON "ImageAnnouncementAsset" FROM PUBLIC']]){await db.$executeRawUnsafe(change);await assert.rejects(run(),/applied_state_rejected/);await db.$executeRawUnsafe(undo);}assert.equal(deploys,count);});
 await step('concurrent-handler-lock-rejected',async()=>{const holder=new PrismaClient({datasourceUrl:IMAGE_ACCEPTANCE_DATABASE});try{await holder.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(2026102010::bigint)::text');await assert.rejects(run(),/lock_unavailable/);});}finally{await holder.$disconnect();}});
 await step('unexpected-pending-migration-not-applied',async()=>{migration('20990101000000_unrelated','CREATE TABLE "UnrelatedShouldNotExist"(id INT);');const count=deploys;await assert.rejects(run(),/pending_allowlist_rejected/);assert.equal(deploys,count);assert.equal((await db.$queryRawUnsafe(`SELECT to_regclass('public."UnrelatedShouldNotExist"') ::text AS present`))[0].present,null);rmSync(join(migrations,'20990101000000_unrelated'),{recursive:true});});
 await step('checksum-ledger-drift-rejected',async()=>{const row=(await db.$queryRawUnsafe('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1',target))[0];await db.$executeRawUnsafe('UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name=$2','wrong',target);await assert.rejects(run(),/applied_state_rejected/);await db.$executeRawUnsafe('UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name=$2',row.checksum,target);});
 await step('partial-existing-table-rejected-before-deploy',async()=>{await clearTarget();await db.$executeRawUnsafe('CREATE TABLE "ImageAnnouncementSet"("storeId" TEXT PRIMARY KEY)');const count=deploys;await assert.rejects(run(),/preflight_rejected/);assert.equal(deploys,count);await db.$executeRawUnsafe('DROP TABLE "ImageAnnouncementSet"');});
 await step('failed-ddl-rolls-back-both-tables-and-blocks-retry',async()=>{migration(target,sql.replace('COMMIT;','SELECT 1/0;\nCOMMIT;'));assert.notEqual(cli(['migrate','deploy']).exitCode,0);const s=await readImageAnnouncementsSnapshot(db);assert.equal(s.relations.length,0);assert.equal(s.failed.length,1);const count=deploys;await assert.rejects(run(),/pending_allowlist_rejected/);assert.equal(deploys,count);migration(target,sql);});
 writeFileSync(join(out,'results.json'),JSON.stringify({passed:true,realPostgres:true,realPrismaCLI:true,productionHandler:true,productionConnectionUsed:false,history:'Minimal isolated baseline plus exact candidate migration; not a production database/history preflight',results},null,2));
}catch(error){writeFileSync(join(out,'failure.json'),JSON.stringify({stage,error:String(error),results},null,2));throw error;}finally{await db.$disconnect();rmSync(tmp,{recursive:true,force:true});}
