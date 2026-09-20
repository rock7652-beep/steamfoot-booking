import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:vi.fn()}));
vi.mock("@/lib/shop-config",()=>({resolveCustomerBookingWindow:vi.fn()}));
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { collectCourseTrialInTransaction, voidCourseTrialInTransaction } from "@/server/services/course-trial-payment";
import {settleCourseBooking,correctCourseAttendance} from "@/server/services/course-booking";
import { lockCourseStore } from "@/server/services/course-store-lock";

// Explicit loopback-only disposable database; never falls back to DATABASE_URL.
const databaseUrl = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schemaName = `course_trial_${randomUUID().replaceAll("-", "")}`;
const scopedUrl = databaseUrl ? new URL(databaseUrl) : null;
scopedUrl?.searchParams.set("schema", schemaName);
scopedUrl?.searchParams.set("connection_limit", "12");
const db = scopedUrl ? new PrismaClient({ datasourceUrl: scopedUrl.toString() }) : null;
const testDb = () => { if (!db) throw new Error("Explicit test database required"); return db; };

(databaseUrl ? describe : describe.skip)("course trial separate payment and attendance — real PostgreSQL", () => {
  let created = false;
  beforeAll(async () => {
    await testDb().$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    created = true;
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    // Prisma emits DDL statements without function bodies; each statement runs in this test schema.
    for (const statement of ddl.split(";").map(s => s.trim()).filter(Boolean)) {
      await testDb().$executeRawUnsafe(statement);
    }
    const legacyPlan=await testDb().coursePointPlan.create({data:{storeId:"legacy",name:"保留方案",points:10,price:1000,validDays:30}});
    const legacyCard=await testDb().coursePointCard.create({data:{id:"legacy-card",storeId:"legacy",planId:legacyPlan.id,nameSnapshot:"保留卡",remaining:7,expiresAt:new Date("2099-01-01"),requestKey:"legacy"}});
    const legacyRoom=await testDb().courseRoom.create({data:{storeId:"legacy",name:"原教室"}});
    const legacyTemplate=await testDb().courseTemplate.create({data:{storeId:"legacy",name:"原課程",durationMinutes:30,pointCost:3,capacity:2}});
    const legacySession=await testDb().courseSession.create({data:{storeId:"legacy",templateId:legacyTemplate.id,roomId:legacyRoom.id,coachId:"coach",nameSnapshot:"原課程",startsAt:new Date("2099-01-01"),endsAt:new Date("2099-01-01T01:00Z"),pointCost:3,capacity:2,requestKey:"legacy",requestIndex:0,createdById:"manager"}});
    await testDb().courseBooking.create({data:{id:"legacy-booking",storeId:"legacy",cardId:legacyCard.id,sessionId:legacySession.id,pointCost:3,customerId:"original-member",operatorUserId:"original",operatorName:"原操作人",customerName:"原上課人",requestKey:"legacy"}});
    // Reconstruct the pre-migration course shape, then apply the exact reviewed migration.
    await testDb().$executeRawUnsafe('DROP TABLE "CourseTrialPayment"');
    await testDb().$executeRawUnsafe('ALTER TABLE "CourseBooking" DROP COLUMN "bookingKind", DROP COLUMN "trialPrice", ALTER COLUMN "cardId" SET NOT NULL');
    await testDb().$executeRawUnsafe(`ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK ("pointCost">0 AND status IN ('RESERVED','CANCELLED','ATTENDED','NO_SHOW'))`);
    for (const role of ["anon","authenticated"]) await testDb().$executeRawUnsafe(`DO $role$ BEGIN CREATE ROLE "${role}" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$`);
    const migration=readFileSync("supabase/migrations/20260917143018_course_trial_separate_payment_attendance.sql","utf8");
    await testDb().$transaction(async tx=>{for(const statement of migration.split(";").map(s=>s.trim()).filter(s=>s && s!=="BEGIN" && s!=="COMMIT")) {const sql=statement.replace(/--[^\n]*/g,"").trim();if(sql && sql!=="BEGIN")await tx.$executeRawUnsafe(sql);}});
    expect(await testDb().courseBooking.findUnique({where:{id:"legacy-booking"}})).toMatchObject({bookingKind:"CARD",trialPrice:null,pointCost:3,status:"RESERVED",customerName:"原上課人",cardId:"legacy-card"});
    expect(await testDb().coursePointCard.findUnique({where:{id:"legacy-card"}})).toMatchObject({remaining:7});
    await testDb().$executeRawUnsafe('CREATE TABLE "Store" (id text PRIMARY KEY, "industryModule" text NOT NULL)');
    await testDb().$executeRawUnsafe('CREATE TYPE "CashbookEntryType" AS ENUM (\'INCOME\',\'EXPENSE\')');
    await testDb().$executeRawUnsafe('CREATE TYPE "CashbookPaymentMethod" AS ENUM (\'CASH\',\'OTHER\')');
    await testDb().$executeRawUnsafe(`CREATE TABLE "CashbookEntry" (
      id text PRIMARY KEY, "storeId" text, "entryDate" date, type text,
      "paymentMethod" "CashbookPaymentMethod", category text, amount integer,
      note text CHECK (note NOT LIKE '%force-rollback%'), "createdByUserId" text, "updatedAt" timestamp)`);
    await testDb().$executeRawUnsafe(`CREATE TABLE "AuditLog" (
      id text PRIMARY KEY, "actorUserId" text, "targetType" text, "targetId" text,
      action text, "beforeJson" jsonb, "afterJson" jsonb, "createdAt" timestamp)`);
  }, 30000);
  afterAll(async () => {
    if (created) await testDb().$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
    await db?.$disconnect();
  });

  async function fixture(){
    const storeId=randomUUID();await testDb().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
    const room=await testDb().courseRoom.create({data:{storeId,name:storeId}});
    const template=await testDb().courseTemplate.create({data:{storeId,name:storeId,durationMinutes:30,pointCost:3,capacity:2}});
    const session=await testDb().courseSession.create({data:{storeId,templateId:template.id,roomId:room.id,coachId:"coach",nameSnapshot:"體驗專用",startsAt:new Date("2026-01-01"),endsAt:new Date("2026-01-01T01:00Z"),pointCost:3,capacity:2,requestKey:storeId,requestIndex:0,createdById:"manager"}});
    const booking=await testDb().courseBooking.create({data:{storeId,sessionId:session.id,bookingKind:"TRIAL",trialPrice:499,pointCost:0,cardId:null,customerId:"member",operatorUserId:"manager",operatorName:"manager",customerName:"體驗專用",requestKey:storeId}});
    return {storeId,booking};
  }
  type Fixture=Awaited<ReturnType<typeof fixture>>;
  function collect(f:Fixture,requestKey:string,extra:Partial<Parameters<typeof collectCourseTrialInTransaction>[2]>={}){return testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return collectCourseTrialInTransaction(tx,{storeId:f.storeId,userId:"manager"},{bookingId:f.booking.id,requestKey,amount:499,paymentMethod:"CASH",...extra},{trialAllowPriceEdit:true,trialMinPrice:0,trialMaxPrice:1000});});}
  async function balance(f:Fixture){return testDb().$queryRaw<Array<{net:number}>>`SELECT COALESCE(sum(CASE WHEN type='INCOME' THEN amount ELSE -amount END),0)::int net FROM "CashbookEntry" WHERE "storeId"=${f.storeId}`;}
  it("concurrent identical collection records one receipt; attendance and correction never touch cards",async()=>{
    const f=await fixture(), key=randomUUID();
    const receipts=await Promise.all(Array.from({length:6},()=>collect(f,key)));
    expect(new Set(receipts.map(r=>r.id)).size).toBe(1);
    expect(await balance(f)).toEqual([{net:499}]);
    expect(await testDb().courseBooking.findUnique({where:{id:f.booking.id}})).toMatchObject({status:"RESERVED",checkedInAt:null,cardId:null});
    const actor={storeId:f.storeId,userId:"coach",name:"Coach"};
    for(const target of ["CHECKED_IN","ATTENDED","ATTENDED"] as const){await testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return settleCourseBooking(tx,actor,f.booking.id,target);});}
    await testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return correctCourseAttendance(tx,actor,f.booking.id,"NO_SHOW","ATTENDED");});
    expect(await testDb().courseBooking.findUnique({where:{id:f.booking.id}})).toMatchObject({status:"NO_SHOW",cardId:null});
    expect(await testDb().coursePointEntry.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await testDb().coursePointCard.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await balance(f)).toEqual([{net:499}]);
  });
  it("different request keys racing cannot collect twice",async()=>{
    const f=await fixture();const results=await Promise.allSettled(Array.from({length:4},()=>collect(f,randomUUID())));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(await testDb().courseTrialPayment.count({where:{storeId:f.storeId,status:"SUCCESS"}})).toBe(1);
    expect(await balance(f)).toEqual([{net:499}]);
  });
  it("correction preserves voided receipt and reverses accounting atomically without attendance",async()=>{
    const f=await fixture();const first=await collect(f,randomUUID());const key=randomUUID();
    const input={originalPaymentId:first.id,reason:"更正隔離驗收",amount:450,paymentMethod:"TRANSFER" as const};
    await collect(f,key,input);await collect(f,key,input);
    expect(await balance(f)).toEqual([{net:450}]);
    expect(await testDb().courseTrialPayment.count({where:{storeId:f.storeId}})).toBe(2);
    expect(await testDb().courseTrialPayment.findUnique({where:{id:first.id}})).toMatchObject({status:"VOIDED",voidReason:input.reason});
    expect(await testDb().courseBooking.findUnique({where:{id:f.booking.id}})).toMatchObject({status:"RESERVED",checkedInAt:null});
    await expect(collect(f,randomUUID(),input)).rejects.toThrow("原收款已變更");
  });
  it("cashbook failure rolls receipt back and allows safe retry",async()=>{
    const f=await fixture();await testDb().courseBooking.update({where:{id:f.booking.id},data:{customerName:"force-rollback"}});const key=randomUUID();
    await expect(collect(f,key)).rejects.toThrow();
    expect(await testDb().courseTrialPayment.count({where:{storeId:f.storeId}})).toBe(0);expect(await balance(f)).toEqual([{net:0}]);
    await testDb().courseBooking.update({where:{id:f.booking.id},data:{customerName:"已修復"}});await collect(f,key);expect(await balance(f)).toEqual([{net:499}]);
  });
  it("cross-store and cancelled trials cannot collect; mixed payment remains one total",async()=>{
    const f=await fixture();const other=await fixture();await expect(collect(other,randomUUID(),{bookingId:f.booking.id})).rejects.toThrow("找不到");
    await testDb().courseBooking.update({where:{id:f.booking.id},data:{status:"CANCELLED"}});await expect(collect(f,randomUUID())).rejects.toThrow("找不到");
    await collect(other,randomUUID(),{paymentSplits:[{paymentMethod:"CASH",amount:200},{paymentMethod:"TRANSFER",amount:299}]});expect(await balance(other)).toEqual([{net:499}]);
    expect(await testDb().courseTrialPayment.count({where:{storeId:other.storeId}})).toBe(1);
  });
  it("parallel voids reverse once and keep attendance unchanged",async()=>{
    const f=await fixture(),receipt=await collect(f,randomUUID());
    await Promise.all(Array.from({length:4},()=>testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return voidCourseTrialInTransaction(tx,{storeId:f.storeId,userId:"manager"},receipt.id,"作廢隔離驗收");})));
    expect(await balance(f)).toEqual([{net:0}]);
    expect(await testDb().courseBooking.findUnique({where:{id:f.booking.id}})).toMatchObject({status:"RESERVED",checkedInAt:null});
    expect(await testDb().courseTrialPayment.count({where:{storeId:f.storeId,status:"VOIDED"}})).toBe(1);
    expect(await testDb().coursePointEntry.count({where:{storeId:f.storeId}})).toBe(0);
  });

});
