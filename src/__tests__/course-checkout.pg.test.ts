import { reserveCourseInTransaction, settleCourseBooking } from "@/server/services/course-booking";
import { personalIncomeView, summarizePersonalIncome } from "@/lib/course-personal-income";
import { confirmCourseMonthlySettlement } from "@/server/actions/course-monthly-settlement";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import {recordCourseProfitPayment,voidCourseProfitPayment} from "@/server/services/course-profit-payment";
import {readCourseMonthlySettlement,readSettlementSettings} from "@/server/services/course-monthly-settlement";
import {toLocalMonthStr} from "@/lib/date-utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { assignCourseWithCheckout } from "@/server/services/course-assignment-checkout";
import { deleteUnusedCourseItems } from "@/server/services/course-delete";
import { recordCourseFeePayment, voidCourseFeePayment } from "@/server/services/course-fee-payment";
import { lockCourseStore } from "@/server/services/course-store-lock";

vi.mock("@/server/services/course-access",()=>({courseTransaction:vi.fn(),courseManager:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/subscription-guard",()=>({assertStoreSubscriptionWritable:vi.fn()}));
vi.mock("@/lib/feature-gate",()=>({getStoreLimitsByStoreId:async()=>({maxMonthlyBookings:null}),requireStoreFeature:vi.fn()}));

// Explicit loopback-only disposable database; never falls back to DATABASE_URL.
const databaseUrl = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schemaName = `course_checkout_${randomUUID().replaceAll("-", "")}`;
const scopedUrl = databaseUrl ? new URL(databaseUrl) : null;
scopedUrl?.searchParams.set("schema", schemaName);
scopedUrl?.searchParams.set("connection_limit", "12");
const db = scopedUrl ? new PrismaClient({ datasourceUrl: scopedUrl.toString() }) : null;
const testDb = () => { if (!db) throw new Error("Explicit test database required"); return db; };

(databaseUrl ? describe : describe.skip)("course checkout and deletion — real PostgreSQL", () => {
  let created = false;
  beforeAll(async () => {
    await testDb().$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    created = true;
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    // Prisma emits DDL statements without function bodies; each statement runs in this test schema.
    for (const statement of ddl.split(";").map(s => s.trim()).filter(Boolean)) {
      await testDb().$executeRawUnsafe(statement);
    }
    await testDb().$executeRawUnsafe('ALTER TABLE "CoursePurchase" DROP COLUMN "listPrice", DROP COLUMN "discountKind", DROP COLUMN "discountValue", DROP COLUMN "paymentMethod", DROP COLUMN "transferLastFour"');
    const migration=readFileSync("prisma/migrations/20260920173000_course_assignment_checkout/migration.sql","utf8");
    for(const sql of migration.split(";").map(s=>s.trim()).filter(Boolean)) await testDb().$executeRawUnsafe(sql);
    await testDb().$executeRawUnsafe('CREATE TABLE "Store" (id text PRIMARY KEY, "industryModule" text NOT NULL)');
    await testDb().$executeRawUnsafe('CREATE TYPE "CashbookPaymentMethod" AS ENUM (\'CASH\',\'OTHER\')');
    await testDb().$executeRawUnsafe(`CREATE TABLE "CashbookEntry" (
      id text PRIMARY KEY, "storeId" text, "entryDate" date, type text,
      "paymentMethod" "CashbookPaymentMethod", category text, amount integer,
      note text CHECK (note NOT LIKE '%force-rollback%'), "staffId" text, "createdByUserId" text, "updatedAt" timestamp)`);
    await testDb().$executeRawUnsafe(`CREATE TABLE "AuditLog" (
      id text PRIMARY KEY, "actorUserId" text, "targetType" text, "targetId" text,
      action text, "beforeJson" jsonb, "afterJson" jsonb, "createdAt" timestamp)`);
    await testDb().$executeRawUnsafe('CREATE TABLE "User" (id text PRIMARY KEY,status text,role text)');
    await testDb().$executeRawUnsafe('CREATE TABLE "Staff" (id text PRIMARY KEY,"storeId" text,"userId" text,"displayName" text,status text)');
    await testDb().$executeRawUnsafe('CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,"mergedIntoCustomerId" text, name text)');
    await testDb().$executeRawUnsafe('CREATE TABLE "BusinessHours" ("storeId" text,"dayOfWeek" integer,"isOpen" boolean)');
    await testDb().$executeRawUnsafe('CREATE TABLE "SpecialBusinessDay" ("storeId" text,date date,type text)');
    await testDb().$executeRawUnsafe('CREATE UNIQUE INDEX "CourseFeePayment_active_session" ON "CourseFeePayment" ("storeId","sessionId") WHERE "voidedAt" IS NULL');
    await testDb().$executeRawUnsafe('CREATE TABLE "CashDrawerSession" (id text PRIMARY KEY,"storeId" text,"businessDate" date,status text,"updatedAt" timestamp)');
  }, 30000);
  afterAll(async () => {
    if (created) await testDb().$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
    await db?.$disconnect();
  });


  async function fixture() {
    const storeId=randomUUID(),customerId=randomUUID();
    await testDb().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
    await testDb().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},NULL,'學員')`;
    await testDb().$executeRaw`INSERT INTO "User" VALUES (${storeId},'ACTIVE','OWNER')`;
    await testDb().$executeRaw`INSERT INTO "Staff" VALUES (${storeId},${storeId},${storeId},'開發人','ACTIVE')`;
    const plan=await testDb().coursePointPlan.create({data:{storeId,name:storeId,points:10,price:1000,validDays:30}});
    return {revenueStaffId:storeId,expectedStoreCost:0,storeId,customerId,planId:plan.id,expiresDate:"2099-01-01",requestKey:randomUUID(),discountKind:"PERCENT" as const,discountValue:20,paymentMethod:"BANK_TRANSFER" as const,transferLastFour:"0123",expectedListPrice:1000};
  }
  function checkout(f:Awaited<ReturnType<typeof fixture>>) {
    return testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return assignCourseWithCheckout(tx,{storeId:f.storeId,userId:"test-manager"},f);},{timeout:15000});
  }
  it("one daily flow keeps checkout, attendance, confirmed income and corrected payment consistent",async()=>{
    // Only the clock and authorization boundary are controlled; all business writes use real PostgreSQL.
    vi.useFakeTimers({toFake:["Date"]});
    vi.setSystemTime(new Date("2026-09-25T01:00:00Z"));
    try {
      const f={...await fixture(),discountValue:0,expectedStoreCost:600};
      await testDb().coursePointPlan.update({where:{id:f.planId},data:{points:2,unit:"SESSION",storeCost:600}});
      const coachId=randomUUID();
      await testDb().$executeRaw`INSERT INTO "Staff" VALUES (${coachId},${f.storeId},${coachId},'驗收教練','ACTIVE')`;
      const actor={storeId:f.storeId,userId:f.storeId,name:"驗收店長"};
      const run=<T,>(work:(tx:import("../../generated/course-client").Prisma.TransactionClient)=>Promise<T>)=>testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return work(tx);});
      vi.mocked(courseManager).mockResolvedValue({storeId:f.storeId,user:{id:f.storeId,role:"OWNER"}} as Awaited<ReturnType<typeof courseManager>>);
      vi.mocked(courseTransaction).mockImplementation(async (_storeId,work)=>testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return work(tx);}));
      const order=await checkout(f);
      expect(await checkout(f)).toMatchObject({id:order.id});
      expect(order).toMatchObject({price:1000,storeCostSnapshot:600,developerProfitSnapshot:400});
      const room=await testDb().courseRoom.create({data:{storeId:f.storeId,name:"日常驗收教室"}});
      const template=await testDb().courseTemplate.create({data:{storeId:f.storeId,name:"日常驗收課",durationMinutes:60,pointCost:1,capacity:5}});
      const session=await testDb().courseSession.create({data:{storeId:f.storeId,templateId:template.id,roomId:room.id,coachId,nameSnapshot:template.name,startsAt:new Date("2026-09-25T02:00:00Z"),endsAt:new Date("2026-09-25T03:00:00Z"),capacity:5,pointCost:1,requestKey:randomUUID(),requestIndex:0,createdById:f.storeId}});
      await testDb().courseCompensationSnapshot.create({data:{sessionId:session.id,storeId:f.storeId,staffId:coachId,rule:{mode:"CLASS",value:200},revision:1,durationMinutes:60}});
      const reservation={sessionId:session.id,cardId:order.cardId!,customerId:f.customerId,requestKey:randomUUID()};
      const booking=await run(tx=>reserveCourseInTransaction(tx,actor,reservation,null));
      await run(tx=>reserveCourseInTransaction(tx,actor,reservation,null));
      expect(await testDb().coursePointCard.findUnique({where:{id:order.cardId!}})).toMatchObject({remaining:2});
      vi.setSystemTime(new Date("2026-09-25T04:00:00Z"));
      await run(tx=>settleCourseBooking(tx,actor,booking.id,"ATTENDED"));
      await run(tx=>settleCourseBooking(tx,actor,booking.id,"ATTENDED"));
      expect(await testDb().coursePointCard.findUnique({where:{id:order.cardId!}})).toMatchObject({remaining:1});
      expect(await testDb().coursePointEntry.count({where:{bookingId:booking.id,kind:"DEBIT"}})).toBe(1);
      const month="2026-09";
      const read=()=>run(tx=>readCourseMonthlySettlement(tx,f.storeId,month));
      let report=await read();
      expect(report.lines.map(l=>({kind:l.kind,amount:l.amount,issue:l.issue}))).toEqual([{kind:"PROFIT",amount:400,issue:null},{kind:"FEE",amount:200,issue:null}]);
      expect(personalIncomeView(coachId,report.lines,report.revisions[0]).confirmed).toBe(false);
      const confirmation={month,fingerprint:report.fingerprint,revision:0,reason:"獨立日常驗收"};
      expect(await confirmCourseMonthlySettlement(confirmation)).toEqual({success:true});
      expect(await confirmCourseMonthlySettlement(confirmation)).toEqual({success:true});
      const profit={month,purchaseId:order.id,amount:400,expectedRemaining:400,method:"OTHER",note:"內部驗收利潤",requestKey:randomUUID()};
      const fee={sessionId:session.id,expectedAmount:200,method:"OTHER",note:"內部驗收授課費",requestKey:randomUUID()};
      await run(tx=>recordCourseProfitPayment(tx,actor,profit));
      await run(tx=>recordCourseFeePayment(tx,actor,fee));
      await run(tx=>recordCourseFeePayment(tx,actor,fee));
      report=await read();
      expect(report.revisions).toHaveLength(1);
      const own=personalIncomeView(coachId,report.lines,report.revisions[0]);
      expect(own.lines).toHaveLength(1);
      expect(summarizePersonalIncome(own.lines)).toEqual({total:200,paid:200,remaining:0,overpaid:0});
      expect(JSON.stringify(own)).not.toContain("內部驗收");
      expect(summarizePersonalIncome(personalIncomeView(f.storeId,report.lines,report.revisions[0]).lines)).toEqual({total:400,paid:400,remaining:0,overpaid:0});
      const [payment]=await testDb().$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseFeePayment" WHERE "sessionId"=${session.id}`;
      const correction={paymentId:payment.id,reason:"日常驗收付款方式誤登"};
      await run(tx=>voidCourseFeePayment(tx,actor,correction));
      await run(tx=>voidCourseFeePayment(tx,actor,correction));
      report=await read();
      expect(summarizePersonalIncome(personalIncomeView(coachId,report.lines,report.revisions[0]).lines)).toEqual({total:200,paid:0,remaining:200,overpaid:0});
      await run(tx=>recordCourseFeePayment(tx,actor,{...fee,requestKey:randomUUID(),note:"更正後重新登錄"}));
      report=await read();
      const corrected=personalIncomeView(coachId,report.lines,report.revisions[0]);
      expect(summarizePersonalIncome(corrected.lines)).toEqual({total:200,paid:200,remaining:0,overpaid:0});
      expect(corrected.lines[0].payments).toHaveLength(2);
      expect(corrected.lines[0].payments.filter(p=>p.voided)).toHaveLength(1);
      const cash=await testDb().$queryRaw<Array<{type:string;amount:number}>>`SELECT type,amount FROM "CashbookEntry" WHERE "storeId"=${f.storeId}`;
      expect(cash).toHaveLength(5); // purchase, profit, fee, fee reversal, replacement
      expect(cash.reduce((sum,e)=>sum+(e.type==="INCOME"?e.amount:-e.amount),0)).toBe(400);
      expect(await testDb().coursePointCard.findUnique({where:{id:order.cardId!}})).toMatchObject({remaining:1});
    } finally { vi.useRealTimers(); }
  });
  it("concurrent retries issue one card and one receipt at the discounted amount",async()=>{
    const f=await fixture();const results=await Promise.all([checkout(f),checkout(f),checkout(f)]);
    expect(new Set(results.map(r=>r.id)).size).toBe(1);
    expect(await testDb().coursePointCard.count({where:{storeId:f.storeId}})).toBe(1);
    const receipts=await testDb().$queryRaw<Array<{amount:number}>>`SELECT amount FROM "CashbookEntry" WHERE "storeId"=${f.storeId}`;
    expect(receipts).toEqual([{amount:800}]);expect(results[0].transferLastFour).toBe("0123");
  });
  it("a failed receipt rolls back the card, grant and purchase together",async()=>{
    const f=await fixture();await testDb().coursePointPlan.update({where:{id:f.planId},data:{name:"force-rollback"}});
    await expect(checkout(f)).rejects.toThrow();
    expect(await testDb().coursePointCard.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await testDb().coursePurchase.count({where:{storeId:f.storeId}})).toBe(0);
  });
  it("zero checkout records a full discount without income",async()=>{
    const f={...await fixture(),discountValue:100};const order=await checkout(f);
    expect(order).toMatchObject({price:0,paymentMethod:"DISCOUNT"});
    const receipts=await testDb().$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "CashbookEntry" WHERE "storeId"=${f.storeId}`;
    expect(Number(receipts[0].count)).toBe(0);
  });
  it("deletes unused items but blocks a mixed batch containing a used plan",async()=>{
    const f=await fixture();await checkout(f);
    const unused=await testDb().coursePointPlan.create({data:{storeId:f.storeId,name:"unused",points:1,validDays:30}});
    const remove=(ids:string[])=>testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return deleteUnusedCourseItems(tx,{storeId:f.storeId,userId:"test-manager"},"plan",ids);});
    await expect(remove([unused.id,f.planId])).rejects.toThrow();
    expect(await testDb().coursePointPlan.count({where:{storeId:f.storeId}})).toBe(2);
    await expect(remove([unused.id])).resolves.toBe(1);
    expect(await testDb().coursePointPlan.count({where:{storeId:f.storeId}})).toBe(1);
  });
  async function termFixture(full=false){
    const f=await fixture();
    const room=await testDb().courseRoom.create({data:{storeId:f.storeId,name:'教室'}});
    const template=await testDb().courseTemplate.create({data:{storeId:f.storeId,name:'期課',durationMinutes:60,pointCost:1,capacity:20}});
    const sessions=[];
    for(let i=0;i<2;i++)sessions.push(await testDb().courseSession.create({data:{storeId:f.storeId,templateId:template.id,roomId:room.id,coachId:'coach',nameSnapshot:'期課',startsAt:new Date(`2098-01-0${i+1}T01:00:00Z`),endsAt:new Date(`2098-01-0${i+1}T02:00:00Z`),capacity:full&&i===1?0:20,pointCost:1,requestKey:randomUUID(),requestIndex:0,createdById:'manager'}}));
    await testDb().coursePointPlan.update({where:{id:f.planId},data:{unit:'SESSION',points:2,termSessionIds:sessions.map(s=>s.id),templateIds:[template.id]}});
    return f;
  }
  it('enrolls every term class once with the purchase receipt',async()=>{
    const f=await termFixture();const order=await checkout(f);await checkout(f);
    expect(await testDb().courseBooking.count({where:{storeId:f.storeId,cardId:order.cardId}})).toBe(2);
    expect(order).toMatchObject({storeCostSnapshot:0,developerProfitSnapshot:800});
  });
  it('rolls back the entire term and receipt when a later class is full',async()=>{
    const f=await termFixture(true);await expect(checkout(f)).rejects.toThrow('滿班');
    expect(await testDb().courseBooking.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await testDb().coursePointCard.count({where:{storeId:f.storeId}})).toBe(0);
    expect(await testDb().coursePurchase.count({where:{storeId:f.storeId}})).toBe(0);
    const [{count}]=await testDb().$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "CashbookEntry" WHERE "storeId"=${f.storeId}`;expect(Number(count)).toBe(0);
  });

  async function feeFixture() {
    const f=await fixture();
    const room=await testDb().courseRoom.create({data:{storeId:f.storeId,name:"教室"}});
    const template=await testDb().courseTemplate.create({data:{storeId:f.storeId,name:"授課",durationMinutes:60,pointCost:1,capacity:20}});
    const session=await testDb().courseSession.create({data:{storeId:f.storeId,templateId:template.id,roomId:room.id,coachId:f.storeId,nameSnapshot:"授課",startsAt:new Date("2020-01-01T01:00:00Z"),endsAt:new Date("2020-01-01T02:00:00Z"),pointCost:1,capacity:20,requestKey:randomUUID(),requestIndex:0,createdById:f.storeId}});
    await testDb().courseCompensationSnapshot.create({data:{sessionId:session.id,storeId:f.storeId,staffId:f.storeId,rule:{mode:"CLASS",value:600},revision:1,durationMinutes:60}});
    const input={sessionId:session.id,requestKey:randomUUID(),expectedAmount:600,method:"OTHER",note:"授課轉帳"};
    const actor={storeId:f.storeId,userId:f.storeId};
    const run=(data=input)=>testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);await recordCourseFeePayment(tx,actor,data);});
    return {f,input,actor,run};
  }
  it("concurrent class payments create a single expense",async()=>{
    const {f,run}=await feeFixture();await Promise.all([run(),run(),run()]);
    const [{count}]=await testDb().$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "CourseFeePayment" WHERE "storeId"=${f.storeId}`;
    expect(Number(count)).toBe(1);
    const entries=await testDb().$queryRaw<Array<{amount:number}>>`SELECT amount FROM "CashbookEntry" WHERE "storeId"=${f.storeId}`;expect(entries).toEqual([{amount:600}]);
  });
  it("failed fee expense rolls back its payment",async()=>{
    const {f,input,run}=await feeFixture();await expect(run({...input,note:"force-rollback"})).rejects.toThrow();
    const [{count}]=await testDb().$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "CourseFeePayment" WHERE "storeId"=${f.storeId}`;expect(Number(count)).toBe(0);
  });
  it("fee correction preserves original and allows one replacement",async()=>{
    const {f,input,actor,run}=await feeFixture();await run();
    const [payment]=await testDb().$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseFeePayment" WHERE "storeId"=${f.storeId}`;
    const correct=()=>testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);await voidCourseFeePayment(tx,actor,{paymentId:payment.id,reason:"誤登方式"});});
    await Promise.all([correct(),correct()]);await expect(run()).rejects.toThrow("已更正");
    await run({...input,requestKey:randomUUID()});
    const entries=await testDb().$queryRaw<Array<{type:string;amount:number}>>`SELECT type,amount FROM "CashbookEntry" WHERE "storeId"=${f.storeId}`;
    expect(entries).toHaveLength(3);expect(entries.reduce((n,e)=>n+(e.type==="EXPENSE"?e.amount:-e.amount),0)).toBe(600);
  });

  async function profitFixture() {
    const f=await fixture(); const order=await checkout(f); const month=toLocalMonthStr();
    const report=await testDb().$transaction(tx=>readCourseMonthlySettlement(tx,f.storeId,month));
    await testDb().$executeRaw`INSERT INTO "CourseMonthlySettlement" (id,"storeId",month,revision,fingerprint,snapshot,"actorUserId",reason) VALUES (${randomUUID()},${f.storeId},${month},1,${report.fingerprint},${JSON.stringify(report.lines)}::jsonb,${f.storeId},'確認')`;
    return {f,order,month,input:{month,purchaseId:order.id,amount:300,expectedRemaining:800,method:"OTHER",note:"已付款",requestKey:randomUUID()}};
  }
  async function profitPay(x:Awaited<ReturnType<typeof profitFixture>>,input=x.input){
    return testDb().$transaction(async tx=>{await lockCourseStore(tx,x.f.storeId);await recordCourseProfitPayment(tx,{storeId:x.f.storeId,userId:x.f.storeId},input);},{timeout:15000});
  }
  it("concurrent profit retries register one partial payment and expense",async()=>{
    const x=await profitFixture();await Promise.all([profitPay(x),profitPay(x),profitPay(x)]);
    const rows=await testDb().$queryRaw<Array<{amount:number}>>`SELECT amount FROM "CourseProfitPayment" WHERE "storeId"=${x.f.storeId}`;expect(rows).toEqual([{amount:300}]);
    const entries=await testDb().$queryRaw<Array<{amount:number}>>`SELECT amount FROM "CashbookEntry" WHERE "storeId"=${x.f.storeId} AND category='課程店長利潤'`;expect(entries).toEqual([{amount:300}]);
    await profitPay(x,{...x.input,amount:500,expectedRemaining:500,requestKey:randomUUID()});
    await expect(profitPay(x,{...x.input,requestKey:randomUUID()})).rejects.toThrow();
  });
  it("failed profit expense rolls back payment and audit",async()=>{
    const x=await profitFixture();await expect(profitPay(x,{...x.input,note:"force-rollback"})).rejects.toThrow();
    const rows=await testDb().$queryRaw<Array<{count:bigint}>>`SELECT count(*) FROM "CourseProfitPayment" WHERE "storeId"=${x.f.storeId}`;expect(Number(rows[0].count)).toBe(0);
  });
  it("profit correction keeps original and permits a new payment once",async()=>{
    const x=await profitFixture();await profitPay(x);
    const rows=await testDb().$queryRaw<Array<{id:string}>>`SELECT id FROM "CourseProfitPayment" WHERE "storeId"=${x.f.storeId}`;
    const correct=()=>testDb().$transaction(async tx=>{await lockCourseStore(tx,x.f.storeId);await voidCourseProfitPayment(tx,{storeId:x.f.storeId,userId:x.f.storeId},{paymentId:rows[0].id,reason:"誤登"});});
    await Promise.all([correct(),correct()]);await profitPay(x,{...x.input,requestKey:randomUUID()});
    const report=await testDb().$transaction(tx=>readCourseMonthlySettlement(tx,x.f.storeId,x.month));expect(report.lines[0].paid).toBe(300);expect(report.lines[0].payments).toHaveLength(2);
  });

  it("fee switch changes new snapshots only and preserves existing zero/nonzero fees",async()=>{
    const f=await fixture();
    const migration=readFileSync("prisma/migrations/20260924090000_course_monthly_settlement/migration.sql","utf8");
    const functionSql=("CREATE OR REPLACE FUNCTION"+migration.split("CREATE OR REPLACE FUNCTION")[1]).split("REVOKE ALL ON FUNCTION")[0].replace("SET search_path = public",`SET search_path = "${schemaName}"`);
    await testDb().$executeRawUnsafe(functionSql);
    await testDb().$executeRawUnsafe('CREATE TRIGGER course_capture_compensation AFTER INSERT OR UPDATE OF "coachId","templateId","startsAt","endsAt" ON "CourseSession" FOR EACH ROW EXECUTE FUNCTION course_capture_compensation()');
    try {
      const room=await testDb().courseRoom.create({data:{storeId:f.storeId,name:"測試教室"}});
      const template=await testDb().courseTemplate.create({data:{storeId:f.storeId,name:"授課費開關",durationMinutes:60,pointCost:1,capacity:20}});
      await testDb().courseCompensation.create({data:{storeId:f.storeId,templateId:template.id,staffId:f.storeId,rules:[{mode:"CLASS",value:600}]}});
      const create=()=>testDb().courseSession.create({data:{storeId:f.storeId,templateId:template.id,roomId:room.id,coachId:f.storeId,nameSnapshot:"授課",startsAt:new Date("2098-01-01T01:00:00Z"),endsAt:new Date("2098-01-01T02:00:00Z"),pointCost:1,capacity:20,requestKey:randomUUID(),requestIndex:0,createdById:f.storeId}});
      const original=await create();
      await testDb().$executeRaw`INSERT INTO "CourseSettlementSetting" ("storeId","feeEnabled") VALUES (${f.storeId},false)`;
      const incomeMigration=readFileSync("prisma/migrations/20260924160000_course_personal_income/migration.sql","utf8");
      await testDb().$executeRawUnsafe(incomeMigration);
      await testDb().$executeRawUnsafe(incomeMigration);
      expect((await readSettlementSettings(testDb(),f.storeId)).personalIncomeEnabled).toBe(false);
      await testDb().$executeRaw`UPDATE "CourseSettlementSetting" SET "personalIncomeEnabled"=true WHERE "storeId"=${f.storeId}`;
      expect(await readSettlementSettings(testDb(),f.storeId)).toMatchObject({personalIncomeEnabled:true,feeEnabled:false});
      const disabled=await create();
      await testDb().$executeRaw`UPDATE "CourseSettlementSetting" SET "feeEnabled"=true WHERE "storeId"=${f.storeId}`;
      const enabled=await create();
      const snapshots=await testDb().courseCompensationSnapshot.findMany({where:{storeId:f.storeId}});
      expect(snapshots.find(s=>s.sessionId===original.id)?.rule).toEqual({mode:"CLASS",value:600});
      expect(snapshots.find(s=>s.sessionId===disabled.id)?.rule).toEqual({mode:"CLASS",value:0});
      expect(snapshots.find(s=>s.sessionId===enabled.id)?.rule).toEqual({mode:"CLASS",value:600});
    }finally{await testDb().$executeRawUnsafe('DROP TRIGGER course_capture_compensation ON "CourseSession"');}
  });

});
