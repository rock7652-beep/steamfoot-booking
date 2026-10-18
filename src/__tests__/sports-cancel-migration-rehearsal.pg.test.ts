import { afterAll, expect, it, vi } from "vitest";
vi.mock("@/server/services/course-access", () => ({ courseTransaction: vi.fn() }));
vi.mock("@/lib/feature-gate", () => ({ getStoreLimitsByStoreId: vi.fn() }));
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "../../generated/course-client";
import { reserveCourseInTransaction, settleCourseBooking, correctCourseAttendance } from "@/server/services/course-booking";
import { lockCourseStore } from "@/server/services/course-store-lock";
const expected = "postgresql://postgres@127.0.0.1:55438/sports_migration_rehearsal_20261018_test";
const enabled = process.env.SPORTS_MIGRATION_REHEARSAL_DATABASE_URL === expected;
if (process.env.SPORTS_MIGRATION_REHEARSAL_DATABASE_URL && !enabled) throw new Error("Disposable rehearsal database only");
if (enabled && (process.env.DATABASE_URL !== expected || process.env.DIRECT_URL !== expected)) throw new Error("All database URLs must point to disposable rehearsal database");
const db = enabled ? new PrismaClient({ datasourceUrl: expected }) : null;
const root = "scripts/qa/sports-migration-rehearsal/";
const up = readFileSync(root + "up.sql", "utf8"), down = readFileSync(root + "down.sql", "utf8");
const checks: string[] = [];
function record(name: string) { checks.push(name); writeFileSync("docs/verification/sports-migration-rehearsal-results.json", JSON.stringify({ database: "local disposable PostgreSQL", source: "5a0ed085", candidates: { upSha256: createHash("sha256").update(up).digest("hex"), downSha256: createHash("sha256").update(down).digest("hex") }, checks }, null, 2) + "\n"); }
function sql(source: string) { return execFileSync("docker", ["exec", "-i", "sports-staging-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sports_migration_rehearsal_20261018_test"], { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
const actor = { storeId: "sports-live-flow-store", userId: "sports-live-flow-owner", name: "演練店長" };
const transact = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) => db!.$transaction(async tx => { await lockCourseStore(tx, actor.storeId); return run(tx); });
let sequence = 0;
async function fixture(music = false, group = false, points = 1) {
 await db!.$executeRaw`DELETE FROM "StoreFeatureEntitlement" WHERE "storeId"=${actor.storeId} AND "featureKey"='business.music'`;
 if (music) await db!.$executeRaw`INSERT INTO "StoreFeatureEntitlement" (id,"storeId","featureKey",status,"updatedAt") VALUES (${randomUUID()},${actor.storeId},'business.music','ENABLED',now())`;
 const room = await db!.courseRoom.create({ data: { storeId: actor.storeId, name: "隔離演練" + randomUUID() } });
 const template = await db!.courseTemplate.create({ data: { storeId: actor.storeId, name: "隔離演練" + randomUUID(), durationMinutes: 60, pointCost: points, capacity: 4, classType: group ? "GROUP" : "PRIVATE" } });
 const unit = points === 1 ? "SESSION" : "POINT";
 const plan = await db!.coursePointPlan.create({ data: { storeId: actor.storeId, name: "演練方案" + randomUUID(), points: 10, price: 1000, validDays: 365, unit, templateIds: [template.id] } });
 const card = await db!.coursePointCard.create({ data: { storeId: actor.storeId, planId: plan.id, nameSnapshot: plan.name, unit, templateIds: [template.id], remaining: 10, expiresAt: new Date("2031-01-01"), requestKey: randomUUID() } });
 await db!.courseCardMember.create({ data: { storeId: actor.storeId, cardId: card.id, customerId: "sports-live-customer" } });
 await db!.coursePointEntry.create({ data: { storeId: actor.storeId, cardId: card.id, kind: "GRANT", points: 10, actorUserId: actor.userId } });
 const startsAt = new Date(Date.UTC(2030, 0, 11 + sequence++, 10));
 const session = await db!.courseSession.create({ data: { storeId: actor.storeId, templateId: template.id, roomId: room.id, coachId: "sports-live-flow-staff", nameSnapshot: "演練課", startsAt, endsAt: new Date(+startsAt + 3600000), pointCost: points, capacity: 4, requestKey: randomUUID(), requestIndex: 0, createdById: actor.userId } });
 const booking = await transact(tx => reserveCourseInTransaction(tx, actor, { sessionId: session.id, cardId: card.id, customerId: "sports-live-customer", requestKey: randomUUID() }, 1000));
 return { card, booking, session, plan };
}
async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
 return { card: await db!.coursePointCard.findUnique({ where: { id: f.card.id } }), booking: await db!.courseBooking.findUnique({ where: { id: f.booking.id } }), entries: await db!.coursePointEntry.findMany({ where: { cardId: f.card.id }, orderBy: { id: "asc" } }), coupons: await db!.coursePointCard.findMany({ where: { requestKey: "no-show-makeup:" + f.booking.id } }) };
}
afterAll(async () => { vi.useRealTimers(); await db?.$disconnect(); });
(enabled ? it : it.skip)("rehearses production constraint, migration, transactions and guarded rollback", async () => {
 vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2030-01-10T00:00:00Z"));
 expect(sql('SELECT to_regclass(\'public."SportsStagingSessionRule"\') IS NULL;')).toContain("t");
 const baseline = sql('SELECT md5(pg_get_expr(conbin,conrelid)) FROM pg_constraint WHERE conname=\'CoursePointEntry_values\';');
 for (const scenario of ["attendance", "private leave", "group leave", "makeup coupon"]) {
  const f = await fixture(scenario.includes("leave"), scenario === "group leave");
  await transact(tx => settleCourseBooking(tx, actor, f.booking.id, scenario.includes("leave") ? "STUDENT_LEAVE" : scenario === "makeup coupon" ? "NO_SHOW" : "ATTENDED", scenario === "makeup coupon" ? "DEDUCTED_WITH_MAKEUP" : "DEDUCTED"));
  const before = await snapshot(f);
  await expect(transact(tx => correctCourseAttendance(tx, actor, f.booking.id, "CANCELLED", scenario.includes("leave") ? "CANCELLED" : scenario === "makeup coupon" ? "NO_SHOW" : "ATTENDED"))).rejects.toThrow("CoursePointEntry_values");
  expect(await snapshot(f)).toEqual(before); record("Old constraint reproduces " + scenario + " failure; entire transaction unchanged");
 }
 const oldRows = await db!.coursePointEntry.findMany({ orderBy: { id: "asc" } });
 expect(() => sql(up.replace(/COMMIT;\s*$/, "SELECT missing_rehearsal_column; COMMIT;"))).toThrow();
 expect(sql('SELECT md5(pg_get_expr(conbin,conrelid)) FROM pg_constraint WHERE conname=\'CoursePointEntry_values\';')).toBe(baseline);
 expect(sql('SELECT to_regclass(\'public."SportsStagingSessionRule"\') IS NULL;')).toContain("t"); record("Forced DDL failure atomically restores original constraint and missing metadata table");
 sql(up);
 const installedMarker = sql(`SELECT obj_description('public."SportsStagingSessionRule"'::regclass,'pg_class');`);
 const beforeDriftRows = await db!.coursePointEntry.findMany({ orderBy: { id: "asc" } });
 const downWithinTransaction = down.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
 const refusals = [
  ["ledger CHECK replacement", 'ALTER TABLE "CoursePointEntry" DROP CONSTRAINT "CoursePointEntry_values"; ALTER TABLE "CoursePointEntry" ADD CONSTRAINT "CoursePointEntry_values" CHECK (points>0);'],
  ["metadata column addition", 'ALTER TABLE "SportsStagingSessionRule" ADD COLUMN "futureSchemaColumn" text;'],
  ["metadata index addition", 'CREATE INDEX "future_metadata_index" ON "SportsStagingSessionRule" (frequency);'],
  ["metadata RLS disabled", 'ALTER TABLE "SportsStagingSessionRule" DISABLE ROW LEVEL SECURITY;'],
  ["metadata permission change", 'GRANT SELECT ON "SportsStagingSessionRule" TO anon;'],
  ["metadata policy addition", 'CREATE POLICY "future_policy" ON "SportsStagingSessionRule" USING (true);'],
  ["missing installation marker", 'COMMENT ON TABLE "SportsStagingSessionRule" IS NULL;'],
  ["different migration version", `COMMENT ON TABLE "SportsStagingSessionRule" IS 'sports-cancel-migration-rehearsal:v2:unknown';`],
  ["recreated empty metadata table", 'DROP TABLE "SportsStagingSessionRule"; CREATE TABLE "SportsStagingSessionRule" ("futureSchemaColumn" text);'],
 ];
 for (const [name, drift] of refusals) {
  try { sql("BEGIN;\n" + drift + "\n" + downWithinTransaction); throw new Error("Expected schema drift refusal"); }
  catch (error) { expect(String((error as { stderr?: Buffer }).stderr)).toContain("Rollback schema/version drift"); }
  // Failed psql connection closes its outer transaction, preserving the installed schema and data.
  expect(sql(`SELECT obj_description('public."SportsStagingSessionRule"'::regclass,'pg_class');`)).toBe(installedMarker);
  expect(await db!.coursePointEntry.findMany({ orderBy: { id: "asc" } })).toEqual(beforeDriftRows);
  record("Rollback refuses " + name + "; original schema and ledger preserved");
 }
 const metadataSession = await db!.courseSession.findFirstOrThrow({ where: { storeId: actor.storeId } });
 const metadataInsert = `INSERT INTO "SportsStagingSessionRule" ("sessionId","storeId",frequency,enrollment,"trialPrice",payload) VALUES ('${metadataSession.id}','${actor.storeId}','WEEKLY','ASSIGNED',0,'{}');`;
 try { sql("BEGIN;\n" + metadataInsert + "\n" + downWithinTransaction); throw new Error("Expected metadata refusal"); }
 catch (error) { expect(String((error as { stderr?: Buffer }).stderr)).toContain("Metadata rows exist; preserve history"); }
 expect(sql(`SELECT obj_description('public."SportsStagingSessionRule"'::regclass,'pg_class');`)).toBe(installedMarker);
 record("Metadata-only rollback refuses before any new-format ledger exists");
 sql(down);
 expect(sql('SELECT md5(pg_get_expr(conbin,conrelid)) FROM pg_constraint WHERE conname=\'CoursePointEntry_values\';')).toBe(baseline);
 expect(await db!.coursePointEntry.findMany({ orderBy: { id: "asc" } })).toEqual(oldRows); record("Clean rollback succeeds and preserves every original ledger row");
 sql(up); expect(() => sql(up)).toThrow(); record("Repeated migration refuses constraint drift without changing installed schema");
 for (const points of [1, 2]) {
  const f = await fixture(false, false, points);
  await transact(tx => settleCourseBooking(tx, actor, f.booking.id, "ATTENDED"));
  expect((await snapshot(f)).card!.remaining).toBe(10 - points);
  const results = await Promise.allSettled([1, 2].map(() => transact(tx => correctCourseAttendance(tx, actor, f.booking.id, "CANCELLED", "ATTENDED"))));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((await snapshot(f)).card!.remaining).toBe(10);
  expect(await db!.coursePointEntry.count({ where: { bookingId: f.booking.id, kind: { startsWith: "CORRECT:" } } })).toBe(1);
  record(`${points === 1 ? "SESSION" : "POINT"}: reserve, attend, concurrent cancellation refunds exactly once`);
 }
 for (const group of [false, true]) {
  const f = await fixture(true, group);
  await transact(tx => settleCourseBooking(tx, actor, f.booking.id, "STUDENT_LEAVE"));
  expect((await snapshot(f)).card!.remaining).toBe(group ? 9 : 10);
  await transact(tx => correctCourseAttendance(tx, actor, f.booking.id, "CANCELLED", "CANCELLED"));
  expect((await snapshot(f)).card!.remaining).toBe(10);
  record(`Music ${group ? "group deducted" : "private undeducted"} leave cancellation restores correct balance`);
 }
 for (const used of [false, true]) {
  const f = await fixture();
  await transact(tx => settleCourseBooking(tx, actor, f.booking.id, "NO_SHOW", "DEDUCTED_WITH_MAKEUP"));
  const coupon = await db!.coursePointCard.findUniqueOrThrow({ where: { storeId_requestKey: { storeId: actor.storeId, requestKey: "no-show-makeup:" + f.booking.id } } });
  if (used) {
   const redemption = await db!.courseBooking.create({ data: { storeId: actor.storeId, sessionId: f.session.id, cardId: coupon.id, customerId: "sports-live-customer", customerName: "演練學員", operatorUserId: actor.userId, operatorName: actor.name, pointCost: 1, requestKey: randomUUID() } });
   await transact(tx => settleCourseBooking(tx, actor, redemption.id, "ATTENDED"));
   expect((await db!.coursePointCard.findUniqueOrThrow({ where: { id: coupon.id } })).remaining).toBe(0);
   const before = await snapshot(f);
   await expect(transact(tx => correctCourseAttendance(tx, actor, f.booking.id, "CANCELLED", "NO_SHOW"))).rejects.toThrow("補課券已使用");
   expect(await snapshot(f)).toEqual(before); record("Used makeup coupon refuses cancellation; original and coupon balances unchanged");
  } else {
   await transact(tx => correctCourseAttendance(tx, actor, f.booking.id, "CANCELLED", "NO_SHOW"));
   expect((await snapshot(f)).card!.remaining).toBe(10);
   expect(await db!.coursePointCard.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({ remaining: 0, closedAt: expect.any(Date) });
   expect(await db!.coursePointEntry.count({ where: { cardId: coupon.id, kind: "CANCEL_SOURCE:" + f.booking.id } })).toBe(1);
   await expect(transact(tx => correctCourseAttendance(tx, actor, f.booking.id, "CANCELLED", "NO_SHOW"))).rejects.toThrow();
   expect((await snapshot(f)).card!.remaining).toBe(10); record("Unused makeup coupon reclaimed and original debit refunded once; retry cannot double-refund");
  }
 }
 for (const group of [false, true]) {
  const leave = await fixture(true, group);
  await transact(tx => settleCourseBooking(tx, actor, leave.booking.id, "STUDENT_LEAVE"));
  await transact(tx => correctCourseAttendance(tx, actor, leave.booking.id, "RESERVED", "CANCELLED"));
  expect((await snapshot(leave)).booking).toMatchObject({ status: "RESERVED", absenceKind: null });
  expect((await snapshot(leave)).card!.remaining).toBe(10);
  record(`Music ${group ? "group" : "private"} leave withdrawal restores reservation and correct balance`);
 }
 const f = await fixture();
 for (const [kind, points] of [["GRANT", 0], ["GRANT", -1], ["UNKNOWN", 1], ["CANCEL_SOURCE:", 1], ["CANCEL_SOURCE:x\ny", 1], ["CORRECT:ATTENDED:CANCELLED:invalid", 1]] as const) {
  await expect(db!.coursePointEntry.create({ data: { storeId: actor.storeId, cardId: f.card.id, actorUserId: actor.userId, kind, points } })).rejects.toThrow();
 }
 record("Database rejects zero/negative points, unknown kinds, empty/control-character source IDs and malformed correction UUIDs");
 const metadata = (frequency: string, enrollment: string, price: number) => db!.$executeRaw`INSERT INTO "SportsStagingSessionRule" ("sessionId","storeId",frequency,enrollment,"trialPrice",payload) VALUES (${f.session.id},${actor.storeId},${frequency},${enrollment},${price},'{}'::jsonb)`;
 await expect(metadata("INVALID", "OPEN", 0)).rejects.toThrow(); await expect(metadata("SINGLE", "INVALID", 0)).rejects.toThrow(); await expect(metadata("SINGLE", "OPEN", -1)).rejects.toThrow();
 await expect(db!.$executeRaw`INSERT INTO "SportsStagingSessionRule" ("sessionId","storeId",frequency,enrollment,"trialPrice",payload) VALUES (${f.session.id},'other-store','WEEKLY','ASSIGNED',0,'{}'::jsonb)`).rejects.toThrow();
 await metadata("WEEKLY", "ASSIGNED", 0);
 expect(sql(`SELECT relrowsecurity AND NOT has_table_privilege('anon','"SportsStagingSessionRule"','SELECT') AND NOT has_table_privilege('authenticated','"SportsStagingSessionRule"','SELECT') FROM pg_class WHERE oid='"SportsStagingSessionRule"'::regclass;`)).toContain("t"); record("Metadata validates scheduling types, pricing and store FK; RLS enabled and client roles denied");
 const final = await snapshot(f), finalRows = await db!.coursePointEntry.findMany({ orderBy: { id: "asc" } });
 const locker = spawn("docker", ["exec", "sports-staging-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "sports_migration_rehearsal_20261018_test", "-c", 'BEGIN; LOCK TABLE "CoursePointEntry" IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(3); COMMIT;'], { stdio: "ignore" });
 const released = new Promise<void>((resolve, reject) => { locker.on("error", reject); locker.on("exit", code => code === 0 ? resolve() : reject(new Error("Lock holder failed"))); });
 await new Promise(resolve => setTimeout(resolve, 400));
 try { sql(down); throw new Error("Expected lock timeout"); } catch (error) { expect(String((error as { stderr?: Buffer }).stderr)).toContain("lock timeout"); }
 await released;
 expect(await snapshot(f)).toEqual(final); record("Contended rollback aborts at lock timeout without changing data");
 const metadataBefore = await db!.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM "SportsStagingSessionRule"`;
 try { sql('BEGIN; DELETE FROM public."SportsStagingSessionRule";\n' + downWithinTransaction); throw new Error("Expected ledger-only refusal"); }
 catch (error) { expect(String((error as { stderr?: Buffer }).stderr)).toContain("New-format ledger rows exist; preserve history"); }
 expect(await db!.$queryRaw`SELECT count(*) FROM "SportsStagingSessionRule"`).toEqual(metadataBefore);
 expect(await db!.coursePointEntry.findMany({ orderBy: { id: "asc" } })).toEqual(finalRows);
 record("New-ledger-only rollback refuses with empty metadata; all data preserved");
 expect(() => sql(down)).toThrow(); expect(await snapshot(f)).toEqual(final);
 expect(await db!.coursePointEntry.findMany({ orderBy: { id: "asc" } })).toEqual(finalRows);
 for (const row of oldRows) expect(finalRows).toContainEqual(row);
 expect(sql('SELECT convalidated FROM pg_constraint WHERE conname=\'CoursePointEntry_values\';').trim().split("\n")[2].trim()).toBe("t");
 record("Post-transaction rollback refuses without altering data; all original ledger rows preserved and expanded CHECK validated");
}, 90000);
