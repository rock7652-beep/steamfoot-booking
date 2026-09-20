import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../../generated/course-client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";
import { refundUnusedCoursePurchase } from "@/server/services/course-refund";
import { lockCourseStore } from "@/server/services/course-store-lock";

// Explicit loopback-only disposable database; never falls back to DATABASE_URL.
const databaseUrl = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schemaName = `course_refund_${randomUUID().replaceAll("-", "")}`;
const scopedUrl = databaseUrl ? new URL(databaseUrl) : null;
scopedUrl?.searchParams.set("schema", schemaName);
scopedUrl?.searchParams.set("connection_limit", "12");
const db = scopedUrl ? new PrismaClient({ datasourceUrl: scopedUrl.toString() }) : null;
const testDb = () => { if (!db) throw new Error("Explicit test database required"); return db; };

(databaseUrl ? describe : describe.skip)("course negotiated refund — real PostgreSQL", () => {
  let created = false;
  beforeAll(async () => {
    await testDb().$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    created = true;
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "course-prisma/schema.prisma", "--script"], { encoding: "utf8" });
    // Prisma emits DDL statements without function bodies; each statement runs in this test schema.
    for (const statement of ddl.split(";").map(s => s.trim()).filter(Boolean)) {
      await testDb().$executeRawUnsafe(statement);
    }
    await testDb().$executeRawUnsafe('CREATE TABLE "Store" (id text PRIMARY KEY, "industryModule" text NOT NULL)');
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

  async function fixture() {
    const storeId = randomUUID(), purchaseId = randomUUID(), cardId = randomUUID();
    await testDb().$executeRaw`INSERT INTO "Store" VALUES (${storeId},'COURSE')`;
    const plan = await testDb().coursePointPlan.create({ data: { storeId, name: storeId, points: 10, price: 1000, validDays: 30 } });
    await testDb().coursePointCard.create({ data: { id: cardId, storeId, planId: plan.id, nameSnapshot: "隔離並行退款", remaining: 6, expiresAt: new Date("2099-01-01"), requestKey: cardId } });
    await testDb().coursePointEntry.createMany({ data: [
      { storeId, cardId, kind: "GRANT", points: 10, actorUserId: "test-manager" },
      { storeId, cardId, kind: "DEBIT", points: 4, actorUserId: "test-manager" },
    ] });
    await testDb().coursePurchase.create({ data: { id: purchaseId, storeId, customerId: "test-customer", planId: plan.id, name: "隔離並行退款", unit: "POINT", points: 10, price: 1000, validDays: 30, templateIds: [], status: "CONFIRMED", transferLastFive: "00000", requestKey: purchaseId, cardId } });
    await testDb().$executeRaw`INSERT INTO "CashbookEntry" (id,"storeId",type,"paymentMethod",amount) VALUES (${"course-purchase:" + purchaseId},${storeId},'INCOME','OTHER',1000)`;
    return { storeId, purchaseId, cardId };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function refund(f: Fixture, requestKey: string, amount = 600, expectedRemaining = 6, expectedRefundedAmount = 0, reason = "隔離並行測試") {
    return testDb().$transaction(async tx => {
      await lockCourseStore(tx, f.storeId);
      return refundUnusedCoursePurchase(tx, { storeId: f.storeId, userId: "test-manager" }, {
        purchaseId: f.purchaseId, requestKey, amount, expectedRemaining, expectedRefundedAmount, method: "BANK_TRANSFER", reason,
      });
    }, { timeout: 15000 });
  }
  async function race(f: Fixture, requests: Array<() => ReturnType<typeof refund>>) {
    let release!: () => void, locked!: () => void;
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const holder = testDb().$transaction(async tx => {
      await lockCourseStore(tx, f.storeId);
      locked();
      await gate;
    }, { timeout: 15000 });
    await ready;
    const results = Promise.allSettled(requests.map(run => run()));
    let waiting = 0;
    try {
      // Observe actual PostgreSQL lock waits before releasing, proving overlap.
      for (let attempt = 0; attempt < 100 && waiting < requests.length; attempt++) {
        const rows = await testDb().$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%industryModule%' AND query LIKE '%FOR UPDATE%'`;
        waiting = rows[0].count;
        if (waiting < requests.length) await new Promise(resolve => setTimeout(resolve, 20));
      }
    } finally { release(); }
    await holder;
    const settled = await results;
    expect(waiting).toBeGreaterThanOrEqual(requests.length);
    return settled;
  }
  async function assertLedger(f: Fixture, amount: number, count: number) {
    const refunds = await testDb().coursePurchaseRefund.findMany({ where: { purchaseId: f.purchaseId } });
    expect(refunds).toHaveLength(count);
    expect(refunds.reduce((sum, row) => sum + row.amount, 0)).toBe(amount);
    const cash = await testDb().$queryRaw<Array<{ amount: number; count: number }>>`
      SELECT COALESCE(sum(amount),0)::int AS amount,count(*)::int AS count FROM "CashbookEntry" WHERE "storeId"=${f.storeId} AND type='EXPENSE'`;
    expect(cash[0]).toEqual({ amount, count });
    expect(await testDb().coursePointCard.findUnique({ where: { id: f.cardId } })).toMatchObject({ remaining: amount ? 0 : 6, closedAt: amount ? expect.any(Date) : null });
    expect(await testDb().coursePointEntry.count({ where: { cardId: f.cardId, kind: "REFUND" } })).toBe(amount ? 1 : 0);
    const audit = await testDb().$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM "AuditLog" WHERE "targetId"=${f.purchaseId}`;
    expect(audit[0].count).toBe(count);
  }
  it("six simultaneous retries create one refund, one quota retirement and one expense", async () => {
    const f = await fixture();
    const results = await race(f, Array.from({ length: 6 }, () => () => refund(f, "same-key")));
    expect(results.every(r => r.status === "fulfilled")).toBe(true);
    await assertLedger(f, 600, 1);
  }, 20000);
  it("competing different requests cannot exceed paid amount or apply stale confirmations", async () => {
    const f = await fixture();
    const results = await race(f, [() => refund(f, "first"), () => refund(f, "second")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    await assertLedger(f, 600, 1);
    const final = await race(f, [() => refund(f, "top-up-a", 400, 0, 600), () => refund(f, "top-up-b", 400, 0, 600)]);
    expect(final.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await assertLedger(f, 1000, 2);
    await expect(refund(f, "over-cap", 1, 0, 1000)).rejects.toThrow("不得超過");
    await assertLedger(f, 1000, 2);
  }, 20000);
  it("an accounting write failure rolls back refund, quota, card and purchase together", async () => {
    const f = await fixture();
    await expect(refund(f, "rollback", 600, 6, 0, "force-rollback")).rejects.toThrow();
    await assertLedger(f, 0, 0);
    expect(await testDb().coursePurchase.findUnique({ where: { id: f.purchaseId } })).toMatchObject({ status: "CONFIRMED" });
    await refund(f, "rollback");
    await assertLedger(f, 600, 1);
  });
});
