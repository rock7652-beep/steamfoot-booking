import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,expect,it} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text); INSERT INTO "Store" VALUES ('a','STEAMFOOT'),('b','STEAMFOOT');
 CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text,name text); INSERT INTO "Customer" VALUES ('ca','a','顧客'),('cb','b','顧客');
 CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text,"displayName" text); CREATE TABLE "ServicePlan"(id text PRIMARY KEY,"storeId" text,name text);
 CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"customerId" text,"bookingDate" date,"slotTime" text,people int DEFAULT 1,"bookingStatus" text DEFAULT 'PENDING',"serviceStaffId" text,"servicePlanId" text,"bookingType" text DEFAULT 'PACKAGE_SESSION',"bookedByType" text DEFAULT 'CUSTOMER',notes text);`);
 await db.exec(readFileSync('prisma/migrations/20261021040000_steamfoot_store_notices/migration.sql','utf8'));
 await db.exec(readFileSync('scripts/sql/steamfoot-digital-manager-booking-candidate.sql','utf8'));
},30000);
afterAll(async()=>db.close());
it('makes customer same-day bookings and public trials pending, independently of LINE',async()=>{
 await db.exec(`INSERT INTO "Booking" (id,"storeId","customerId","bookingDate","slotTime","bookedByType","bookingType") VALUES
 ('today','a','ca',(now() AT TIME ZONE 'Asia/Taipei')::date,'10:00','CUSTOMER','PACKAGE_SESSION'),
 ('trial','a','ca',(now() AT TIME ZONE 'Asia/Taipei')::date+2,'10:00','CUSTOMER','FIRST_TRIAL'),
 ('future','a','ca',(now() AT TIME ZONE 'Asia/Taipei')::date+2,'10:00','CUSTOMER','PACKAGE_SESSION'),
 ('staff','a','ca',(now() AT TIME ZONE 'Asia/Taipei')::date,'10:00','STAFF','PACKAGE_SESSION'),
 ('other','b','cb',(now() AT TIME ZONE 'Asia/Taipei')::date,'10:00','CUSTOMER','PACKAGE_SESSION');`);
 const rows=(await db.query<{bookingId:string;handledAt:Date|null}>(`SELECT "bookingId","handledAt" FROM "SteamfootStoreNotice" ORDER BY "bookingId"`)).rows;
 const find=(id:string)=>rows.find(r=>r.bookingId===id)!;
 expect(find('today').handledAt).toBeNull();expect(find('trial').handledAt).toBeNull();expect(find('other').handledAt).toBeNull();
 expect(find('future').handledAt).not.toBeNull();expect(rows.find(r=>r.bookingId==='staff')).toBeUndefined();
});
it('retains transactional rollback and captures bookings despite a legacy disabled setting',async()=>{
 await db.exec(`BEGIN; INSERT INTO "Booking" (id,"storeId","customerId","bookingDate","slotTime") VALUES ('rolled','a','ca',(now() AT TIME ZONE 'Asia/Taipei')::date,'10:00'); ROLLBACK;
 UPDATE "SteamfootNoticeSetting" SET enabled=false WHERE "storeId"='a'; INSERT INTO "Booking" (id,"storeId","customerId","bookingDate","slotTime") VALUES ('disabled','a','ca',(now() AT TIME ZONE 'Asia/Taipei')::date,'10:00');`);
 expect((await db.query(`SELECT "bookingId","handledAt" FROM "SteamfootStoreNotice" WHERE "bookingId" IN ('rolled','disabled')`)).rows).toEqual([{bookingId:'disabled',handledAt:null}]);
});
