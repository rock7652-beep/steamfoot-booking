import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,expect,it} from 'vitest';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE "Store"(id text PRIMARY KEY);INSERT INTO "Store" VALUES ('a'),('b');CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"bookingStatus" text,"bookingDate" date,"slotTime" text);CREATE TABLE "CourseBooking"(id text PRIMARY KEY,"storeId" text,status text,"sessionId" text);CREATE TABLE "CourseSession"(id text PRIMARY KEY,"storeId" text,"startsAt" timestamptz,"endsAt" timestamptz,"cancelledAt" timestamptz);
 INSERT INTO "Booking" VALUES ('steam','a','PENDING','2026-10-30','10:00');INSERT INTO "CourseSession" VALUES ('session','a','2026-10-30T01:00Z','2026-10-30T02:00Z',null);INSERT INTO "CourseBooking" VALUES ('course','a','RESERVED','session');`);
 await db.exec(readFileSync('scripts/sql/digital-manager-notice-candidate.sql','utf8'));await db.exec(readFileSync('scripts/sql/digital-manager-incomplete-resolution-candidate.sql','utf8'));
 await db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ('n1','a','incomplete-service-reminder:steam:one','INCOMPLETE_SERVICE_REMINDER','steam'),('n2','a','course-incomplete-attendance:course:one','INCOMPLETE_SERVICE_REMINDER','course'),('foreign','b','incomplete-service-reminder:steam:other','INCOMPLETE_SERVICE_REMINDER','steam');`);
},30000);
afterAll(async()=>db.close());
it('resolves the same-store service reminder on completion without affecting another store',async()=>{
 await db.exec(`UPDATE "Booking" SET "bookingStatus"='COMPLETED' WHERE id='steam';`);
 const rows=(await db.query<{id:string;handledAt:Date|null}>(`SELECT id,"handledAt" FROM "DigitalManagerNotice" WHERE id IN ('n1','foreign') ORDER BY id`)).rows;
 expect(rows[0]).toMatchObject({id:'foreign',handledAt:null});expect(rows[1].handledAt).not.toBeNull();
});
it('resolves a course reminder when the lesson is rescheduled',async()=>{
 await db.exec(`UPDATE "CourseSession" SET "endsAt"='2026-10-30T03:00Z' WHERE id='session';`);
 expect((await db.query<{handledAt:Date|null}>(`SELECT "handledAt" FROM "DigitalManagerNotice" WHERE id='n2'`)).rows[0].handledAt).not.toBeNull();
});
it('keeps reminders pending when a transaction is rolled back',async()=>{
 await db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ('n3','a','course-incomplete-attendance:course:two','INCOMPLETE_SERVICE_REMINDER','course');`);
 await db.exec(`BEGIN;UPDATE "CourseBooking" SET status='ATTENDED' WHERE id='course';ROLLBACK;`);
 expect((await db.query(`SELECT "handledAt" FROM "DigitalManagerNotice" WHERE id='n3'`)).rows[0]).toMatchObject({handledAt:null});
});
