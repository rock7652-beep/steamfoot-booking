import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";
import { importVerifiedMusicOpeningInTransaction, assertMusicOpeningImportWindow } from "@/server/services/music-opening-import";
import { importFixture, importProof } from "./fixtures/music-opening-import";
import { makeupRecord } from "./fixtures/music-opening-makeup";
import { musicOpeningMakeupSourceKey } from "@/lib/music-opening-makeup";

const actor = { storeId: "store-lubymusic", userId: "synthetic-operator", name: "Synthetic manager", role: "MANAGER" };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T00:02:00Z"));
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feat/music-opening-state-20261007");
  vi.stubEnv("VERCEL_GIT_REPO_OWNER", "rock7652-beep"); vi.stubEnv("VERCEL_GIT_REPO_SLUG", "steamfoot-booking");
  vi.stubEnv("WORKERS_CI_BRANCH", ""); vi.stubEnv("CF_PAGES_BRANCH", "");
  // Invented password, syntactically scoped URL only. No DB client is created.
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) vi.stubEnv(name, "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

type Row = Record<string, unknown>;
function setup() {
  const data = importFixture();
  const cards: Row[] = [], states: Row[] = [], rights: Row[] = [], receipts: Row[] = [];
  let corruptReadback = false, queueDelta = false, wrongCustomer = false, nullableCapability = true;
  let readCount = 0;
  const tx = {
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes("information_schema.columns")) return [{ supported: nullableCapability }];
      if (sql.includes("UNION ALL")) return ["audit-outbox", "balance", "coach", "manager", "message", "monthly"].map(kind => ({ kind, n: queueDelta && states.length ? 1 : 0 }));
      if (sql.includes('FROM "Store"')) return [{ id: actor.storeId }];
      if (sql.includes('FROM "StoreFeatureEntitlement"')) return [{ featureKey: "business.music" }];
      if (sql.includes('FROM "Customer"')) return wrongCustomer ? [] : [{ id: "synthetic-student" }];
      if (sql.includes('FROM "AuditLog"')) return receipts.filter(r => r.receipt).map(afterJson => ({ afterJson }));
      throw new Error("Unexpected query");
    }),
    $executeRaw: vi.fn(async (_parts: TemplateStringsArray, ...values: unknown[]) => { receipts.push(JSON.parse(values[5] as string)); return 1; }),
    coursePointPlan: { findFirst: vi.fn(async () => ({ name: "Synthetic plan", templateIds: ["synthetic-template"] })) },
    courseTemplate: { findFirst: vi.fn(async () => ({ classType: "PRIVATE" })) },
    coursePointCard: { create: vi.fn(async ({ data: input }: { data: Row }) => {
      const card = { ...input, members: [(input.members as { create: Row }).create] }; cards.push(card); return card;
    }) },
    courseMusicOpeningState: {
      findMany: vi.fn(async () => { readCount++; return states.map(r => ({ ...r, contentHash: corruptReadback && readCount > 1 ? "b".repeat(64) : r.contentHash, card: cards.find(c => c.id === r.cardId) })); }),
      create: vi.fn(async ({ data: input }: { data: Row }) => { const row = { ...input, id: "synthetic-state" }; states.push(row); return row; }),
    },
    courseMusicOpeningMakeupEntitlement: {
      findMany: vi.fn(async (args: { select?: Record<string, boolean> }) => args.select
        ? rights.map(r => Object.fromEntries(Object.keys(args.select!).map(k => [k, r[k]]))) : rights),
      create: vi.fn(async ({ data: input }: { data: Row }) => { const row = { ...input, version: 0 }; rights.push(row); return row; }),
    },
    courseBooking: { findFirst: vi.fn(async () => null) },
  };
  // A transactional mock only. PostgreSQL constraint tests run separately.
  const run = async (input = data, targetActor = actor) => {
    const before = structuredClone({ cards, states, rights, receipts });
    try { return await importVerifiedMusicOpeningInTransaction(tx as unknown as Prisma.TransactionClient, targetActor, input, importProof(input)); }
    catch (e) { cards.splice(0, cards.length, ...before.cards); states.splice(0, states.length, ...before.states); rights.splice(0, rights.length, ...before.rights); receipts.splice(0, receipts.length, ...before.receipts); throw e; }
  };
  return { data, tx, cards, states, rights, receipts, run, corrupt: () => { corruptReadback = true; }, queue: () => { queueDelta = true; }, wrongCustomer: () => { wrongCustomer = true; }, oldSchema: () => { nullableCapability = false; } };
}
describe("isolated verified ordinary + makeup importer", () => {
  it("materializes explicit no-expiry as null and replays without resetting rights", async () => {
    const f = setup(); f.data.enrollments[0].record.expiresAt = null;
    f.data.enrollments[0].record.expiryVerification = { kind: "NO_EXPIRY", evidenceKey: "synthetic-no-expiry-proof" };
    expect(await f.run()).toMatchObject({ status: "IMPORTED", created: 1 });
    expect(f.cards[0]).toMatchObject({ expiresAt: null, musicValidityDays: null });
    expect(await f.run()).toMatchObject({ created: 0, skipped: 1 });
  });
  it("old NOT NULL target holds no-expiry before any mutation", async () => {
    const f = setup(); f.data.enrollments[0].record.expiresAt = null;
    f.data.enrollments[0].record.expiryVerification = { kind: "NO_EXPIRY", evidenceKey: "synthetic-no-expiry-proof" };
    f.oldSchema();
    expect(await f.run()).toEqual({ status: "HOLD", issue: "VERIFIED_NO_EXPIRY_TARGET_SCHEMA_UNSUPPORTED" });
    expect(f.cards).toEqual([]); expect(f.rights).toEqual([]); expect(f.receipts).toEqual([]);
    expect(f.tx.coursePointCard.create).not.toHaveBeenCalled();
  });
  it("atomically projects 2 ordinary and 1 independent makeup with no fake debit/payment/booking", async () => {
    const f = setup(); expect(await f.run()).toMatchObject({ status: "IMPORTED", created: 1, skipped: 0, updated: 0, makeup: { openingSourceRights: 1 } });
    expect(f.cards).toHaveLength(1); expect(f.cards[0]).toMatchObject({ remaining: 2, musicOpeningStateRequired: true, musicValidityDays: null });
    expect(f.rights).toHaveLength(1); expect(f.tx.courseBooking.findFirst).not.toHaveBeenCalled();
    expect(f.states[0]).toMatchObject({ teacherFeePolicy: "UNVERIFIED", snapshot: { record: { balance: { consumedBeforeCutoff: 1 } } } });
    expect(f.tx.courseMusicOpeningState.findMany).toHaveBeenCalledTimes(2);
    expect(f.receipts.find(r => r.dates)).toMatchObject({ balanceAsOf: "2026-09-30T16:00:00.000Z", observedAt: "2026-10-08T00:00:00Z", dates: f.data.enrollments[0].dates });
    expect(f.tx.$queryRaw.mock.calls.filter(c => c[0].join("").includes("UNION ALL"))).toHaveLength(2);
    // Only the two established audit inserts are allowed raw writes.
    expect(f.tx.$executeRaw.mock.calls.every(c => c[0].join("").startsWith('INSERT INTO "AuditLog"'))).toBe(true);
  });
  it("identical ABSENT retry skips both entities and all duplicate audit", async () => {
    const f = setup(); await f.run(); const before = structuredClone({ cards: f.cards, states: f.states, rights: f.rights, receipts: f.receipts });
    expect(await f.run()).toMatchObject({ created: 0, skipped: 1, makeup: { created: 0, skipped: 1 } });
    expect({ cards: f.cards, states: f.states, rights: f.rights, receipts: f.receipts }).toEqual(before);
    expect(f.tx.coursePointCard.create).toHaveBeenCalledOnce(); expect(f.tx.courseMusicOpeningMakeupEntitlement.create).toHaveBeenCalledOnce();
  });
  it("replay does not refill spent ordinary balance or reset makeup version", async () => {
    const f = setup(); await f.run(); f.cards[0].remaining = 1; f.rights[0].version = 5;
    f.data.enrollments[0].record.sourceRevision = "new-observation-same-content";
    expect(await f.run()).toMatchObject({ created: 0, skipped: 1 });
    expect(f.cards[0].remaining).toBe(1); expect(f.rights[0].version).toBe(5);
  });
  it("A then unrelated B small batches preserve both histories; B replay skips", async () => {
    const f = setup(); await f.run();
    const prior = structuredClone(f.rights[0]);
    const b = importFixture(), r = b.enrollments[0].record;
    r.sourceRecordKey = "synthetic-enrollment-B";
    b.makeup.records[0].sourceEnrollmentKey = r.sourceRecordKey;
    b.makeup.manifest.sourceKeys = [musicOpeningMakeupSourceKey(b.makeup.records[0])];
    b.makeup.manifest.cutoffCoverage[0].sourceEnrollmentKey = r.sourceRecordKey;
    b.makeup.manifest.cutoffCoverage[0].openingSourceKeys = b.makeup.manifest.sourceKeys;
    expect(await f.run(b)).toMatchObject({ created: 1, makeup: { created: 1 } });
    expect(await f.run(b)).toMatchObject({ created: 0, skipped: 1, makeup: { created: 0, skipped: 1 } });
    expect(f.cards).toHaveLength(2); expect(f.rights).toHaveLength(2); expect(f.rights[0]).toEqual(prior);
  });
  it("scoped replay cannot omit a previous right for the same enrollment", async () => {
    const f = setup(); await f.run();
    // Keep the original ordinary state unchanged. An empty source manifest
    // cannot erase that record's separate makeup coverage.
    f.data.makeup.records = []; f.data.makeup.manifest.sourceKeys = []; f.data.makeup.manifest.expectedRecordCount = 0;
    f.data.makeup.manifest.cutoffCoverage[0].expectedOutstandingAtCutoff = 0; f.data.makeup.manifest.cutoffCoverage[0].openingSourceKeys = [];
    expect(await f.run()).toMatchObject({ status: "HOLD" }); expect(f.rights).toHaveLength(1); expect(f.cards).toHaveLength(1);
  });
  it.each(["cas", "content", "mapping", "cutoff"])("rejects changed %s instead of rewriting existing rights", async kind => {
    const f = setup(); await f.run(); const before = structuredClone(f.cards);
    if (kind === "cas") f.data.enrollments[0].expected = { kind: "EXISTING", cardId: String(f.cards[0].id), contentHash: "b".repeat(64) };
    if (kind === "content") f.data.enrollments[0].record.originalUnitPrice = 999;
    if (kind === "mapping") f.data.enrollments[0].mapping.planId = "different-plan";
    if (kind === "cutoff") {
      f.data.makeup.scope.cutoffBusinessDate = "2026-10-02";
      f.data.makeup.records[0].scope.cutoffBusinessDate = "2026-10-02"; f.data.balanceAsOf = "2026-10-01T16:00:00Z";
    }
    await expect(f.run()).rejects.toThrow(); expect(f.cards).toEqual(before); expect(f.tx.coursePointCard.create).toHaveBeenCalledOnce();
  });
  it.each(["readback", "notification"])("%s mismatch rolls back all staged rows", async kind => {
    const f = setup(); if (kind === "readback") f.corrupt(); else f.queue();
    await expect(f.run()).rejects.toThrow(kind === "readback" ? "READBACK" : "NOTIFICATION");
    expect(f.cards).toEqual([]); expect(f.states).toEqual([]); expect(f.rights).toEqual([]); expect(f.receipts).toEqual([]);
  });
  it("requires exact existing source-student marker; never merges by name", async () => {
    const f = setup(); f.wrongCustomer(); await expect(f.run()).rejects.toThrow("MAPPING");
    expect(f.tx.coursePointCard.create).not.toHaveBeenCalled(); expect(f.rights).toEqual([]);
  });
  it.each(["production", "other-db", "other-branch", "other-store", "member"])("refuses %s before any target query", async kind => {
    const f = setup(); let target = actor;
    if (kind === "production") vi.stubEnv("VERCEL_ENV", "production");
    if (kind === "other-db") vi.stubEnv("DIRECT_URL", "postgresql://postgres:synthetic@db.other.supabase.co/postgres");
    if (kind === "other-branch") vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    if (kind === "other-store") target = { ...actor, storeId: "different-store" };
    if (kind === "member") target = { ...actor, role: "CUSTOMER" };
    await expect(f.run(f.data, target)).rejects.toThrow(); expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it("unknown source dates/rules hold before target queries", async () => {
    const f = setup(); f.data.enrollments[0].rules.ordinaryBalance = "UNVERIFIED";
    expect(await f.run()).toMatchObject({ status: "HOLD", issue: "ORDINARY_BALANCE_RULE_UNVERIFIED" }); expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it("cannot create a post-cutoff entitlement by mislabelling the original date", async () => {
    const f = setup(); f.data.makeup.records[0].sourceDate.value = "2026-10-01";
    await expect(f.run()).rejects.toThrow(); expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it.each([false, true])("later leave verifies actual source triple (matching=%s) without issuing another opening right", async matching => {
    const f = setup(), d = f.data, item = d.enrollments[0];
    d.makeup.records = []; d.makeup.manifest.sourceKeys = []; d.makeup.manifest.expectedRecordCount = 0; d.makeup.manifest.cutoffCoverage = [{ sourceEnrollmentKey: item.record.sourceRecordKey, customerId: item.mapping.customerId, expectedOutstandingAtCutoff: 0, openingSourceKeys: [] }];
    item.record.balance.separatedMakeup!.sourceLessonKeys = []; item.record.balance.consumedBeforeCutoff = 2;
    await f.run();
    item.expected = { kind: "EXISTING", cardId: String(f.cards[0].id), contentHash: String(f.states[0].contentHash) };
    const source = makeupRecord({ scope: d.makeup.scope, sourceEnrollmentKey: item.record.sourceRecordKey,
      sourceStudentKey: item.record.sourceStudentKey, sourceTermKey: "synthetic-term-7", originalTermNumber: 7, originalLessonOrdinal: 3,
      sourceLessonKey: "synthetic-ordinary-3", sourceDate: { verification: "VERIFIED", value: "2026-10-02" }, balanceTreatment: "NATIVE_CARD_VERIFIED",
      nativeSourceBooking: { id: "synthetic-native-original", cardId: String(f.cards[0].id), storeId: actor.storeId,
        customerId: item.mapping.customerId, templateId: item.mapping.templateId, unit: "SESSION", sourceLessonKey: "synthetic-ordinary-3",
        status: "CANCELLED", absenceKind: "STUDENT_LEAVE", activeMakeupBookingId: null } });
    d.makeup.records = [source]; d.makeup.manifest.sourceKeys = [musicOpeningMakeupSourceKey(source)]; d.makeup.manifest.expectedRecordCount = 1;
    f.tx.courseBooking.findFirst.mockImplementation(async (...args: unknown[]) => {
      const query = args[0] as { where: { id?: string }; select?: unknown };
      if (!query.where.id) return null;
      return { musicOpeningSourceLessonKey: matching ? source.sourceLessonKey : "wrong-source", musicOpeningTermKey: source.sourceTermKey,
        musicOpeningLessonOrdinal: 3, card: { unit: "SESSION" }, session: { templateId: item.mapping.templateId, startsAt: new Date("2026-10-02T02:00:00Z") } } as never;
    });
    if (matching) expect(await f.run()).toMatchObject({ created: 0, skipped: 1, makeup: { created: 0, openingSourceRights: 0, nativeSourceRights: 1 } });
    else await expect(f.run()).rejects.toThrow("POST_CUTOFF_SOURCE_LINK_MISMATCH");
    expect(f.cards).toHaveLength(1); expect(f.rights).toHaveLength(0); expect(f.tx.coursePointCard.create).toHaveBeenCalledOnce();
  });
  it("does not start a batch within a minute of opening", async () => {
    const f = setup(); vi.setSystemTime(new Date("2026-10-10T00:29:01Z"));
    await expect(f.run()).rejects.toThrow("BUSINESS_HOURS"); expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it("crossing opening time during final readback rolls back before returning success", async () => {
    const f = setup(), original = f.tx.$queryRaw.getMockImplementation()!;
    f.tx.$queryRaw.mockImplementation(async parts => {
      const rows = await original(parts);
      if (parts.join("").includes("UNION ALL") && f.states.length) vi.setSystemTime(new Date("2026-10-10T00:30:00Z"));
      return rows;
    });
    await expect(f.run()).rejects.toThrow("BUSINESS_HOURS"); expect(f.cards).toEqual([]); expect(f.rights).toEqual([]);
  });
  it.each([
    ["2026-10-10T00:29:59Z", false], ["2026-10-10T00:30:00Z", true], ["2026-10-10T13:30:00Z", false],
    ["2026-10-09T05:29:59Z", false], ["2026-10-09T05:30:00Z", true], ["2026-10-09T14:30:00Z", false],
    ["2026-10-11T05:30:00Z", false],
  ])("Taipei business-hour boundary %s (blocked=%s)", (date, blocked) => {
    if (blocked) expect(() => assertMusicOpeningImportWindow(new Date(date))).toThrow("BUSINESS_HOURS");
    else expect(() => assertMusicOpeningImportWindow(new Date(date))).not.toThrow();
  });
});
