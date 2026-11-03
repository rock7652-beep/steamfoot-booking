import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {verifyStoreNoticeActionPolicy} from '../../scripts/store-notice-action-policy-readiness.mjs';
const db=new PGlite();
const sql=readFileSync('scripts/sql/store-notice-action-policy.sql','utf8');
const client={$queryRawUnsafe:async(sql:string,...values:unknown[])=>(await db.query(sql,values)).rows};
beforeAll(async()=>{
 await db.exec(`CREATE ROLE steamfoot_beauty_data_test; CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TYPE "IndustryModule" AS ENUM ('STEAMFOOT','COURSE','BEAUTY'); CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" "IndustryModule"); INSERT INTO "Store" VALUES ('beauty','BEAUTY'),('other','STEAMFOOT');
 CREATE TABLE "SteamfootStoreNotice"(id text PRIMARY KEY,kind text);
 CREATE TABLE "CourseStoreNotice"(id text PRIMARY KEY,"storeId" text,"subjectKey" text,kind text,"customerName" text,"courseName" text,"coachName" text,"previousCoachName" text,"startsAt" timestamptz,"previousStartsAt" timestamptz,"affectedCount" int,details jsonb,"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int DEFAULT 0,"createdAt" timestamptz,"updatedAt" timestamptz,UNIQUE("storeId","subjectKey"));
 CREATE TABLE "CourseSession"(id text,"storeId" text,"nameSnapshot" text,"coachId" text,"startsAt" timestamptz,"endsAt" timestamptz,"cancelledAt" timestamptz);
 CREATE TABLE "Staff"(id text,"storeId" text,"displayName" text);
 CREATE TABLE "CourseBooking"(id text,"storeId" text,"sessionId" text,"customerName" text,notes text);
 CREATE TABLE "DigitalButlerLead"(id text,"storeId" text,"completionActionKey" text,"conversationId" text DEFAULT 'conversation',"submittedAnswers" jsonb,"phoneCiphertext" text,"phoneIv" text,"phoneAuthTag" text,status text,"assignedStaffId" text);
 CREATE TABLE "SessionBalanceNotification"(id text,"storeId" text,"customerId" text,"responseAction" text);
 CREATE TABLE "Booking"("storeId" text,"updatedAt" timestamptz,"bookingStatus" text,"expectedAmount" numeric);
 CREATE TABLE "BookingParticipant"("storeId" text,"completedAt" timestamptz,status text,"expectedAmount" int);
 CREATE TYPE "TransactionType" AS ENUM ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE','REFUND');
 CREATE TABLE "Transaction"("storeId" text,"bookingId" text,"unregisteredParticipantId" text,"transactionType" "TransactionType");
 CREATE TABLE "CourseTrialPayment"("storeId" text,"bookingId" text,status text,"voidedAt" timestamptz);
 CREATE TABLE "CoursePurchase"("storeId" text,"confirmedAt" timestamptz,status text,"voidedAt" timestamptz);
 CREATE TABLE "BeautyPayment"("storeId" text,"appointmentId" text,kind text);
 CREATE TABLE "BeautyAppointment"("storeId" text,"endsAt" timestamptz,status text,"cardId" text);
 CREATE TABLE "DigitalManagerNotice"(id text,"storeId" text,"eventKey" text,"eventType" text,"readAt" timestamptz,"targetId" text,"handledAt" timestamptz,"handledById" text,"handledByName" text,revision int DEFAULT 0,"updatedAt" timestamptz,UNIQUE("storeId","eventKey"));
 ALTER TABLE "DigitalManagerNotice" ENABLE ROW LEVEL SECURITY;
 GRANT SELECT ON "Store","DigitalManagerNotice" TO steamfoot_beauty_data_test;
 GRANT UPDATE("readAt") ON "DigitalManagerNotice" TO steamfoot_beauty_data_test;
 CREATE POLICY beauty_digital_manager_read ON "DigitalManagerNotice" FOR SELECT TO steamfoot_beauty_data_test USING(false);
 CREATE POLICY beauty_digital_manager_update ON "DigitalManagerNotice" FOR UPDATE TO steamfoot_beauty_data_test USING(false) WITH CHECK(false);
 INSERT INTO "SteamfootStoreNotice" VALUES ('historical','COMPLETE');
 SELECT set_config('beauty_migration.app_role','steamfoot_beauty_data_test',false);`);
},30000);
afterAll(()=>db.close());
it('fails readiness before installation and suppresses all three event types without erasing history',async()=>{
 await expect(verifyStoreNoticeActionPolicy(client)).rejects.toThrow('notice_publish_policy_not_ready');
 await db.exec(sql);
 expect(await verifyStoreNoticeActionPolicy(client)).toBe(true);
 for(const table of ['SteamfootStoreNotice','CourseStoreNotice']){
  for(const kind of ['COMPLETE','NO_SHOW','RESTORE','MOVE','CANCEL','UPDATE'])await db.query(`INSERT INTO "${table}" (id,kind) VALUES ($1,$2)`,[kind,kind]);
  const kinds=(await db.query<{kind:string}>(`SELECT kind FROM "${table}" WHERE id<>'historical' ORDER BY kind`)).rows.map(r=>r.kind);
  expect(kinds).toEqual(['CANCEL','MOVE','UPDATE']);
  await db.query(`UPDATE "${table}" SET kind='COMPLETE' WHERE id='MOVE'`);
  expect((await db.query<{kind:string}>(`SELECT kind FROM "${table}" WHERE id='MOVE'`)).rows[0].kind).toBe('MOVE');
 }
 expect((await db.query('SELECT * FROM "SteamfootStoreNotice" WHERE id=\'historical\'')).rows).toHaveLength(1);
});
it('grants only beauty-scoped receivable references, preserves read-only source identity and rejects API roles',async()=>{
 await db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","readAt") VALUES ('ok','beauty','beauty-receivable:service:a','OUTSTANDING_PAYMENT',NULL),('foreign-store','other','beauty-receivable:service:b','OUTSTANDING_PAYMENT',NULL),('foreign-key','beauty','course-receivable:trial:c','OUTSTANDING_PAYMENT',NULL),('wrong-type','beauty','beauty-receivable:service:d','UNRELATED',NULL); SET ROLE steamfoot_beauty_data_test;`);
 try{
  expect((await db.query<{id:string}>('SELECT id FROM "DigitalManagerNotice"')).rows.map(r=>r.id)).toEqual(['ok']);
  expect((await db.query('UPDATE "DigitalManagerNotice" SET "readAt"=now() RETURNING id')).rows).toEqual([{id:'ok'}]);
  await expect(db.exec(`UPDATE "DigitalManagerNotice" SET "storeId"='other'`)).rejects.toThrow();
  await expect(db.exec('DELETE FROM "DigitalManagerNotice"')).rejects.toThrow();
 }finally{await db.exec('RESET ROLE');}
 await db.exec('SET ROLE anon');
 try{await expect(db.exec('SELECT * FROM "DigitalManagerNotice"')).rejects.toThrow();}finally{await db.exec('RESET ROLE');}
});
it('records actual course note changes atomically, ignores no-op retries and preserves business rollback',async()=>{
 await db.exec(`INSERT INTO "CourseSession" (id,"storeId","nameSnapshot","coachId","startsAt") VALUES ('class','course','課程','coach',now()); INSERT INTO "Staff" VALUES ('coach','course','老師'); INSERT INTO "CourseBooking" VALUES ('b','course','class','學員','原備註'); UPDATE "CourseBooking" SET notes='新備註' WHERE id='b'; UPDATE "CourseBooking" SET notes='新備註' WHERE id='b';`);
 expect((await db.query<{kind:string;revision:number}>(`SELECT kind,revision FROM "CourseStoreNotice" WHERE "subjectKey"='booking:b'`)).rows).toEqual([{kind:'UPDATE',revision:0}]);
 await expect(db.transaction(async tx=>{await tx.exec(`UPDATE "CourseBooking" SET notes='應回滾' WHERE id='b'`);throw Error('rollback');})).rejects.toThrow('rollback');
 expect((await db.query<{notes:string}>(`SELECT notes FROM "CourseBooking" WHERE id='b'`)).rows[0].notes).toBe('新備註');
 expect((await db.query<{revision:number}>(`SELECT revision FROM "CourseStoreNotice" WHERE "subjectKey"='booking:b'`)).rows[0].revision).toBe(0);
});
it('records customer inquiries, explicit renewal requests and support across all modules without guessing intent',async()=>{
 await db.exec(`INSERT INTO "Store" VALUES ('course','COURSE');`);
 for(const store of ['beauty','course','other']){
  await db.query(`INSERT INTO "DigitalButlerLead" (id,"storeId","submittedAnswers","phoneCiphertext","phoneIv","phoneAuthTag",status) VALUES ($1,$2,'{}','encrypted','iv','tag','NEW')`,['lead-'+store,store]);
  await db.query(`INSERT INTO "DigitalButlerLead" (id,"storeId","submittedAnswers",status) VALUES ($1,$2,'{"requestType":"RENEWAL_INTEREST"}','NEW')`,['renew-'+store,store]);
  await db.query(`INSERT INTO "DigitalButlerLead" (id,"storeId","completionActionKey",status) VALUES ($1,$2,'__human_support_handoff__','NEW')`,['support-'+store,store]);
 }
 const events=(await db.query<{eventType:string;count:number}>(`SELECT "eventType",count(*)::int AS count FROM "DigitalManagerNotice" WHERE "targetId" IS NOT NULL GROUP BY "eventType" ORDER BY "eventType"`)).rows;
 expect(events).toEqual([{eventType:'DIGITAL_BUTLER_LEAD_CREATED',count:3},{eventType:'HUMAN_SUPPORT_REQUESTED',count:3},{eventType:'VIP_INTEREST',count:3}]);
 await db.exec(`INSERT INTO "DigitalManagerNotice" (id,"storeId","eventKey","eventType","targetId") VALUES ('later-renewal','beauty','renewal-interest:renew-beauty:later','VIP_INTEREST','renew-beauty'); UPDATE "DigitalButlerLead" SET "assignedStaffId"='staff' WHERE id='support-beauty'; UPDATE "DigitalButlerLead" SET status='CONTACTING' WHERE id='renew-beauty';`);
 expect((await db.query(`SELECT id FROM "DigitalManagerNotice" WHERE "targetId" IN ('support-beauty','renew-beauty') AND "handledAt" IS NULL`)).rows).toEqual([]);
});
it('uses the receipt join index with a realistic enum and thousands of historical receipts',async()=>{
 await db.exec(`INSERT INTO "Transaction" SELECT 'scale','booking-'||n,NULL,'TRIAL_PURCHASE'::"TransactionType" FROM generate_series(1,5000) n; ANALYZE "Transaction";`);
 const plan=await db.query(`EXPLAIN (FORMAT JSON,COSTS OFF) SELECT 1 FROM "Transaction" WHERE "storeId"='scale' AND "bookingId"='booking-2500' AND "transactionType" IN ('TRIAL_PURCHASE','SINGLE_PURCHASE','PACKAGE_PURCHASE')`);
 expect(JSON.stringify(plan.rows)).toContain('Transaction_receivable_booking_idx');
});
it('is repeatable and rejects an absent runtime role without a partial migration',async()=>{
 await db.exec(sql);expect(await verifyStoreNoticeActionPolicy(client)).toBe(true);
 await db.exec(`SELECT set_config('beauty_migration.app_role','postgres',false)`);
 await expect(db.exec(sql)).rejects.toThrow('dedicated non-bypass');
 await db.exec('ROLLBACK');
});
