import { MUSIC_OPENING_SCHEMA_SQL, assertMusicOpeningSchema } from "../../scripts/music-opening-schema-check.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { makeupRecord } from "./fixtures/music-opening-makeup";
import { musicOpeningMakeupContentHash, musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey } from "@/lib/music-opening-makeup";
const priorBookingValues = readFileSync("prisma/migrations/20260925191000_course_music_absence/migration.sql", "utf8")
  .match(/ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_values" CHECK \([\s\S]*?\n\);/)?.[0];
const priorAbsenceKinds = readFileSync("prisma/migrations/20261001093000_course_teacher_absence_refund/migration.sql", "utf8")
  .match(/ALTER TABLE "CourseBooking" ADD CONSTRAINT "CourseBooking_absence_kind_check"[\s\S]*?;/)?.[0];
if (!priorBookingValues || !priorAbsenceKinds) throw new Error("Reviewed prior booking constraints missing");
const sql = readFileSync("docs/sql/music-opening-makeup-20261008.sql", "utf8");
const db = new PGlite();
let sequence = 0;
let legacyDriftRejected = false;
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE "Store"(id text PRIMARY KEY,slug text,"industryModule" text);
    CREATE TABLE "Customer"(id text PRIMARY KEY,"storeId" text NOT NULL,UNIQUE(id,"storeId"));
    CREATE TABLE "CourseTemplate"(id text PRIMARY KEY,"storeId" text NOT NULL,UNIQUE(id,"storeId"));
    CREATE TABLE "CoursePointCard"(id text PRIMARY KEY,"storeId" text,UNIQUE(id,"storeId"));
    CREATE TABLE "CourseCardMember"("cardId" text,"storeId" text,"customerId" text,PRIMARY KEY("cardId","customerId"));
    CREATE TABLE "CourseBooking"(
      id text PRIMARY KEY,"storeId" text NOT NULL,"customerId" text,"cardId" text,
      "bookingKind" text NOT NULL DEFAULT 'CARD',"pointCost" integer NOT NULL DEFAULT 1,
      "trialPrice" integer,"makeupForBookingId" text,"companionIndex" integer,
      status text NOT NULL DEFAULT 'RESERVED',"absenceKind" text,
      UNIQUE(id,"storeId"));
    CREATE TABLE "AuditLog"(id text PRIMARY KEY,action text NOT NULL);
    INSERT INTO "Store" VALUES('synthetic-store',NULL,'COURSE'),('other-store',NULL,'COURSE'),('store-lubymusic','lubymusic','COURSE');
    INSERT INTO "Customer" VALUES('synthetic-student','synthetic-store'),('other-student','synthetic-store'),('foreign-student','other-store');
    INSERT INTO "CourseTemplate" VALUES('synthetic-template','synthetic-store'),('other-template','other-store');
    INSERT INTO "CourseBooking"(id,"storeId","customerId","cardId") VALUES('native','synthetic-store','synthetic-student','native-card');`);
  await db.exec(priorBookingValues);
  await db.exec(priorAbsenceKinds);
  await db.exec(readFileSync("docs/sql/music-opening-state-draft-20261007.sql", "utf8"));
  // A validated but changed paid-card rule must abort before schema changes.
  await db.exec('ALTER TABLE "CourseBooking" DROP CONSTRAINT "CourseBooking_values"');
  await db.exec(priorBookingValues.replace('"pointCost" > 0', '"pointCost" >= 0'));
  await expect(db.exec(sql)).rejects.toThrow("differs from the reviewed original");
  await db.exec("ROLLBACK");
  expect((await db.query(`SELECT to_regclass('public."CourseMusicOpeningMakeupEntitlement"') AS target`)).rows).toEqual([{ target: null }]);
  legacyDriftRejected = true;
  await db.exec('ALTER TABLE "CourseBooking" DROP CONSTRAINT "CourseBooking_values"');
  await db.exec(priorBookingValues);
  await db.exec(sql);
});
afterAll(() => db.close());
async function insertRight(options: { id?: string; storeId?: string; customerId?: string; templateId?: string; snapshot?: unknown; sourceKey?: string; slotKey?: string; hash?: string; batch?: string; version?: number } = {}) {
  const n = ++sequence;
  const id = options.id ?? `right-${n}`;
  const snapshot = options.snapshot ?? makeupRecord({ sourceEnrollmentKey: `enrollment-${n}`, sourceLessonKey: `source-${n}` });
  const valid = makeupRecord({ sourceEnrollmentKey: `enrollment-${n}`, sourceLessonKey: `source-${n}` });
  await db.query(`INSERT INTO "CourseMusicOpeningMakeupEntitlement"(id,"storeId","customerId","templateId","sourceKey","sourceSlotKey","contentHash",snapshot,"appliedBatchId",version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, options.storeId ?? "synthetic-store", options.customerId ?? "synthetic-student", options.templateId ?? "synthetic-template",
    options.sourceKey ?? musicOpeningMakeupSourceKey(valid), options.slotKey ?? musicOpeningMakeupSourceSlotKey(valid), options.hash ?? musicOpeningMakeupContentHash(valid), JSON.stringify(snapshot), options.batch ?? "synthetic-batch", options.version ?? 0]);
  return id;
}
async function booking(right: string | null, patch: { id?: string; storeId?: string; customerId?: string | null; kind?: string; card?: string | null; pointCost?: number; status?: string; extra?: string } = {}) {
  const id = patch.id ?? `booking-${++sequence}`;
  await db.query(`INSERT INTO "CourseBooking"(id,"storeId","customerId","bookingKind","cardId","pointCost",status,"musicOpeningMakeupEntitlementId"${patch.extra ? `,${patch.extra.split("=")[0]}` : ""})
    VALUES($1,$2,$3,$4,$5,$6,$7,$8${patch.extra ? `,${patch.extra.split("=")[1]}` : ""})`,
    [id, patch.storeId ?? "synthetic-store", patch.customerId === undefined ? "synthetic-student" : patch.customerId, patch.kind ?? "OPENING_MAKEUP", patch.card ?? null, patch.pointCost ?? 0, patch.status ?? "RESERVED", right]);
  return id;
}
it("refuses existing constraint drift without applying partial schema", () => {
  expect(legacyDriftRejected).toBe(true);
});
it("both exact DDL drafts satisfy the startup catalog capability guard", async () => {
  const result = await db.query(MUSIC_OPENING_SCHEMA_SQL);
  expect(() => assertMusicOpeningSchema(result.rows)).not.toThrow();
});
it("is an isolated draft, not an automatic migration or data importer", () => {
  expect(readdirSync("prisma/migrations").some(n => n.includes("opening_makeup"))).toBe(false);
  expect(readFileSync("scripts/ci-migrate.mjs", "utf8")).not.toContain("music-opening-makeup-20261008.sql");
  const executable = sql.replace(/--[^\n]*/g, "");
  expect(executable.match(/CREATE TABLE/g)).toHaveLength(1);
  expect(executable).not.toMatch(/\bINSERT\s+INTO|\bUPDATE\s+public\.|\bDELETE\s+FROM|\bCREATE\s+TYPE|\bGRANT\b/i);
});
it("starts empty and leaves the native booking unchanged except a null link", async () => {
  expect((await db.query(`SELECT id FROM "CourseMusicOpeningMakeupEntitlement"`)).rows).toEqual([]);
  expect((await db.query(`SELECT "cardId","pointCost","bookingKind","musicOpeningMakeupEntitlementId" FROM "CourseBooking" WHERE id='native'`)).rows).toEqual([{ cardId: "native-card", pointCost: 1, bookingKind: "CARD", musicOpeningMakeupEntitlementId: null }]);
});
it("preserves all old booking branches and their paid/trial constraints", async () => {
  await booking(null, { kind: "CARD", card: "paid", pointCost: 1 });
  await booking(null, { kind: "TRIAL", extra: '"trialPrice"=1000' });
  await booking(null, { kind: "TEACHER_MAKEUP" });
  await expect(booking(null, { kind: "CARD", card: "paid", pointCost: 0 })).rejects.toThrow();
  await expect(booking(null, { kind: "TRIAL", extra: '"trialPrice"=1000001' })).rejects.toThrow();
  await expect(booking(null, { kind: "TEACHER_MAKEUP", card: "paid" })).rejects.toThrow();
});
it("enforces same-store customer and course references", async () => {
  await expect(insertRight({ customerId: "foreign-student" })).rejects.toThrow();
  await expect(insertRight({ templateId: "other-template" })).rejects.toThrow();
  await expect(insertRight({ storeId: "missing-store" })).rejects.toThrow();
});
it("enforces canonical source and slot uniqueness independently", async () => {
  await insertRight({ sourceKey: "source-unique", slotKey: "slot-unique" });
  await expect(insertRight({ sourceKey: "source-unique" })).rejects.toThrow();
  await expect(insertRight({ slotKey: "slot-unique" })).rejects.toThrow();
});
it("rejects malformed hashes, missing shapes, empty batch and negative lifecycle versions", async () => {
  for (const options of [{ hash: "not-a-sha256" }, { snapshot: {} }, { snapshot: [] }, { batch: "" }, { version: -1 }]) await expect(insertRight(options)).rejects.toThrow();
});
it("refuses no-show, completed, native, overlapping or unresolved source rows", async () => {
  for (const snapshot of [
    { ...makeupRecord(), sourceStatus: "COMPLETED" }, { ...makeupRecord(), type: "NO_SHOW" },
    { ...makeupRecord(), balanceTreatment: "OVERLAPS" },
    { ...makeupRecord(), sourceDate: { value: "2026-10-02", verification: "VERIFIED" } },
    { ...makeupRecord(), expiry: { value: null, verification: "UNVERIFIED" } },
    { ...makeupRecord(), nativeSourceBooking: { id: "fabricated" } },
    { ...makeupRecord(), mapping: { ...makeupRecord().mapping, customerId: "other-student" } },
  ]) await expect(insertRight({ snapshot })).rejects.toThrow();
});
it("enforces link back to the exact same customer and store", async () => {
  const right = await insertRight();
  await expect(booking(right, { customerId: "other-student" })).rejects.toThrow();
  await expect(booking(right, { storeId: "other-store" })).rejects.toThrow();
  await expect(booking(right, { customerId: null })).rejects.toThrow();
  await expect(booking("nonexistent")).rejects.toThrow();
});
it("accepts only dedicated cardless zero-point bookings with a mandatory source link", async () => {
  const right = await insertRight();
  for (const patch of [{ kind: "CARD" }, { kind: "TRIAL" }, { card: "paid-card" }, { pointCost: 1 }, { status: "NO_SHOW" }, { extra: '"trialPrice"=1' }, { extra: '"companionIndex"=0' }, { extra: '"makeupForBookingId"=\'old\'' }, { extra: '"musicOpeningTermKey"=\'term\'' }, { extra: '"musicOpeningLessonOrdinal"=3' }, { extra: '"musicOpeningSourceLessonKey"=\'source\'' }]) await expect(booking(right, patch)).rejects.toThrow();
  await expect(booking(null)).rejects.toThrow();
  await booking(right);
});
it("one live attempt is allowed while any number of cancelled attempts preserves history", async () => {
  const right = await insertRight(), first = await booking(right);
  await expect(booking(right)).rejects.toThrow();
  await expect(booking(right, { status: "ATTENDED" })).rejects.toThrow();
  await booking(right, { status: "CANCELLED" });
  await db.query(`UPDATE "CourseBooking" SET status='CANCELLED' WHERE id=$1`, [first]);
  await booking(right);
  await expect(db.query(`UPDATE "CourseBooking" SET status='RESERVED' WHERE id=$1`, [first])).rejects.toThrow();
});
it("forbids no-show attempt policy and incompatible absence state", async () => {
  const right = await insertRight();
  await expect(booking(right, { extra: '"absenceKind"=\'NO_SHOW\'', status: "CANCELLED" })).rejects.toThrow();
  await expect(booking(right, { extra: '"absenceKind"=\'TEACHER_ABSENT\'' })).rejects.toThrow();
  await booking(right, { extra: '"absenceKind"=\'TEACHER_ABSENT\'', status: "CANCELLED" });
});
it("source identity, payload, import metadata and creation timestamp are immutable", async () => {
  const right = await insertRight();
  for (const change of ['"sourceKey"=\'different\'', '"sourceSlotKey"=\'different\'', '"contentHash"=repeat(\'b\',64)', 'snapshot=snapshot||\'{"sourceRevision":"other"}\'::jsonb', '"appliedBatchId"=\'other\'', '"createdAt"="createdAt"+interval \'1 second\'', '"customerId"=\'other-student\'', 'id=\'renamed\'']) {
    await expect(db.query(`UPDATE "CourseMusicOpeningMakeupEntitlement" SET ${change},version=version+1 WHERE id=$1`, [right])).rejects.toThrow("immutable");
  }
  await expect(db.query(`DELETE FROM "CourseMusicOpeningMakeupEntitlement" WHERE id=$1`, [right])).rejects.toThrow("deletion");
});
it("lifecycle requires exact next version and monotonic update timestamp", async () => {
  const right = await insertRight();
  await expect(db.query(`UPDATE "CourseMusicOpeningMakeupEntitlement" SET version=2 WHERE id=$1`, [right])).rejects.toThrow("next version");
  await expect(db.query(`UPDATE "CourseMusicOpeningMakeupEntitlement" SET version=1,"updatedAt"="updatedAt"-interval '1 second' WHERE id=$1`, [right])).rejects.toThrow("next version");
  await db.query(`UPDATE "CourseMusicOpeningMakeupEntitlement" SET version=1,"updatedAt"=now() WHERE id=$1 AND version=0`, [right]);
  expect((await db.query(`SELECT version FROM "CourseMusicOpeningMakeupEntitlement" WHERE id=$1`, [right])).rows).toEqual([{ version: 1 }]);
  expect((await db.query(`UPDATE "CourseMusicOpeningMakeupEntitlement" SET version=2 WHERE id=$1 AND version=0 RETURNING id`, [right])).rows).toEqual([]);
});
it("uses invoker function with an empty search_path and denies direct client access", async () => {
  expect((await db.query(`SELECT prosecdef,proconfig FROM pg_proc WHERE proname='guard_music_opening_makeup_source'`)).rows).toEqual([{ prosecdef: false, proconfig: ['search_path=""'] }]);
  expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public."CourseMusicOpeningMakeupEntitlement"'::regclass`)).rows).toEqual([{ relrowsecurity: true }]);
  expect((await db.query(`SELECT has_table_privilege('anon','public."CourseMusicOpeningMakeupEntitlement"','SELECT') a,
    has_table_privilege('authenticated','public."CourseMusicOpeningMakeupEntitlement"','INSERT') b,
    has_function_privilege('anon','public."guard_music_opening_makeup_source"()','EXECUTE') c`)).rows).toEqual([{ a: false, b: false, c: false }]);
});
it("a failed audit rolls back booking and lifecycle version together", async () => {
  const right = await insertRight();
  await db.exec("BEGIN");
  const id = await booking(right);
  await db.query(`UPDATE "CourseMusicOpeningMakeupEntitlement" SET version=version+1 WHERE id=$1`, [right]);
  await expect(db.exec(`INSERT INTO "AuditLog"(id,action) VALUES('failing-audit',NULL)`)).rejects.toThrow();
  await db.exec("ROLLBACK");
  expect((await db.query(`SELECT id FROM "CourseBooking" WHERE id=$1`, [id])).rows).toEqual([]);
  expect((await db.query(`SELECT version FROM "CourseMusicOpeningMakeupEntitlement" WHERE id=$1`, [right])).rows).toEqual([{ version: 0 }]);
});
it("rejects accidental draft replay without altering existing schema/data", async () => {
  await expect(db.exec(sql)).rejects.toThrow("exists or is partial");
  await db.exec("ROLLBACK");
  expect((await db.query(`SELECT "cardId" FROM "CourseBooking" WHERE id='native'`)).rows).toEqual([{ cardId: "native-card" }]);
});
