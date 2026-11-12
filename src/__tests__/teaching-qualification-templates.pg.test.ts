import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,expect,it} from 'vitest';
import type {Prisma} from '@prisma/client';
import {ensureQualificationTemplates} from '@/server/services/teaching-qualification-templates';
import {sportsTeachingTemplateId} from '@/server/services/sports-teaching-rule';
let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(`CREATE TABLE "MusicSubject"(id text,"storeId" text,"isActive" boolean);CREATE TABLE "CourseTemplate"(id text PRIMARY KEY,"storeId" text,name text UNIQUE,"musicSubjectId" text,"durationMinutes" int,"pointCost" int,capacity int,"updatedAt" timestamptz,"createdAt" timestamptz DEFAULT now(),visibility text,precautions text,description text,"musicScheduleMode" text);INSERT INTO "MusicSubject" VALUES('A','s',true),('B','s',true),('inactive','s',false),('foreign','other',true);INSERT INTO "CourseTemplate"(id,"storeId",name,"musicSubjectId","durationMinutes",visibility,precautions) VALUES('legacy-A','s','old','A',100,'HIDDEN','保留注意事項');`);},30000);
afterAll(async()=>db.close());
const query=async(parts:TemplateStringsArray,...values:unknown[])=>(await db.query(parts.reduce((out,part,i)=>out+part+(i<values.length?`$${i+1}`:''),''),values)).rows;
const tx={$queryRaw:query,$executeRaw:query} as unknown as Prisma.TransactionClient;
it('assigns an unpriced music item without creating a tuition or fee and retries without duplicates',async()=>{
 await ensureQualificationTemplates(tx,'s',['subject_schedule_A','subject_schedule_inactive','subject_schedule_foreign'],false);
 await ensureQualificationTemplates(tx,'s',['subject_schedule_A'],false);
 expect((await db.query('SELECT "durationMinutes",visibility,precautions FROM "CourseTemplate" WHERE id=$1',['subject_schedule_A'])).rows[0]).toEqual({durationMinutes:100,visibility:"HIDDEN",precautions:"保留注意事項"});
 expect((await db.query(`SELECT id,"musicSubjectId" FROM "CourseTemplate" WHERE id LIKE 'subject_schedule_%' ORDER BY id`)).rows).toEqual([{id:'subject_schedule_A',musicSubjectId:'A'}]);
});
it('uses the canonical sports item even before any fee product exists',async()=>{
 const id=sportsTeachingTemplateId('s','B');await ensureQualificationTemplates(tx,'s',[id,sportsTeachingTemplateId('other','foreign')],true);
 expect((await db.query('SELECT "musicSubjectId" FROM "CourseTemplate" WHERE id=$1',[id])).rows).toEqual([{musicSubjectId:'B'}]);
 expect((await db.query('SELECT count(*)::int AS n FROM "CourseTemplate"')).rows[0]).toEqual({n:3});
});
