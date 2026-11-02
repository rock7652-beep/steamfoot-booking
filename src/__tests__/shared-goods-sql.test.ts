import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import type {Prisma} from '@prisma/client';
import {lockSharedGoodsSubject} from '@/server/services/shared-goods-subject';
it('migrates without rewriting people, isolates parties, and protects quantity totals and history',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE "Store"(id text PRIMARY KEY);INSERT INTO "Store" VALUES('s'),('other');
 CREATE TABLE "ServiceAddOnOrder"(id text PRIMARY KEY,"storeId" text,module text,"bookingId" text,"participantId" text NOT NULL,items jsonb NOT NULL DEFAULT '[]',total integer DEFAULT 0,revision integer DEFAULT 1,UNIQUE("storeId",module,"participantId"));
 INSERT INTO "ServiceAddOnOrder" VALUES('personal','s','STEAMFOOT','steam','one','[{"quantity":1}]',80,1);
 CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"customerId" text,"bookingStatus" text);INSERT INTO "Booking" VALUES('steam','s','c','RESERVED');
 CREATE TABLE "BookingParticipantGroup"(id text PRIMARY KEY,"storeId" text,"bookingId" text);INSERT INTO "BookingParticipantGroup" VALUES('sg','s','steam');
 CREATE TABLE "BookingParticipant"(id text PRIMARY KEY,"storeId" text,"groupId" text,status text);INSERT INTO "BookingParticipant" VALUES('one','s','sg','PENDING'),('two','s','sg','PENDING');
 CREATE TABLE "MusicSubject"(id text,"storeId" text,"isActive" boolean);INSERT INTO "MusicSubject" VALUES('A','s',true);
 CREATE TABLE "CourseTemplate"(id text,"storeId" text,"musicSubjectId" text);INSERT INTO "CourseTemplate" VALUES('t','s','A');
 CREATE TABLE "CourseSession"(id text PRIMARY KEY,"storeId" text,"templateId" text,"cancelledAt" timestamp,"teacherAttendance" text);INSERT INTO "CourseSession" VALUES('class','s','t',null,'SCHEDULED');
 CREATE TABLE "CourseBooking"(id text PRIMARY KEY,"storeId" text,"sessionId" text,"groupKey" text,"reserverCustomerId" text,"operatorCustomerId" text,"operatorUserId" text,"customerId" text,status text);INSERT INTO "CourseBooking" VALUES('p1','s','class','g','c',null,'u','c','RESERVED'),('p2','s','class','g','c',null,'u','companion','RESERVED'),('p3','s','class',null,'d',null,'u','d','RESERVED');`);
 const sql=readFileSync('prisma/migrations/20261031230000_shared_goods_ownership/migration.sql','utf8');await db.exec(sql);await db.exec(sql);
 expect((await db.query(`SELECT ownership,"reservationKey",items,total FROM "ServiceAddOnOrder" WHERE id='personal'`)).rows).toEqual([{ownership:'PERSON',reservationKey:null,items:[{quantity:1}],total:80}]);
 const items=JSON.stringify([{id:'tea',name:'茶',price:80,duration:0,quantity:2,ownership:'RESERVATION',groupId:'g',groupTitle:'飲品'}]);
 await db.query(`INSERT INTO "ServiceAddOnOrder"(id,"storeId",module,"bookingId","participantId",ownership,"reservationKey",items,total) VALUES('shared','s','FITNESS','class',null,'RESERVATION','group:g',$1,160)`,[items]);
 await expect(db.exec(`UPDATE "ServiceAddOnOrder" SET total=80 WHERE id='shared'`)).rejects.toThrow('total mismatch');
 await expect(db.exec(`UPDATE "ServiceAddOnOrder" SET items=jsonb_set(items,'{0,quantity}','0') WHERE id='shared'`)).rejects.toThrow('quantity');
 await expect(db.exec(`INSERT INTO "ServiceAddOnOrder"(id,"storeId",module,"bookingId","participantId",ownership,"reservationKey") VALUES('duplicate','s','FITNESS','class',null,'RESERVATION','group:g')`)).rejects.toThrow('unique');
 await expect(db.exec(`UPDATE "ServiceAddOnOrder" SET "participantId"='p1' WHERE id='shared'`)).rejects.toThrow('owner_shape');
 await db.transaction(async client=>{
 const tx={$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>{const query=strings.reduce((s,part,i)=>s+(i?'$'+i:'')+part,'');return(await client.query(query,values)).rows;}} as unknown as Prisma.TransactionClient;
 const first=await lockSharedGoodsSubject(tx,'s','FITNESS','class','p1'),second=await lockSharedGoodsSubject(tx,'s','FITNESS','class','p2'),other=await lockSharedGoodsSubject(tx,'s','FITNESS','class','p3');
 await client.query(`INSERT INTO "ServiceAddOnOrder"(id,"storeId",module,"bookingId","participantId",ownership,"reservationKey",items,total) VALUES('solo-goods','s','FITNESS','class',null,'RESERVATION','booking:p3',$1,160)`,[items]);
 await client.exec(`UPDATE "CourseBooking" SET "groupKey"='onsite:p3',"reserverCustomerId"=NULL WHERE id='p3';INSERT INTO "CourseBooking" VALUES('p4','s','class','onsite:p3','d',null,'u',null,'RESERVED');`);
 expect((await lockSharedGoodsSubject(tx,'s','FITNESS','class','p4')).reservationKey).toBe('booking:p3');
 expect((await lockSharedGoodsSubject(tx,'s','FITNESS','class','p3')).reservationKey).toBe('booking:p3');
 expect(first.reservationKey).toBe('group:g');expect(second.reservationKey).toBe(first.reservationKey);expect(other.reservationKey).toBe('booking:p3');
 await expect(lockSharedGoodsSubject(tx,'other','FITNESS','class','p1')).rejects.toThrow('不屬於');
 await client.exec(`UPDATE "CourseBooking" SET status='CANCELLED' WHERE id='p1'`);expect((await lockSharedGoodsSubject(tx,'s','FITNESS','class','p1')).status).toBe('ACTIVE');
 await client.exec(`UPDATE "CourseBooking" SET status='CANCELLED' WHERE id='p2'`);expect((await lockSharedGoodsSubject(tx,'s','FITNESS','class','p1')).status).toBe('CANCELLED');
 const steam=await lockSharedGoodsSubject(tx,'s','STEAMFOOT','steam','one');expect(steam.reservationKey).toBe('steam');
 await client.exec(`UPDATE "BookingParticipant" SET status='CANCELLED'`);expect((await lockSharedGoodsSubject(tx,'s','STEAMFOOT','steam','two')).status).toBe('CANCELLED');
 });
 await db.exec(`DELETE FROM "CourseBooking" WHERE id='p1'`);
 await expect(db.exec(`DELETE FROM "CourseBooking" WHERE id='p2'`)).rejects.toThrow('shared goods history');
 await expect(db.exec(`DELETE FROM "CourseSession" WHERE id='class'`)).rejects.toThrow('shared goods history');
 }finally{await db.close();}
},20000);
