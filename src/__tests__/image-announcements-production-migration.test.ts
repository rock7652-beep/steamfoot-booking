import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createImageAnnouncementsMigrationScope,IMAGE_ANNOUNCEMENTS_MIGRATION,IMAGE_ANNOUNCEMENTS_CHECKSUM,IMAGE_ANNOUNCEMENTS_MIGRATION_FILE,verifyImageAnnouncementsChecksum,readImageAnnouncementsSnapshot,hasExpectedImageAnnouncementsSchema,imageAnnouncementsLedgerApplied} from '../../scripts/image-announcements-production-migration.mjs';
it('pins the exact transactional migration and rejects schema, access and ledger drift',async()=>{
 verifyImageAnnouncementsChecksum();
 const db=new PGlite();
 const adapter={$queryRawUnsafe:async(sql:string,...params:unknown[])=>(await db.query(sql,params)).rows};
 try{
  await db.exec(`CREATE TABLE "Store"(id TEXT PRIMARY KEY); CREATE TABLE _prisma_migrations(migration_name TEXT,checksum TEXT,finished_at TIMESTAMP,rolled_back_at TIMESTAMP,applied_steps_count INT,started_at TIMESTAMP DEFAULT now()); CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC,anon,authenticated;`);
  await db.exec(readFileSync(IMAGE_ANNOUNCEMENTS_MIGRATION_FILE,'utf8'));
  await db.query('INSERT INTO _prisma_migrations(migration_name,checksum,finished_at,applied_steps_count) VALUES ($1,$2,now(),1)',[IMAGE_ANNOUNCEMENTS_MIGRATION,IMAGE_ANNOUNCEMENTS_CHECKSUM]);
  const valid=await readImageAnnouncementsSnapshot(adapter);
  expect(hasExpectedImageAnnouncementsSchema(valid),JSON.stringify(valid)).toBe(true);expect(imageAnnouncementsLedgerApplied(valid)).toBe(true);
  for(const sql of ['ALTER TABLE "ImageAnnouncementSet" DISABLE ROW LEVEL SECURITY','GRANT SELECT ON "ImageAnnouncementAsset" TO anon','GRANT SELECT ON "ImageAnnouncementAsset" TO PUBLIC','ALTER TABLE "ImageAnnouncementSet" ALTER COLUMN revision SET DEFAULT 1','DROP INDEX "ImageAnnouncementAsset_storeId_idx"','ALTER TABLE "ImageAnnouncementAsset" ADD COLUMN extra TEXT']){
   await db.exec('BEGIN');await db.exec(sql);expect(hasExpectedImageAnnouncementsSchema(await readImageAnnouncementsSnapshot(adapter))).toBe(false);await db.exec('ROLLBACK');
  }
  expect(imageAnnouncementsLedgerApplied({...valid,failed:[{name:'other'}]})).toBe(false);
  expect(imageAnnouncementsLedgerApplied({...valid,ledger:[...valid.ledger,...valid.ledger]})).toBe(false);
  expect(imageAnnouncementsLedgerApplied({...valid,ledger:[{...valid.ledger[0],checksum:'wrong'}]})).toBe(false);
  expect(imageAnnouncementsLedgerApplied({...valid,ledger:[{...valid.ledger[0],steps:0}]})).toBe(false);
 }finally{await db.close();}
});
it('the new production target still requires production environment, approved project, and non-review branch',()=>{
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,NODE_ENV:'test',VITEST:'true',VITEST_WORKER_ID:process.env.VITEST_WORKER_ID,DATABASE_URL:'',DIRECT_URL:'',PRODUCTION_MIGRATION_TARGET:IMAGE_ANNOUNCEMENTS_MIGRATION};
 for(const VERCEL_ENV of ['preview','development']){const r=spawnSync(process.execPath,['scripts/ci-migrate.mjs'],{env:{...env,VERCEL_ENV},encoding:'utf8'});expect(r.status).toBe(0);expect(r.stdout).toContain('recovery_skipped_outside_production');}
 const production=spawnSync(process.execPath,['scripts/ci-migrate.mjs'],{env:{...env,VERCEL_ENV:'production'},encoding:'utf8'});expect(production.status).toBe(1);expect(production.stderr).toContain('production_connection_rejected');expect(production.stderr).not.toContain('migration_target_rejected');
 const review=spawnSync(process.execPath,['scripts/ci-migrate.mjs'],{env:{...env,VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'feat/image-announcements'},encoding:'utf8'});expect(review.status).toBe(1);expect(review.stderr).toContain('review cannot deploy');
});

it('creates a closed CLI scope containing only the pinned announcement migration',()=>{
 const scope=createImageAnnouncementsMigrationScope();
 try{
  expect(readdirSync(join(scope.directory,'migrations')).sort()).toEqual([IMAGE_ANNOUNCEMENTS_MIGRATION,'migration_lock.toml'].sort());
  expect(readFileSync(join(scope.directory,'migrations',IMAGE_ANNOUNCEMENTS_MIGRATION,'migration.sql'),'utf8')).toBe(readFileSync(IMAGE_ANNOUNCEMENTS_MIGRATION_FILE,'utf8'));
  expect(readFileSync(scope.schema,'utf8')).toContain('url = env("DIRECT_URL")');
  expect(readFileSync(scope.schema,'utf8')).not.toContain('DATABASE_URL');
 }finally{scope.cleanup();}
 expect(existsSync(scope.directory)).toBe(false);
});
