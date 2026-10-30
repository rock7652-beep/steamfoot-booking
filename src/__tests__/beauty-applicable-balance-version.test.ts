import { expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const m = vi.hoisted(() => ({ raw: vi.fn() }));
vi.mock("@/lib/beauty-db", () => ({ beautyPrisma: { $queryRaw: m.raw } }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ checkPermission: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ hasStoreFeature: vi.fn() }));
vi.mock("@/server/beauty/access", () => ({ beautyManager: vi.fn() }));
import { beautyRosterVersion, type BeautyRosterContext } from "@/server/beauty/roster-read";

it("refreshes when another applicable card is purchased, held, or changes its rights; isolates stores", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "BeautyAppointment" (id text, revision int, "storeId" text, "groupId" text, "customerId" text, "cardId" text, "technicianId" text, "locationId" text, "startsAt" timestamp, status text);
      CREATE TABLE "BeautyCard" (id text, "storeId" text, name text, remaining int, "closedAt" timestamp, "expiresAt" timestamp, "memberIds" text[], "serviceIds" text[], "allowShared" boolean);
      CREATE TABLE "Customer" (id text, "storeId" text, "updatedAt" timestamp, "assignedStaffId" text);
      CREATE TABLE "BeautyTechnician" (id text, name text, "storeId" text);
      CREATE TABLE "CourseRoom" (id text, name text, "storeId" text);
      CREATE TABLE "BeautyPayment" (id text, amount int, kind text, "storeId" text, "appointmentId" text);
      CREATE TABLE "BeautyEvent" (id text, kind text, "storeId" text, "appointmentId" text);
      CREATE TABLE "Staff" (id text, "displayName" text, status text, "storeId" text);
      INSERT INTO "BeautyAppointment" VALUES ('booking',1,'store','group','ming','old','tech','room','2026-11-04','RESERVED');
      INSERT INTO "BeautyCard" VALUES ('old','store','原方案',1,null,'2090-01-01',ARRAY['ming'],ARRAY['A'],false);
    `);
    await db.exec('ALTER TABLE "BeautyCard" ADD COLUMN "chargeRuleSnapshot" jsonb, ADD COLUMN "planId" text');
    m.raw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.reduce((sql, part, i) => sql + (i ? "$" + i : "") + part, "");
      return (await db.query(sql, values)).rows;
    });
    const ctx = { a: { storeId: "store", userId: "owner" }, u: { role: "OWNER" }, customerAccess: true, cardAccess: true, financeAccess: true } as BeautyRosterContext;
    const read = () => beautyRosterVersion(ctx, { groupId: "group" });
    const before = await read();
    await db.exec(`INSERT INTO "BeautyCard" (id,"storeId",name,remaining,"closedAt","expiresAt","memberIds","serviceIds","allowShared") VALUES ('renewal','store','已續購',20,null,'2090-02-01',ARRAY['ming'],ARRAY['A'],true)`);
    const renewed = await read(); expect(renewed).not.toBe(before);
    await db.exec(`INSERT INTO "BeautyAppointment" VALUES ('hold',1,'store','other-group','family','renewal','tech','room','2026-11-05','RESERVED')`);
    const held = await read(); expect(held).not.toBe(renewed);
    await db.exec(`UPDATE "BeautyCard" SET "serviceIds"=ARRAY['B'] WHERE id='renewal'`);
    const rights = await read(); expect(rights).not.toBe(held);
    await db.exec(`INSERT INTO "BeautyCard" (id,"storeId",name,remaining,"closedAt","expiresAt","memberIds","serviceIds","allowShared") VALUES ('foreign','another-store','外店',99,null,'2090-02-01',ARRAY['ming'],ARRAY['A'],true)`);
    expect(await read()).toBe(rights);
  } finally { await db.close(); }
}, 15000);
