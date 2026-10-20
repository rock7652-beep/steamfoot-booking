import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { customerConsumptionSql } from "@/server/queries/customer-consumption-sql";
import { parseConsumptionFilters, type ConsumptionParams } from "@/lib/customer-consumption";
import type { ConsumptionResult } from "@/server/queries/customer-consumption";

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    CREATE TABLE "User" (id text PRIMARY KEY,status text);
    CREATE TABLE "Staff" (id text PRIMARY KEY,"storeId" text,"displayName" text);
    CREATE TABLE "Customer" (id text PRIMARY KEY,"userId" text,"storeId" text,name text,phone text,"mergedIntoCustomerId" text,"assignedStaffId" text,"createdAt" timestamptz DEFAULT '2026-01-01');
    CREATE TABLE "CourseSession" (id text PRIMARY KEY,"storeId" text,"startsAt" timestamptz,"cancelledAt" timestamptz);
    CREATE TABLE "CoursePointCard" (id text PRIMARY KEY,"storeId" text,"planId" text,"nameSnapshot" text,unit text,remaining int,"closedAt" timestamptz,"expiresAt" timestamptz DEFAULT '2027-01-01');
    CREATE TABLE "CourseCardMember" ("cardId" text,"storeId" text,"customerId" text);
    CREATE TABLE "CourseBooking" (id text PRIMARY KEY,"storeId" text,"sessionId" text,"cardId" text,"customerId" text,"bookingKind" text DEFAULT 'CARD',"pointCost" int DEFAULT 0,status text,"absenceKind" text);
    CREATE TABLE "CourseTrialPayment" (id text PRIMARY KEY,"storeId" text,"bookingId" text,amount int,status text,"createdAt" timestamptz);
    CREATE TABLE "CoursePurchase" (id text PRIMARY KEY,"storeId" text,"customerId" text,"planId" text,price int,status text,"voidedAt" timestamptz,"confirmedAt" timestamptz);
    CREATE TABLE "CoursePurchaseRefund" (id text PRIMARY KEY,"storeId" text,"purchaseId" text,amount int,"createdAt" timestamptz);
    CREATE TABLE "ServicePlan" (id text PRIMARY KEY,"storeId" text,name text);
    CREATE TABLE "CustomerPlanWallet" (id text PRIMARY KEY,"storeId" text,"customerId" text,"planId" text,"remainingSessions" int,status text,"expiryDate" date);
    CREATE TABLE "Booking" (id text PRIMARY KEY,"storeId" text,"customerId" text,"customerPlanWalletId" text,"servicePlanId" text,"bookingDate" date,"bookingStatus" text);
    CREATE TABLE "WalletSession" (id text PRIMARY KEY,"walletId" text,"bookingId" text,status text);
    CREATE TABLE "BookingParticipantGroup" (id text PRIMARY KEY,"storeId" text,"bookingId" text);
    CREATE TABLE "BookingParticipant" (id text PRIMARY KEY,"storeId" text,"groupId" text,"customerId" text,status text,"walletSessionId" text,"collectionTransactionId" text);
    CREATE TABLE "Transaction" (id text PRIMARY KEY,"storeId" text,"customerId" text,"bookingId" text,"planId" text,"customerPlanWalletId" text,status text DEFAULT 'SUCCESS',"paymentStatus" text DEFAULT 'SUCCESS',"paymentMethod" text DEFAULT 'CASH',"transactionType" text,amount numeric,"refundAmount" numeric DEFAULT 0,"refundOfTransactionId" text,"paidAt" timestamptz,"createdAt" timestamptz DEFAULT '2026-10-20T04:00:00Z');
  `);
});
afterAll(() => db.close());
beforeEach(async () => {
  const tables = await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  for (const { tablename } of tables.rows) await db.exec(`TRUNCATE "${tablename}"`);
  await db.exec(`
    INSERT INTO "User" VALUES ('suspended-user','SUSPENDED');
    INSERT INTO "Staff" VALUES ('staff-a','store','林店長'),('staff-b','store','陳店長'),('foreign-staff','foreign','外店店長');
    INSERT INTO "Customer" (id,"storeId",name,phone,"assignedStaffId") VALUES
      ('a','store','Alice','0900','staff-a'),('b','store','Bob','0901','staff-b'),('zero','store','Zero','0902','staff-a'),('other','foreign','外店','0903','staff-a');
    INSERT INTO "Customer" (id,"storeId",name,"userId","mergedIntoCustomerId") VALUES ('suspended','store','停用','suspended-user',NULL),('merged','store','合併',NULL,'a');
    INSERT INTO "Customer" (id,"storeId",name,"createdAt") VALUES ('future','store','新客','2026-10-21T00:00:00Z');
  `);
});

async function report(module: "course" | "steamfoot", params: ConsumptionParams = {}, scope: string | null = null, exporting = false) {
  const filters = parseConsumptionFilters({ preset: "custom", startDate: "2026-10-20", endDate: "2026-10-20", ...params });
  const sql = customerConsumptionSql("store", module, scope, filters, exporting, new Date("2026-10-20T04:00:00Z"));
  const result = await db.query<ConsumptionResult>(sql.text, sql.values.map(value => value instanceof Date ? value.toISOString() : value));
  return result.rows[0];
}
async function seedCourse() {
  await db.exec(`
    INSERT INTO "CourseSession" (id,"storeId","startsAt") VALUES ('s','store','2026-10-19T16:00:00Z'),('old','store','2026-10-19T15:59:59.999Z'),('end','store','2026-10-20T15:59:59.999Z'),('next','store','2026-10-20T16:00:00Z');
    INSERT INTO "CoursePointCard" (id,"storeId","planId","nameSnapshot",unit,remaining) VALUES ('sessions','store','p-session','堂數卡','SESSION',8),('points','store','p-point','點數卡','POINT',15),('grid','store','p-grid','格數卡','GRID',9);
    INSERT INTO "CourseCardMember" VALUES ('sessions','store','a'),('sessions','store','b'),('points','store','a'),('grid','store','a');
    INSERT INTO "CourseBooking" (id,"storeId","sessionId","cardId","customerId","pointCost",status,"absenceKind") VALUES
      ('attend','store','s','sessions','a',2,'ATTENDED',NULL),('absent','store','s','points','a',4,'NO_SHOW',NULL),
      ('forfeit','store','s','grid','a',1,'CANCELLED','GROUP_LEAVE_FORFEITED'),('reserved','store','s','points','a',3,'RESERVED',NULL),
      ('cancel','store','s','points','a',2,'CANCELLED',NULL),('free','store','s','points','a',0,'ATTENDED',NULL),
      ('old-booking','store','old','points','a',6,'ATTENDED',NULL),('late','store','end','sessions','b',1,'ATTENDED',NULL),
      ('next-booking','store','next','points','a',6,'ATTENDED',NULL),('foreign-customer','store','s','points','other',100,'ATTENDED',NULL);
    INSERT INTO "CourseBooking" (id,"storeId","sessionId","customerId","bookingKind",status) VALUES ('trial','store','s','a','TRIAL','ATTENDED');
    INSERT INTO "CourseTrialPayment" VALUES ('pay','store','trial',120,'SUCCESS','2026-10-19T16:00:00Z'),('void','store','trial',500,'VOIDED','2026-10-20T04:00:00Z');
    INSERT INTO "CoursePurchase" (id,"storeId","customerId","planId",price,status,"confirmedAt") VALUES
      ('buy','store','a','p-session',1000,'CONFIRMED','2026-10-20T04:00:00Z'),('pending','store','a','p-point',900,'PENDING','2026-10-20T04:00:00Z');
    INSERT INTO "CoursePurchaseRefund" VALUES ('refund','store','buy',100,'2026-10-20T04:00:00Z');
  `);
}

describe("course consumption SQL on embedded PostgreSQL", () => {
  beforeEach(seedCourse);
  it("shows current assigned manager while excluding a mismatched store's staff name", async () => {
    expect((await report("course")).rows.find(row => row.id === "a")?.assignedStaffName).toBe("林店長");
    await db.exec(`UPDATE "Customer" SET "assignedStaffId"='staff-b' WHERE id='a'; UPDATE "Customer" SET "assignedStaffId"='foreign-staff' WHERE id='zero'`);
    const { rows } = await report("course");
    expect(rows.find(row => row.id === "a")?.assignedStaffName).toBe("陳店長");
    expect(rows.find(row => row.id === "zero")?.assignedStaffName).toBeNull();
  });
  it("filters current assigned manager and never expands SELF_ONLY visibility", async () => {
    expect((await report("course", { staffId: "staff-a" })).rows.map(row => row.id)).toEqual(["a", "zero"]);
    expect((await report("course", { staffId: "staff-a" }, "staff-b")).rows).toEqual([]);
    await db.exec(`UPDATE "Customer" SET "assignedStaffId"=NULL WHERE id='zero'`);
    expect((await report("course", { staffId: "__unassigned__" })).rows.map(row => row.id)).toEqual(["zero"]);
    expect((await report("course", { staffId: "staff-b", count_min: "1" })).rows.map(row => row.id)).toEqual(["b"]);
  });
  it("counts actual debit including no-show and forfeited leave, separates units, receipts and current shared balance", async () => {
    const data = await report("course");
    expect(data.total).toBe(3);
    expect(data.rows[0]).toMatchObject({ id: "a", count: 4, sessions: 2, points: 4, grids: 1, amount: 120, paid: 1020 });
    expect(data.rows[0].balances).toContain("堂數卡（共卡）：剩餘 8 堂");
    expect(data.rows.find(row => row.id === "b")).toMatchObject({ count: 1, sessions: 1, points: 0 });
    expect(data.rows.find(row => row.id === "zero")).toMatchObject({ count: 0, paid: 0 });
  });
  it("can exclude absent/forfeited service consumption without changing real receipts", async () => {
    const { rows } = await report("course", { includeAbsent: "0" });
    expect(rows[0]).toMatchObject({ id: "a", count: 2, sessions: 2, points: 0, grids: 0, amount: 120, paid: 1020 });
  });
  it("attributes shared card consumption to the booked customer, and applies plan filtering to every metric", async () => {
    const { rows } = await report("course", { planId: "p-session" });
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.id === "a")).toMatchObject({ count: 1, sessions: 2, paid: 900, amount: 0, points: 0 });
    expect(rows.find(row => row.id === "b")).toMatchObject({ count: 1, sessions: 1, paid: 0 });
  });
  it("honors reversal/current state instead of counting historical debit events", async () => {
    await db.exec(`UPDATE "CourseBooking" SET status='RESERVED' WHERE id='attend'`);
    expect((await report("course")).rows[0]).toMatchObject({ id: "a", count: 3, sessions: 0 });
  });
  it("filters all ranges together, ranks ascending and keeps zero-consumption customers", async () => {
    const data = await report("course", { direction: "asc", top: "2", count_max: "1", paid_max: "0" });
    expect(data.matched).toBe(2);
    expect(data.rows.map(row => row.id)).toEqual(["zero", "b"]);
  });
  it("enforces assignment/store/customer status even when searching names or selecting zero consumption", async () => {
    const data = await report("course", {}, "staff-b");
    expect(data.rows.map(row => row.id)).toEqual(["b"]);
    expect((await report("course", { q: "' OR 1=1 --" })).rows).toEqual([]);
    expect((await report("course", { q: "0900" })).rows.map(row => row.id)).toEqual(["a"]);
  });
  it("does not turn a receipt for an unfulfilled trial into service consumption", async () => {
    await db.exec(`UPDATE "CourseBooking" SET status='RESERVED' WHERE id='trial'`);
    expect((await report("course", { planId: "__trial__" })).rows[0]).toMatchObject({ count: 0, amount: 0, paid: 120 });
  });
  it("paginates in SQL, clamps stale pages, and exports all selected rows in the same stable order", async () => {
    await db.exec(`INSERT INTO "Customer" (id,"storeId",name,phone) SELECT 'extra-'||n,'store','相同名字','' FROM generate_series(1,110) n`);
    const one = await report("course", { direction: "asc" });
    const two = await report("course", { direction: "asc", page: "2" });
    expect(one.rows).toHaveLength(50); expect(two.rows).toHaveLength(50);
    expect(new Set([...one.rows, ...two.rows].map(row => row.id)).size).toBe(100);
    expect(await report("course", { page: "999" })).toMatchObject({ total: 113, page: 3 });
    const exported = await report("course", { direction: "asc", top: "75", page: "2" }, null, true);
    expect(exported.rows).toHaveLength(75);
    expect(exported.rows.slice(0, 50)).toEqual(one.rows);
  });
});

describe("Steamfoot consumption SQL on embedded PostgreSQL", () => {
  beforeEach(async () => {
    await db.exec(`
      INSERT INTO "ServicePlan" VALUES ('plan','store','十堂卡');
      INSERT INTO "CustomerPlanWallet" VALUES ('wallet','store','a','plan',5,'ACTIVE','2027-01-01');
      INSERT INTO "Booking" VALUES ('done','store','a','wallet','plan','2026-10-20','COMPLETED'),('no-show','store','a','wallet','plan','2026-10-20','NO_SHOW'),('reverted','store','a','wallet','plan','2026-10-20','CONFIRMED');
      INSERT INTO "WalletSession" VALUES ('1','wallet','done','COMPLETED'),('2','wallet','done','COMPLETED'),('3','wallet','no-show','COMPLETED'),('4','wallet','reverted','RESERVED');
      INSERT INTO "Transaction" (id,"storeId","customerId","bookingId","planId","transactionType",amount) VALUES
        ('single','store','a','done','plan','SINGLE_PURCHASE',500),('supplement','store','a','done','plan','SUPPLEMENT',100),('purchase','store','a',NULL,'plan','PACKAGE_PURCHASE',5000),
        ('standalone','store','b',NULL,'plan','SINGLE_PURCHASE',200),('paper','store','a',NULL,'plan','PAPER_MIGRATION',9999);
      INSERT INTO "Transaction" (id,"storeId","customerId","planId","transactionType",amount,"paymentStatus") VALUES ('pending','store','a','plan','SINGLE_PURCHASE',1000,'PENDING');
      INSERT INTO "Transaction" (id,"storeId","customerId","transactionType",amount,"refundOfTransactionId") VALUES ('refund','store','a','REFUND',50,'single');
    `);
  });
  it("counts each service once despite multiple wallet slots and charges, plus standalone paid services", async () => {
    const data = await report("steamfoot");
    expect(data.rows[0]).toMatchObject({ id: "a", count: 2, sessions: 3, amount: 550, paid: 5550 });
    expect(data.rows[1]).toMatchObject({ id: "b", count: 1, sessions: 0, amount: 200, paid: 200 });
  });
  it("includes/excludes charged no-shows and ignores cancelled/reverted wallet slots", async () => {
    expect((await report("steamfoot", { includeAbsent: "0" })).rows[0]).toMatchObject({ count: 1, sessions: 2 });
    await db.exec(`UPDATE "WalletSession" SET status='RESERVED' WHERE "bookingId"='no-show'; UPDATE "Booking" SET "bookingStatus"='CONFIRMED' WHERE id='no-show'`);
    expect((await report("steamfoot")).rows[0]).toMatchObject({ count: 1, sessions: 2 });
  });
  it("uses original transaction plan for refund filtering, and paidAt rather than creation date", async () => {
    expect((await report("steamfoot", { planId: "plan" })).rows[0]).toMatchObject({ paid: 5550 });
    await db.exec(`UPDATE "Transaction" SET "createdAt"='2026-10-19T15:00:00Z',"paidAt"='2026-10-19T16:00:00Z' WHERE id='purchase'`);
    expect((await report("steamfoot")).rows[0].paid).toBe(5550);
    await db.exec(`UPDATE "Transaction" SET "paidAt"='2026-10-20T16:00:00Z' WHERE id='purchase'`);
    expect((await report("steamfoot")).rows[0].paid).toBe(550);
  });
  it("removes voided money from consumption, excludes foreign customers and narrows staff scope", async () => {
    await db.exec(`UPDATE "Transaction" SET status='VOIDED' WHERE id='standalone'`);
    const data = await report("steamfoot", {}, "staff-b");
    expect(data.rows).toHaveLength(1); expect(data.rows[0]).toMatchObject({ id: "b", count: 0, amount: 0, paid: 0 });
  });
  it("attributes each registered group participant to their own customer while other people remain pending", async () => {
    await db.exec(`
      INSERT INTO "Booking" VALUES ('group-booking','store','a',NULL,'plan','2026-10-20','CONFIRMED');
      INSERT INTO "BookingParticipantGroup" VALUES ('group','store','group-booking');
      INSERT INTO "Transaction" (id,"storeId","customerId","bookingId","planId","transactionType",amount) VALUES ('participant-pay','store','b','group-booking','plan','TRIAL_PURCHASE',300);
      INSERT INTO "BookingParticipant" VALUES ('person-a','store','group','a','PENDING',NULL,NULL),('person-b','store','group','b','COMPLETED',NULL,'participant-pay'),('unregistered','store','group',NULL,'COMPLETED',NULL,NULL);
    `);
    const data = await report("steamfoot");
    expect(data.rows.find(row => row.id === "a")).toMatchObject({ count: 2, amount: 550 });
    expect(data.rows.find(row => row.id === "b")).toMatchObject({ count: 2, amount: 500, paid: 500 });
    await db.exec(`UPDATE "Booking" SET "bookingStatus"='COMPLETED' WHERE id='group-booking'`);
    expect((await report("steamfoot")).rows).toEqual(data.rows);
  });
});
