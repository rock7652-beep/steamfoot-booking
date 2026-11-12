import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
import type {Prisma} from '../../generated/course-client';
import {captureTeachingPlanFees} from '@/server/services/course-plan-compensation';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE TABLE "CourseTemplate"(id text,"storeId" text,"musicSubjectId" text);
 CREATE TABLE "CoursePointCard"("storeId" text,"planId" text,"templateIds" text[],"sportsSubjectId" text,"sportsSubjectIds" text[]);
 CREATE TABLE "CoursePointPlan"(id text,"storeId" text,"templateIds" text[],"sportsSubjectId" text,"sportsSubjectIds" text[],"chargeSettings" jsonb);
 CREATE TABLE "CourseCompensation"("storeId" text,"templateId" text,"staffId" text,rules jsonb);
 CREATE TABLE "CourseTeacherCompensationSetting"("storeId" text,"staffId" text,"subjectRules" jsonb);
 CREATE TABLE "CourseSession"(id text,"storeId" text,"templateId" text,"coachId" text,"requestKey" text);
 CREATE TABLE "CourseCompensationSnapshot"("sessionId" text,"storeId" text,rule jsonb);
 INSERT INTO "CourseTemplate" VALUES('teaching:A','s','A'),('subject_schedule_A','s','A'),('tuition','s','A'),('teaching:B','s','B'),('subject_schedule_B','s','B');
 INSERT INTO "CoursePointPlan" VALUES('A1','s',ARRAY['tuition'],NULL,ARRAY[]::text[],'{"providerScope":"QUALIFIED"}'),('A2','s',ARRAY['tuition'],NULL,ARRAY[]::text[],'{"providerScope":"QUALIFIED"}'),('old','s',ARRAY['tuition'],NULL,ARRAY[]::text[],'{"providerIds":["t"]}'),('foreign','other',ARRAY['tuition'],NULL,ARRAY[]::text[],'{"providerScope":"QUALIFIED"}');
 INSERT INTO "CourseCompensation" VALUES('s','subject_schedule_A','','[{"mode":"SHARE","value":60}]'),('s','subject_schedule_B','','[{"mode":"CLASS","value":900}]');
 INSERT INTO "CourseTeacherCompensationSetting" VALUES('s','t','{"plan:A1":{"mode":"CLASS","value":600}}');
 INSERT INTO "CourseSession" VALUES('a','s','teaching:A','t','request'),('b','s','teaching:B','t','request'),('foreign','other','teaching:A','t','request');
 INSERT INTO "CourseCompensationSnapshot" VALUES('a','s','{"mode":"SHARE","value":70,"calculationVersion":2,"tuitionRules":{"tuition":{"mode":"SHARE","value":70}}}'),('b','s','{"mode":"SHARE","value":70,"calculationVersion":2}'),('foreign','other','{"mode":"SHARE","value":99}');`);
},30000);
afterAll(async()=>{await db.close();});
const tx={$executeRaw:async(parts:TemplateStringsArray,...values:unknown[])=>{const sql=parts.reduce((out,part,i)=>out+part+(i<values.length?`$${i+1}`:''),'');return db.query(sql,values);}} as unknown as Prisma.TransactionClient;
const read=async(id:string)=>(await db.query<{rule:{planRules:Record<string,unknown>}}>('SELECT rule FROM "CourseCompensationSnapshot" WHERE "sessionId"=$1',[id])).rows[0].rule;
it('captures independent plan defaults/overrides, legacy agreement and tenant boundaries',async()=>{
 await captureTeachingPlanFees(tx,'s',['a']);
 expect((await read('a')).planRules).toEqual({A1:{mode:'CLASS',value:600},A2:{mode:'SHARE',value:60},old:{mode:'SHARE',value:70}});
 expect(await read('foreign')).not.toHaveProperty('planRules');
});
it('moving a plan to B adopts B default while keeping its teacher override and old snapshots',async()=>{
 const before=await read('a');
 await db.exec(`UPDATE "CoursePointPlan" SET "templateIds"=ARRAY['subject_schedule_B'] WHERE id IN ('A1','A2') AND "storeId"='s'`);
 await captureTeachingPlanFees(tx,'s',['b']);
 expect((await read('b')).planRules).toEqual({A1:{mode:'CLASS',value:600},A2:{mode:'CLASS',value:900}});
 expect(await read('a')).toEqual(before);
});
