import {expect,it} from 'vitest';
import {readFileSync,readdirSync,rmSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {CHECKSUM,MIGRATION,validateScope,stageMigration,installReviewed} from '../../scripts/install-course-provider-agreement.mjs';
const scope={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'rock7652-beep/steamfoot-booking',GITHUB_SHA:'a'.repeat(40),COURSE_APPROVED_SHA:'a'.repeat(40),COURSE_SQL_SHA256:CHECKSUM,COURSE_CONFIRMATION:'INSTALL_COURSE_PROVIDER_AGREEMENT_ONLY'};
it('accepts only the exact approved main revision and confirmation',()=>{
 expect(()=>validateScope(scope,'apply')).not.toThrow();
 for(const change of [{GITHUB_REF:'refs/heads/other'},{GITHUB_REPOSITORY:'other/repo'},{COURSE_APPROVED_SHA:'b'.repeat(40)},{COURSE_SQL_SHA256:'bad'},{COURSE_CONFIRMATION:'READ_ONLY_COURSE_PROVIDER_AGREEMENT'},{GITHUB_EVENT_NAME:'push'},{GITHUB_ACTIONS:'false'}])expect(()=>validateScope({...scope,...change},'apply')).toThrow('SCOPE_REJECTED');
 expect(()=>validateScope(scope,'inspect')).toThrow('SCOPE_REJECTED');
 expect(()=>validateScope({...scope,COURSE_CONFIRMATION:'READ_ONLY_COURSE_PROVIDER_AGREEMENT'},'inspect')).not.toThrow();
});
it('stages exactly one checksum-reviewed Prisma migration without repository pending migrations',()=>{
 const staged=stageMigration();try{expect(readdirSync(staged.dir+'/migrations').sort()).toEqual([MIGRATION,'migration_lock.toml']);expect(readFileSync(staged.dir+'/migrations/'+MIGRATION+'/migration.sql','utf8')).toBe(readFileSync('prisma/migrations/'+MIGRATION+'/migration.sql','utf8'));}finally{rmSync(staged.dir,{recursive:true,force:true});}
});
it('inspects without deploying, applies once, preserves original cards and rates, and verifies the ledger',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
  CREATE TABLE _prisma_migrations(id text,migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz,applied_steps_count int);
  CREATE TABLE "CoursePointPlan"(id text,"storeId" text,"chargeSettings" jsonb,"templateIds" text[]);
  CREATE TABLE "CoursePointCard"(id text,"storeId" text,"planId" text,remaining int,"expiresAt" timestamptz);
  CREATE TABLE "CourseCompensation"("storeId" text,"templateId" text,"staffId" text,rules jsonb,revision int DEFAULT 1,"updatedAt" timestamptz DEFAULT now(),PRIMARY KEY("storeId","templateId","staffId"));
  CREATE TABLE "CourseTeacherCompensationSetting"("storeId" text,"staffId" text,"subjectRules" jsonb,revision int,"updatedAt" timestamptz,PRIMARY KEY("storeId","staffId"));
  CREATE TABLE "StoreFeatureEntitlement"("storeId" text,"featureKey" text,status text);
  CREATE TABLE "Staff"(id text,"storeId" text);
  INSERT INTO "CourseCompensation"("storeId","templateId","staffId",rules) VALUES('s','t','teacher','[{"mode":"SHARE","value":70}]');
  INSERT INTO "CoursePointPlan" VALUES('p','s','{"kind":"plan","durationMinutes":50,"trialPrice":null,"trialDuration":null,"providerIds":["teacher"]}',ARRAY['t']);
  INSERT INTO "CoursePointCard" VALUES('c','s','p',20,'2099-01-01');`);
  const client={query:async(sql:string)=>sql.startsWith('SELECT current_database()')?{rows:[{database:'postgres',role:'postgres'}]}:db.query(sql)};
  let calls=0;
  const deploy=async()=>{calls++;await db.exec(readFileSync('prisma/migrations/'+MIGRATION+'/migration.sql','utf8'));await db.query('INSERT INTO _prisma_migrations VALUES ($1,$2,$3,now(),null,1)',['new',MIGRATION,CHECKSUM]);};
  expect(await installReviewed({client,mode:'inspect',deploy})).toMatchObject({canInstall:true,databaseWritesPerformed:false});expect(calls).toBe(0);
  expect(await installReviewed({client,mode:'apply',deploy})).toMatchObject({verified:true,originalCardRowsUnchanged:true,originalCompensationRowsUnchanged:true});expect(calls).toBe(1);
  expect(await installReviewed({client,mode:'apply',deploy})).toMatchObject({alreadyInstalled:true,databaseWritesPerformed:false});expect(calls).toBe(1);
  await db.exec("UPDATE _prisma_migrations SET checksum='incorrect'");
  await expect(installReviewed({client,mode:'apply',deploy})).rejects.toThrow('EXISTING_INSTALLATION_REJECTED');expect(calls).toBe(1);
 }finally{await db.close();}
},30000);
