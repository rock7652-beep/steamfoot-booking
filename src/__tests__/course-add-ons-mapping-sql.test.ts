import {expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import type {Prisma} from '@prisma/client';
vi.mock('@/lib/db',()=>({prisma:{}}));
vi.mock('@/lib/industry-module-server',()=>({requireCourseStore:vi.fn()}));
vi.mock('@/lib/permissions',()=>({checkPermission:vi.fn()}));
vi.mock('@/server/services/music-finance-access',()=>({readMusicFinanceScope:vi.fn()}));
vi.mock('@/server/services/shared-goods-availability',()=>({sharedGoodsAvailable:async()=>false}));
import {lockCourseAddOnSubject} from '@/server/services/course-add-ons';
it('resolves A through actual session/template joins and rejects foreign booking/store combinations',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY);INSERT INTO "Store" VALUES('s'),('other');
 CREATE TABLE "MusicSubject"(id text,"storeId" text,"isActive" boolean);INSERT INTO "MusicSubject" VALUES('A','s',true),('B','s',true),('foreign','other',true);
 CREATE TABLE "CourseTemplate"(id text,"storeId" text,"musicSubjectId" text);INSERT INTO "CourseTemplate" VALUES('t','s','A'),('u','s','B');
 CREATE TABLE "CourseSession"(id text,"storeId" text,"templateId" text,"cancelledAt" timestamp,"teacherAttendance" text);INSERT INTO "CourseSession" VALUES('A1','s','t',null,'SCHEDULED'),('A2','s','t',null,'SCHEDULED'),('B1','s','u',null,'SCHEDULED');
 CREATE TABLE "CourseBooking"(id text,"storeId" text,"sessionId" text,"customerId" text,status text);INSERT INTO "CourseBooking" VALUES('p1','s','A1','c','BOOKED'),('p2','s','A2','c','BOOKED'),('p3','s','B1','c','BOOKED');`);
 await db.transaction(async client=>{
 const tx={$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{const sql=strings.reduce((s,part,i)=>s+(i?'$'+i:'')+part,'');return (await client.query(sql,values)).rows;}} as unknown as Prisma.TransactionClient;
 expect((await lockCourseAddOnSubject(tx,'s','A1','p1')).serviceId).toBe('A');
 expect((await lockCourseAddOnSubject(tx,'s','A2','p2')).serviceId).toBe('A');
 expect((await lockCourseAddOnSubject(tx,'s','B1','p3')).serviceId).toBe('B');
 await expect(lockCourseAddOnSubject(tx,'other','A1','p1')).rejects.toThrow('不屬於');
 await client.exec(`UPDATE "MusicSubject" SET "isActive"=false WHERE id='A'`);
 expect((await lockCourseAddOnSubject(tx,'s','A1','p1')).serviceId).toBeNull();
 });
 }finally{await db.close();}
});
