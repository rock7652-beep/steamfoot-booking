import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

const review=readFileSync('prisma/reconciliation/20261030_digital_manager_migration_review.sql','utf8');
const sources=['digital-manager-notice-candidate','steamfoot-digital-manager-booking-candidate','steamfoot-digital-manager-payment-candidate','digital-manager-lead-candidate','digital-manager-vip-candidate','digital-manager-incomplete-resolution-candidate'];
const baseline=`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE "Store"(id text PRIMARY KEY,"industryModule" text);
 CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text,name text);
 CREATE TABLE "Staff"(id text PRIMARY KEY,"storeId" text,"displayName" text);
 CREATE TABLE "ServicePlan"(id text PRIMARY KEY,"storeId" text,name text);
 CREATE TABLE "Booking"(id text PRIMARY KEY,"storeId" text,"customerId" text,"bookingDate" date,"slotTime" text,people int,"bookingStatus" text,"serviceStaffId" text,"servicePlanId" text,"bookingType" text,"bookedByType" text,notes text);
 CREATE TABLE "Transaction"(id text PRIMARY KEY,"storeId" text,"planId" text,"transactionType" text,"paymentStatus" text,status text);
 CREATE TABLE "DigitalButlerLead"(id text PRIMARY KEY,"storeId" text,"completionActionKey" text,status text,"assignedStaffId" text,"phoneCiphertext" bytea,"phoneIv" bytea,"phoneAuthTag" bytea);
 CREATE TABLE "SessionBalanceNotification"(id text PRIMARY KEY,"storeId" text,"customerId" text,"responseAction" text);
 CREATE TABLE "CourseBooking"(id text PRIMARY KEY,"storeId" text,status text,"sessionId" text);
 CREATE TABLE "CourseSession"(id text PRIMARY KEY,"storeId" text,"startsAt" timestamptz,"endsAt" timestamptz,"cancelledAt" timestamptz);`;

it('keeps the reviewed bundle identical to all six tested source scripts',()=>{
 for(const source of sources) expect(review).toContain(readFileSync(`scripts/sql/${source}.sql`,'utf8').trim());
 const scoped=readFileSync('prisma/reconciliation/20261030_digital_manager_scoped_with_beauty_review.sql','utf8');
 const beauty=readFileSync('scripts/sql/digital-manager-beauty-access-candidate.sql','utf8').replace('\nBEGIN;\n','\n').replace(/\nCOMMIT;\s*$/,'');
 expect(scoped).toContain(review.replace(/\nCOMMIT;\s*$/,''));expect(scoped).toContain(beauty);
});
it('installs the complete bundle against the existing booking trigger and is repeatable',async()=>{
 const db=new PGlite();
 try {
  await db.exec(baseline);
  await db.exec(readFileSync('prisma/migrations/20261021040000_steamfoot_store_notices/migration.sql','utf8'));
  await db.exec(review); await db.exec(review);
  const result=await db.query<{count:number}>(`SELECT count(*)::int AS count FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('steamfoot_plan_payment_notice','digital_manager_lead_notice','digital_manager_vip_notice','steamfoot_incomplete_notice_resolution','course_incomplete_notice_resolution','course_session_incomplete_notice_resolution')`);
  expect(result.rows[0].count).toBe(6);
 } finally {await db.close();}
},30000);
it('rolls back all new objects if a required table is missing',async()=>{
 const db=new PGlite();
 try {
  await db.exec(baseline); await db.exec('DROP TABLE "CourseSession"');
  await expect(db.exec(review)).rejects.toThrow(); await db.exec('ROLLBACK');
  expect((await db.query<{name:string|null}>(`SELECT to_regclass('public."DigitalManagerNotice"')::text AS name`)).rows[0].name).toBeNull();
 } finally {await db.close();}
},30000);
it('rolls back the combined review if the dedicated Beauty role is absent',async()=>{
 const db=new PGlite();
 try {
  await db.exec(baseline);
  await db.exec(readFileSync('prisma/migrations/20261021040000_steamfoot_store_notices/migration.sql','utf8'));
  const before=(await db.query<{definition:string}>(`SELECT pg_get_functiondef('public.record_steamfoot_store_notice()'::regprocedure) AS definition`)).rows[0].definition;
  await expect(db.exec(readFileSync('prisma/reconciliation/20261030_digital_manager_scoped_with_beauty_review.sql','utf8'))).rejects.toThrow();
  await db.exec('ROLLBACK');
  expect((await db.query<{name:string|null}>(`SELECT to_regclass('public."DigitalManagerNotice"')::text AS name`)).rows[0].name).toBeNull();
  expect((await db.query<{definition:string}>(`SELECT pg_get_functiondef('public.record_steamfoot_store_notice()'::regprocedure) AS definition`)).rows[0].definition).toBe(before);
 } finally {await db.close();}
},30000);
