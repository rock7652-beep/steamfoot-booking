import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { resolveBookingConcurrencyTestDatabaseUrl } from "./helpers/booking-concurrency-test-db";

const state = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db", () => ({ prisma: new Proxy({}, { get: (_target, key) => {
  if (!state.db) throw new Error("Explicit local test database required");
  const value = Reflect.get(state.db, key);
  return typeof value === "function" ? value.bind(state.db) : value;
} }) }));
// This service is called after the action verifies the store's LINE token.
// Only that identity boundary is mocked; all business reads/writes are real PG.
vi.mock("@/server/services/verified-line-customer", () => ({ resolveVerifiedLineCustomer: async () => null }));
import { onboardCourseLineMember } from "@/server/services/course-line-onboarding";

const url = resolveBookingConcurrencyTestDatabaseUrl(process.env);
const schema = `single_first_login_${randomUUID().replaceAll("-", "")}`;
const scoped = url ? new URL(url) : null;
scoped?.searchParams.set("schema", schema);
const db = scoped ? new PrismaClient({ datasourceUrl: scoped.toString() }) : null;
const tables = ["Store", "User", "Account", "Customer", "CustomerIdentityLink", "AuditLog"];
const input = { storeId: "store", lineUserId: "U" + "a".repeat(32), name: "原學員", phone: "0990000301", lineName: "LINE暱稱" };

(url ? describe : describe.skip)("single course first activation — isolated PostgreSQL", () => {
  beforeAll(async () => {
    state.db = db;
    await db!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const ddl = execFileSync("node_modules/.bin/prisma", ["migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma", "--script"], { encoding: "utf8" });
    for (const sql of ddl.replace(/^--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean)) {
      const table = sql.match(/^(?:CREATE TABLE|ALTER TABLE) "([^"]+)"/)?.[1] ?? sql.match(/^CREATE (?:UNIQUE )?INDEX .*? ON "([^"]+)"/)?.[1];
      const referenced = sql.match(/REFERENCES "([^"]+)"/)?.[1];
      if (sql.startsWith("CREATE TYPE") || (table && tables.includes(table) && (!referenced || tables.includes(referenced)))) await db!.$executeRawUnsafe(sql);
    }
  }, 60000);
  beforeEach(async () => {
    await db!.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t}"`).join(",")} CASCADE`);
    await db!.store.create({ data: { id: "store", name: "合成課程店", slug: "synthetic-first-login", industryModule: "COURSE" } });
    await db!.customer.create({ data: { id: "learner", storeId: "store", name: input.name, phone: input.phone } });
  });
  afterAll(async () => {
    if (db) { await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.$disconnect(); }
    state.db = null;
  });

  it.each(["line", "line-provider:901"])("activates the original learner atomically for %s", async identityProvider => {
    const before = await db!.customer.findUniqueOrThrow({ where: { id: "learner" } });
    expect(await onboardCourseLineMember({ ...input, identityProvider })).toEqual({ status: "ok" });
    const after = await db!.customer.findUniqueOrThrow({ where: { id: "learner" } });
    expect(await db!.customer.count()).toBe(1);
    expect(after).toMatchObject({ name: before.name, phone: before.phone, customerStage: before.customerStage, userId: expect.any(String) });
    expect(await db!.account.count()).toBe(1); expect(await db!.customerIdentityLink.count()).toBe(1);
    expect(await db!.auditLog.count({ where: { action: "FIRST_LINE_LOGIN_NAME_PHONE_MATCH", targetId: "learner" } })).toBe(1);
    expect(after.lineUserId).toBe(identityProvider === "line" ? input.lineUserId : null);
  });
  it("preserves a shared-contact phone group without creating any identity", async () => {
    await db!.customer.create({ data: { id: "sibling", storeId: "store", name: "另一學員", phone: "", contactPhone: input.phone } });
    expect(await onboardCourseLineMember(input)).toEqual({ status: "identity_review_required" });
    expect(await db!.user.count()).toBe(0); expect(await db!.account.count()).toBe(0);
  });
  it("does not activate a mismatched name", async () => {
    expect(await onboardCourseLineMember({ ...input, name: "其他人" })).toEqual({ status: "identity_review_required" });
    expect(await db!.user.count()).toBe(0);
  });
  it("serializes competing LINE identities so only one can activate the learner", async () => {
    const results = await Promise.all([onboardCourseLineMember(input), onboardCourseLineMember({ ...input, lineUserId: "U" + "b".repeat(32) })]);
    expect(results.filter(r => r.status === "ok")).toHaveLength(1);
    expect(await db!.user.count()).toBe(1); expect(await db!.account.count()).toBe(1);
    expect(await db!.customerIdentityLink.count()).toBe(1); expect(await db!.auditLog.count()).toBe(1);
  });
  it("rolls back every identity write when the audit cannot commit", async () => {
    await db!.$executeRawUnsafe(`CREATE FUNCTION reject_first_login_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`);
    await db!.$executeRawUnsafe(`CREATE TRIGGER reject_first_login BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_first_login_audit()`);
    try {
      expect(await onboardCourseLineMember(input)).toEqual({ status: "service_unavailable" });
      expect(await db!.user.count()).toBe(0); expect(await db!.account.count()).toBe(0);
      expect(await db!.customerIdentityLink.count()).toBe(0);
      expect((await db!.customer.findUniqueOrThrow({ where: { id: "learner" } })).userId).toBeNull();
    } finally {
      await db!.$executeRawUnsafe(`DROP TRIGGER reject_first_login ON "AuditLog"`);
      await db!.$executeRawUnsafe(`DROP FUNCTION reject_first_login_audit()`);
    }
  });
});
