import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@/lib/course-db", () => ({ coursePrisma: { coursePointCard: { findMany: vi.fn() } } }));
import { PGlite } from "@electric-sql/pglite";
import { courseCardActiveExpirySql, courseNoExpiryProofs } from "@/server/queries/course-card-expiry-sql";
import { syntheticOpeningCard, syntheticOpeningRecord } from "./fixtures/music-opening";
const now = new Date("2026-10-08T00:00:00Z");
function fixture() {
  const r = syntheticOpeningRecord(); r.expiresAt = null; r.expiryVerification = { kind: "NO_EXPIRY", evidenceKey: "synthetic-proof" };
  return { ...syntheticOpeningCard(r), expiresAt: null, musicValidityDays: null };
}
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE TABLE "CoursePointCard"(id text,"storeId" text,unit text,"expiresAt" timestamptz,"musicOpeningStateRequired" bool,"musicValidityDays" int,"musicActivatedAt" timestamptz);
    CREATE TABLE "CourseMusicOpeningState"("cardId" text,"storeId" text,"customerId" text,"sourceKey" text,"contentHash" text,snapshot jsonb,"appliedBatchId" text);
    CREATE TABLE "CourseCardMember"("cardId" text,"storeId" text,"customerId" text);`);
}, 20_000);
afterAll(async () => db.close());
it("damaged hash, activation, unknown and missing source never enter SQL proofs", () => {
  const card = fixture(); expect(courseNoExpiryProofs([card], card.storeId, now)).toHaveLength(1);
  expect(courseNoExpiryProofs([{ ...card, musicOpeningState: { ...card.musicOpeningState, contentHash: "a".repeat(64) } }], card.storeId, now)).toEqual([]);
  expect(courseNoExpiryProofs([{ ...card, musicActivatedAt: new Date("2026-09-16") }], card.storeId, now)).toEqual([]);
  expect(courseNoExpiryProofs([{ ...card, musicOpeningState: null }], card.storeId, now)).toEqual([]);
  const record = syntheticOpeningRecord(); record.expiresAt = null; record.expiryVerification = { kind: "UNKNOWN" };
  expect(courseNoExpiryProofs([{ ...syntheticOpeningCard(record), expiresAt: null }], card.storeId, now)).toEqual([]);
});
it("aggregation accepts an exact verified snapshot but excludes post-validation mutations", async () => {
  const card = fixture(), row = card.musicOpeningState;
  await db.query('INSERT INTO "CoursePointCard" VALUES($1,$2,$3,NULL,true,NULL,$4)', [card.id, card.storeId, card.unit, card.musicActivatedAt]);
  await db.query('INSERT INTO "CourseCardMember" VALUES($1,$2,$3)', [card.id, card.storeId, row.customerId]);
  await db.query('INSERT INTO "CourseMusicOpeningState" VALUES($1,$2,$3,$4,$5,$6,$7)', [card.id, card.storeId, row.customerId, row.sourceKey, row.contentHash, JSON.stringify(row.snapshot), row.appliedBatchId]);
  const predicate = courseCardActiveExpirySql(now, false, courseNoExpiryProofs([card], card.storeId, now));
  const count = async () => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM "CoursePointCard" c WHERE ${predicate.text}`, predicate.values)).rows[0].n;
  expect(await count()).toBe(1);
  for (const change of [
    'UPDATE "CourseMusicOpeningState" SET "contentHash"=repeat(\'b\',64)',
    'UPDATE "CourseMusicOpeningState" SET snapshot=jsonb_set(snapshot,\'{record,sourceStudentKey}\',\'"changed"\')',
    'UPDATE "CoursePointCard" SET "musicActivatedAt"=\'2026-09-16\'',
    'UPDATE "CourseCardMember" SET "customerId"=\'different-member\'',
  ]) {
    await db.exec("BEGIN");
    try { await db.exec(change); expect(await count()).toBe(0); } finally { await db.exec("ROLLBACK"); }
  }
});
