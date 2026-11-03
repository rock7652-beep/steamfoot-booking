// Local-only disposable PostgreSQL rehearsal. No URL/env/remote database is read.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
let checks=0;
async function rejected(sql,pattern){let failure;try{await db.exec(sql);}catch(error){failure=error;}assert.ok(failure,`Expected rejection: ${sql}`);if(pattern)assert.match(failure.message,pattern);checks++;}
try{
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE "Store"(id text PRIMARY KEY);
 CREATE TABLE "Staff"(id text,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "Customer"(id text,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CourseTemplate"(id text,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CourseRoom"(id text,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CourseSession"(id text,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CoursePointCard"(id text,"storeId" text,"musicTermSizes" int[] NOT NULL DEFAULT '{}',"musicBonusLessons" int NOT NULL DEFAULT 0,"requestKey" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CourseCardMember"("cardId" text,"storeId" text,"customerId" text);
 CREATE TABLE "CoursePurchase"(id text,"storeId" text,UNIQUE(id,"storeId"));
 CREATE TABLE "CourseBooking"(id text,"storeId" text,"customerId" text,"cardId" text,status text,"absenceKind" text,"bookingKind" text,"pointCost" int,"trialPrice" int,"operatorCustomerId" text,"makeupForBookingId" text,"companionIndex" int,UNIQUE(id,"storeId"),CONSTRAINT "CourseBooking_values" CHECK("bookingKind" IN ('CARD','TRIAL','TEACHER_MAKEUP')));
 INSERT INTO "Store" VALUES('test-a'),('test-b');
 INSERT INTO "Customer" VALUES('learner-a','test-a'),('learner-b','test-b');
 INSERT INTO "CoursePointCard" VALUES('card-a','test-a',ARRAY[2,2],0,'native-test');
 INSERT INTO "CourseCardMember" VALUES('card-a','test-a','learner-a');
 INSERT INTO "CoursePurchase" VALUES('purchase-a','test-a');
 INSERT INTO "CourseBooking"(id,"storeId","customerId","cardId",status,"bookingKind","pointCost") VALUES('lesson-1','test-a','learner-a','card-a','RESERVED','CARD',1),('lesson-2','test-a','learner-a','card-a','RESERVED','CARD',1),('makeup-1','test-a','learner-a','card-a','RESERVED','CARD',1);
 `);
 const before=(await db.query('SELECT * FROM "CourseBooking" ORDER BY id')).rows;
 const sql=readFileSync(new URL('./music-production-expand.sql',import.meta.url),'utf8');
 await db.exec(sql);
 assert.deepEqual((await db.query('SELECT * FROM "CourseBooking" ORDER BY id')).rows.map(({musicOpeningMakeupEntitlementId,musicOpeningTermKey,musicOpeningLessonOrdinal,musicOpeningSourceLessonKey,...r})=>r),before);checks++;
 const state=(await db.query(`SELECT count(*)::int AS count FROM pg_class WHERE relname IN ('CourseMusicOpeningState','CourseMusicOpeningMakeupEntitlement','CourseScheduleSeries','CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment') AND relrowsecurity`)).rows[0];assert.equal(state.count,6);checks++;
 for(const n of ['CourseMusicTuition','CourseMusicReceipt','CourseMusicLessonAssignment','CourseScheduleSeries']){
  assert.equal((await db.query(`SELECT has_table_privilege('anon','"${n}"','SELECT') OR has_table_privilege('authenticated','"${n}"','INSERT') AS permitted`)).rows[0].permitted,false);checks++;
 }
 await db.exec(`INSERT INTO "CourseMusicTuition"("purchaseId","storeId",due,"checkoutFingerprint") VALUES('purchase-a','test-a',0,'zero-test')`);checks++;
 await rejected(`INSERT INTO "CourseMusicReceipt"(id,"storeId","purchaseId",amount,"paidAt",method,"requestKey","actorUserId") VALUES('zero','test-a','purchase-a',0,now(),'CASH','r-zero','operator')`,/check constraint/);
 await rejected(`INSERT INTO "CourseMusicReceipt"(id,"storeId","purchaseId",amount,"paidAt",method,"requestKey","actorUserId") VALUES('foreign','test-b','purchase-a',1,now(),'CASH','r-foreign','operator')`,/foreign key/);
 await rejected(`INSERT INTO "CourseMusicReceipt"(id,"storeId","purchaseId",amount,"paidAt",method,"requestKey","actorUserId") VALUES('bank','test-a','purchase-a',1,now(),'BANK_TRANSFER','r-bank','operator')`,/check constraint/);
 await db.exec(`INSERT INTO "CourseMusicReceipt"(id,"storeId","purchaseId",amount,"paidAt",method,"requestKey","actorUserId") VALUES('receipt','test-a','purchase-a',100,now(),'CASH','r-once','operator')`);
 await rejected(`INSERT INTO "CourseMusicReceipt"(id,"storeId","purchaseId",amount,"paidAt",method,"requestKey","actorUserId") VALUES('receipt-2','test-a','purchase-a',100,now(),'CASH','r-once','operator')`,/unique constraint/);
 await db.exec(`INSERT INTO "CourseMusicLessonAssignment"("bookingId","storeId","cardId","customerId",period,ordinal,kind) VALUES('lesson-1','test-a','card-a','learner-a',1,1,'REGULAR')`);
 await rejected(`INSERT INTO "CourseMusicLessonAssignment"("bookingId","storeId","cardId","customerId",period,ordinal,kind) VALUES('lesson-2','test-a','card-a','learner-a',1,1,'REGULAR')`,/unique constraint/);
 await rejected(`INSERT INTO "CourseMusicLessonAssignment"("bookingId","storeId","cardId","customerId",period,ordinal,kind) VALUES('lesson-2','test-a','card-a','learner-a',3,1,'REGULAR')`,/outside purchased periods/);
 await rejected(`INSERT INTO "CourseMusicLessonAssignment"("bookingId","storeId","cardId","customerId",period,ordinal,kind) VALUES('lesson-2','test-b','card-a','learner-b',1,1,'REGULAR')`,/booking missing/);
 await db.exec(`UPDATE "CourseBooking" SET status='CANCELLED' WHERE id='lesson-1'`);
 const saved=(await db.query(`SELECT period,ordinal,"releasedAt" FROM "CourseMusicLessonAssignment" WHERE "bookingId"='lesson-1'`)).rows[0];assert.equal(saved.period,1);assert.equal(saved.ordinal,1);assert.ok(saved.releasedAt);checks++;
 await rejected(`DELETE FROM "CourseMusicLessonAssignment" WHERE "bookingId"='lesson-1'`,/history cannot be deleted/);
 await db.exec(`UPDATE "CourseBooking" SET "makeupForBookingId"='lesson-1' WHERE id='makeup-1'`);
 await rejected(`INSERT INTO "CourseMusicLessonAssignment"("bookingId","storeId","cardId","customerId",period,ordinal,kind,"sourceBookingId") VALUES('makeup-1','test-a','card-a','learner-a',2,1,'MAKEUP','lesson-1')`,/retain its original lesson/);
 await db.exec(`INSERT INTO "CourseMusicLessonAssignment"("bookingId","storeId","cardId","customerId",period,ordinal,kind,"sourceBookingId") VALUES('makeup-1','test-a','card-a','learner-a',1,1,'MAKEUP','lesson-1')`);checks++;
 await rejected(`UPDATE "CoursePointCard" SET "musicOpeningStateRequired"=true WHERE id='card-a'`,/check constraint/);
 await rejected(`INSERT INTO "CourseBooking"(id,"storeId","customerId",status,"bookingKind","pointCost") VALUES('import','test-a','learner-a','RESERVED','OPENING_MAKEUP',0)`,/check constraint/);
 await rejected(sql,/already exists or is partial/);
 await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "CourseMusicReceipt"')).rows[0].n,1);checks++;
 console.log(JSON.stringify({status:'PASS',checks,scope:'local disposable PostgreSQL; no remote or real payment',limitations:['Not a full production schema clone','App authorization and overcollection are verified separately','No hosted UI acceptance yet']}));
}finally{await db.close();}
