import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { assignCourseWithCheckout } from "@/server/services/course-assignment-checkout";
import { deleteUnusedCourseItems } from "@/server/services/course-delete";
import { lockCourseStore } from "@/server/services/course-store-lock";

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
      note text CHECK (note NOT LIKE '%force-rollback%'), "createdByUserId" text, "updatedAt" timestamp)`);
    await testDb().$executeRawUnsafe(`CREATE TABLE "AuditLog" (
      id text PRIMARY KEY, "actorUserId" text, "targetType" text, "targetId" text,
      action text, "beforeJson" jsonb, "afterJson" jsonb, "createdAt" timestamp)`);
    await testDb().$executeRawUnsafe('CREATE TABLE "Customer" (id text PRIMARY KEY,"storeId" text,"mergedIntoCustomerId" text)');
    await testDb().$executeRawUnsafe('CREATE TABLE "CashDrawerSession" (id text PRIMARY KEY,"storeId" text,"businessDate" date,status text,"updatedAt" timestamp)');
  }, 30000);
  afterAll(async () => {
    if (created) await testDb().$executeRawUnsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
    await db?.$disconnect();
  });


  async function fixture() {
    const storeId=randomUUID(),customerId=randomUUID();
    await testDb().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
    await testDb().$executeRaw`INSERT INTO "Customer" VALUES (${customerId},${storeId},NULL)`;
    const plan=await testDb().coursePointPlan.create({data:{storeId,name:storeId,points:10,price:1000,validDays:30}});
    return {storeId,customerId,planId:plan.id,expiresDate:"2099-01-01",requestKey:randomUUID(),discountKind:"PERCENT" as const,discountValue:20,paymentMethod:"BANK_TRANSFER" as const,transferLastFour:"0123",expectedListPrice:1000};
  }
  function checkout(f:Awaited<ReturnType<typeof fixture>>) {
    return testDb().$transaction(async tx=>{await lockCourseStore(tx,f.storeId);return assignCourseWithCheckout(tx,{storeId:f.storeId,userId:"test-manager"},f);},{timeout:15000});
  }
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
});
