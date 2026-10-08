import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../generated/course-client";
import { importOpeningMakeupInTransaction } from "@/server/services/music-opening-makeup-import";
import {
  classifyMusicOpeningMakeupRecord, musicOpeningMakeupContentHash,
  musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey,
  type MusicOpeningMakeupRecord, type MusicOpeningMakeupReceipt,
} from "@/lib/music-opening-makeup";
import { makeupBatch, makeupRecord, makeupVerification } from "./fixtures/music-opening-makeup";

const m = {
  raw: vi.fn(), execute: vi.fn(), stored: vi.fn(), create: vi.fn(),
  template: vi.fn(), booking: vi.fn(),
};
const tx = {
  $queryRaw: m.raw, $executeRaw: m.execute,
  courseMusicOpeningMakeupEntitlement: { findMany: m.stored, create: m.create },
  courseTemplate: { findFirst: m.template }, courseBooking: { findFirst: m.booking },
} as unknown as Prisma.TransactionClient;
const actor = { storeId: "synthetic-store", userId: "synthetic-staff", name: "Synthetic staff" };
let previous: MusicOpeningMakeupReceipt[];
function receipt(snapshot: MusicOpeningMakeupRecord): MusicOpeningMakeupReceipt {
  return { kind: classifyMusicOpeningMakeupRecord(snapshot), snapshot,
    sourceKey: musicOpeningMakeupSourceKey(snapshot), sourceSlotKey: musicOpeningMakeupSourceSlotKey(snapshot),
    contentHash: musicOpeningMakeupContentHash(snapshot) };
}
function excluded(kind: "completed" | "no-show") {
  return kind === "completed"
    ? makeupRecord({ sourceStatus: "COMPLETED", completedPair: { sourceMakeupLessonKey: "verified-completion", attendance: "ATTENDED" } })
    : makeupRecord({ sourceStatus: "NO_SHOW", type: "NO_SHOW" });
}
function run(record: MusicOpeningMakeupRecord) {
  const batch = makeupBatch([record]);
  batch.scope = record.scope;
  return importOpeningMakeupInTransaction(tx, actor, batch, makeupVerification(batch));
}
beforeEach(() => {
  vi.resetAllMocks(); previous = [];
  m.stored.mockResolvedValue([]);
  m.template.mockResolvedValue({ classType: "PRIVATE" });
  m.create.mockImplementation(async ({ data }) => ({ ...data }));
  m.raw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes('FROM "Store"')) return [{ id: actor.storeId }];
    if (sql.includes('FROM "StoreFeatureEntitlement"')) return [{ featureKey: "business.music" }];
    if (sql.includes('FROM "AuditLog"')) return previous.map(item => ({ afterJson: { receipt: item } }));
    if (sql.includes('FROM "Customer"')) return [{ id: "synthetic-student" }];
    throw new Error(`Unexpected query: ${sql}`);
  });
});
describe("importer retains the stable source namespace across cutoff changes", () => {
  for (const disposition of ["completed", "no-show"] as const) {
    it.each([
      ["changed cutoff", true, false],
      ["renamed source lesson", false, true],
      ["changed cutoff and renamed lesson", true, true],
    ] as const)(`${disposition}: %s cannot mint a previously excluded source slot`, async (_, changeCutoff, rename) => {
      const old = excluded(disposition); previous = [receipt(old)];
      const next = makeupRecord({
        sourceEnrollmentKey: old.sourceEnrollmentKey,
        sourceTermKey: old.sourceTermKey,
        sourceLessonKey: rename ? "renamed-source-lesson" : old.sourceLessonKey,
        scope: { ...old.scope, cutoffBusinessDate: changeCutoff ? "2026-10-02" : old.scope.cutoffBusinessDate },
      });
      expect(musicOpeningMakeupSourceSlotKey(next)).toBe(previous[0].sourceSlotKey);
      await expect(run(next)).rejects.toThrow(changeCutoff ? "INVALID_PRIOR_RECEIPT" : "PRIOR_SOURCE_SLOT_RENAMED_REQUIRES_REVIEW");
      expect(m.create).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
      const auditRead = m.raw.mock.calls.find(call => call[0].join("").includes('FROM "AuditLog"'))!;
      expect(auditRead[0].join("")).not.toContain('"targetId"=');
    });
    it(`${disposition}: unchanged receipt replay grants nothing and does not duplicate audit`, async () => {
      const source = excluded(disposition); previous = [receipt(source)];
      expect(await run(source)).toMatchObject({ entitlementIds: [], openingSourceRights: 0 });
      expect(m.create).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
    });
  }
  it("does not hide a persisted entitlement merely because cutoff changed", async () => {
    const source = makeupRecord(), old = receipt(source);
    m.stored.mockResolvedValue([{ id: "spent-right", sourceKey: old.sourceKey, sourceSlotKey: old.sourceSlotKey,
      contentHash: old.contentHash, snapshot: source, version: 8 }]);
    await expect(run({ ...source, scope: { ...source.scope, cutoffBusinessDate: "2026-10-02" } })).rejects.toThrow("INVALID_EXISTING_ENTITLEMENT");
    expect(m.create).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
  });
  it("keeps an unrelated source tenant separate without weakening same-tenant history", async () => {
    const old = excluded("completed"); old.scope.sourceTenantKey = "different-source-tenant"; previous = [receipt(old)];
    expect(await run(makeupRecord())).toMatchObject({ openingSourceRights: 1 });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.execute).toHaveBeenCalledTimes(1);
  });
});
