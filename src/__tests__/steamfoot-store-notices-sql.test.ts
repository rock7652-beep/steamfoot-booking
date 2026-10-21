import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {afterAll,beforeAll,expect,it} from "vitest";
const db=new PGlite();
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text); INSERT INTO "Store" VALUES ('steam','STEAMFOOT'),('other','STEAMFOOT'),('course','COURSE');
 CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text,name text); INSERT INTO "Customer" VALUES ('customer','steam','小美'),('outsider','other','跨店姓名');
 CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text,"displayName" text); INSERT INTO "Staff" VALUES ('staff','steam','值班店長'),('outside','other','跨店店長');
 CREATE TABLE "ServicePlan"(id text PRIMARY KEY,"storeId" text,name text); INSERT INTO "ServicePlan" VALUES ('plan','steam','蒸足十堂');
 CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"customerId" text,"bookingDate" date,"slotTime" text,people int DEFAULT 1,"bookingStatus" text DEFAULT 'PENDING',"serviceStaffId" text,"servicePlanId" text,"bookingType" text DEFAULT 'PACKAGE_SESSION',notes text);
 INSERT INTO "Booking" (id,"storeId","customerId","bookingDate","slotTime") VALUES ('historical','steam','customer','2030-01-11','10:00');`);
 await db.exec(readFileSync('prisma/migrations/20261021040000_steamfoot_store_notices/migration.sql','utf8'));
});
afterAll(()=>db.close());
const add=(id:string,store='steam')=>db.query(`INSERT INTO "Booking" (id,"storeId","customerId","bookingDate","slotTime","serviceStaffId","servicePlanId") VALUES ($1,$2,'customer','2030-01-11','10:00','staff','plan')`,[id,store]);
const notice=async(id:string)=>(await db.query<Record<string,unknown>>('SELECT * FROM "SteamfootStoreNotice" WHERE "bookingId"=$1',[id])).rows[0];
it('defaults existing and future settings on, without backfilling old bookings',async()=>{
 expect((await db.query('SELECT "storeId",enabled FROM "SteamfootNoticeSetting" ORDER BY "storeId"')).rows).toEqual([{storeId:'other',enabled:true},{storeId:'steam',enabled:true}]);
 expect(await notice('historical')).toBeUndefined();
 await db.exec(`INSERT INTO "Store" VALUES ('new','STEAMFOOT'); INSERT INTO "SteamfootNoticeSetting" ("storeId") VALUES ('new');`);
 expect((await db.query('SELECT enabled FROM "SteamfootNoticeSetting" WHERE "storeId"=\'new\'')).rows).toEqual([{enabled:true}]);
});
it('records a new booking as information with correct Taipei time and snapshots',async()=>{
 await add('new-booking');const n=await notice('new-booking');
 expect(n).toMatchObject({kind:'BOOKING',customerName:'小美',serviceName:'蒸足十堂',staffName:'值班店長',revision:0,handledById:'system'});
 expect(new Date(n.startsAt as string).toISOString()).toBe('2030-01-11T02:00:00.000Z');expect(n.handledAt).not.toBeNull();
});
it('records changes for a new store without a setting, but excludes course stores',async()=>{
 await db.exec(`INSERT INTO "Store" VALUES ('no-rule','STEAMFOOT');`);await add('no-rule-booking','no-rule');await add('course-booking','course');
 expect((await notice('no-rule-booking')).kind).toBe('BOOKING');expect(await notice('course-booking')).toBeUndefined();
});
it('keeps a single pending move chain, preserving the first original time',async()=>{
 await add('move');
 await db.exec(`UPDATE "Booking" SET "slotTime"='11:00' WHERE id='move'; UPDATE "Booking" SET "slotTime"='12:00' WHERE id='move';`);
 const n=await notice('move');expect(n).toMatchObject({kind:'MOVE',revision:2,handledAt:null});
 expect(new Date(n.previousStartsAt as string).toISOString()).toBe('2030-01-11T02:00:00.000Z');expect(new Date(n.startsAt as string).toISOString()).toBe('2030-01-11T04:00:00.000Z');
});
it('reopens handled notices on cancellation and ignores unchanged retries',async()=>{
 await db.exec(`UPDATE "SteamfootStoreNotice" SET "handledAt"=now(),"handledById"='u',"handledByName"='店長' WHERE "bookingId"='move'; UPDATE "Booking" SET "bookingStatus"='CANCELLED' WHERE id='move'; UPDATE "Booking" SET "bookingStatus"='CANCELLED' WHERE id='move';`);
 expect(await notice('move')).toMatchObject({kind:'CANCEL',revision:3,handledAt:null,handledById:null,handledByName:null});
});
it('rolls notice and booking changes back together',async()=>{
 const before=await notice('move');await db.exec(`BEGIN; UPDATE "Booking" SET "bookingStatus"='PENDING' WHERE id='move'; ROLLBACK;`);expect(await notice('move')).toEqual(before);
 await db.exec('BEGIN');await add('aborted');await db.exec('ROLLBACK');expect(await notice('aborted')).toBeUndefined();
});
it('turning off preserves prior notices and re-enabling never scans disabled-period bookings',async()=>{
 const before=await notice('move');await db.exec(`UPDATE "SteamfootNoticeSetting" SET enabled=false WHERE "storeId"='steam'; UPDATE "Booking" SET "slotTime"='13:00' WHERE id='move';`);
 await add('disabled-period');expect(await notice('disabled-period')).toBeUndefined();expect(await notice('move')).toEqual(before);
 await db.exec(`UPDATE "SteamfootNoticeSetting" SET enabled=true WHERE "storeId"='steam';`);expect(await notice('disabled-period')).toBeUndefined();
 await db.exec(`UPDATE "Booking" SET "slotTime"='14:00' WHERE id='move';`);expect(await notice('move')).toMatchObject({kind:'MOVE',revision:4,handledAt:null});
});
it('records staff, people and notes edits without importing another store snapshot',async()=>{
 await add('edit');await db.exec(`UPDATE "Booking" SET "serviceStaffId"='outside',people=2,notes='備註' WHERE id='edit';`);
 expect(await notice('edit')).toMatchObject({kind:'UPDATE',staffName:'未指派',previousStaffName:'值班店長',affectedCount:2,handledAt:null});
});
it('records no-show and restored reservations, while completion is informational',async()=>{
 await add('status');await db.exec(`UPDATE "Booking" SET "bookingStatus"='NO_SHOW' WHERE id='status';`);expect(await notice('status')).toMatchObject({kind:'NO_SHOW',handledAt:null});
 await db.exec(`UPDATE "Booking" SET "bookingStatus"='PENDING' WHERE id='status';`);expect(await notice('status')).toMatchObject({kind:'RESTORE',handledAt:null});
 await db.exec(`UPDATE "Booking" SET "bookingStatus"='COMPLETED' WHERE id='status';`);expect((await notice('status')).kind).toBe('COMPLETE');expect((await notice('status')).handledAt).not.toBeNull();
});
it('uses verified transaction actor only for informational receipts',async()=>{
 await db.exec(`BEGIN; SELECT set_config('steamfoot.audit_actor','{"id":"verified","name":"已驗證店長"}',true);`);await add('actor');await db.exec('COMMIT');
 expect(await notice('actor')).toMatchObject({handledById:'verified',handledByName:'已驗證店長'});
});
it('enforces compare-and-swap handling and the store predicate',async()=>{
 const n=await notice('edit');const update=(store:string)=>db.query(`UPDATE "SteamfootStoreNotice" SET "handledAt"=now(),"handledById"='u',"handledByName"='店長',revision=revision+1 WHERE id=$1 AND "storeId"=$2 AND revision=$3 RETURNING id`,[n.id,store,n.revision]);
 expect((await update('other')).rows).toHaveLength(0);expect((await update('steam')).rows).toHaveLength(1);expect((await update('steam')).rows).toHaveLength(0);
});
it('keeps both tables private and the capture function invoker-only',async()=>{
 const rows=(await db.query<{relname:string;rls:boolean;access:boolean}>(`SELECT c.relname,c.relrowsecurity AS rls,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS access FROM pg_class c WHERE c.relname IN ('SteamfootStoreNotice','SteamfootNoticeSetting') ORDER BY c.relname`)).rows;
 expect(rows).toHaveLength(2);expect(rows.every(r=>r.rls&&!r.access)).toBe(true);
 expect((await db.query(`SELECT prosecdef AS definer,has_function_privilege('anon','public.record_steamfoot_store_notice()','EXECUTE') AS access FROM pg_proc WHERE proname='record_steamfoot_store_notice'`)).rows).toEqual([{definer:false,access:false}]);
});
