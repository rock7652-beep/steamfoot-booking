import { describe, expect, it } from "vitest";
import {
  musicOpeningKey,
  planMusicOpeningBatch,
  projectMusicOpeningLesson,
  type MusicOpeningApplied,
  type MusicOpeningEnrollment,
  type MusicOpeningPlan,
  type MusicOpeningScope,
} from "@/lib/music-opening-state";

// Every identifier and amount below is synthetic. No production records or DB clients.
const scope: MusicOpeningScope = {
  version: 1,
  targetStoreId: "synthetic-target-store",
  sourceSystem: "YINJIAOYUN",
  sourceTenantKey: "synthetic-source-tenant",
  timeZone: "Asia/Taipei",
  cutoffBusinessDate: "2026-10-01",
};
function enrollment(): MusicOpeningEnrollment {
  return {
    entityKind: "MUSIC_ENROLLMENT", sourceRecordKey: "enrollment-A", sourceRevision: "opaque-v1",
    sourceStudentKey: "student-A", sourcePlanKey: "plan-A", paidLessons: 4, giftLessons: 0,
    terms: [{ sourceTermKey: "term-7", originalTermNumber: 7, totalLessons: 4, closedBeforeCutoff: 2 }],
    balance: { consumedBeforeCutoff: 2, remainingAtCutoff: 2, reservedAtCutoff: 1, unresolvedMakeupLessons: 0 },
    originalUnitPrice: 800, activatedAt: "2026-09-15T02:00:00.000Z", expiresAt: "2026-11-30T15:59:59.999Z",
    tuition: { currency: "TWD", originalListPrice: 3200, agreedTuition: 2800, paidBeforeCutoff: 2000, receivableAtCutoff: 800 },
  };
}
function inventory() {
  return {
    entityKind: "INVENTORY_POSITION", sourceRecordKey: "stock-A", sourceRevision: "opaque-stock-v1",
    sourceProductKey: "product-A", sourceLocationKey: "location-A", sourceLotKey: null,
    currency: "TWD", onHandQuantity: 12, reservedQuantity: 2, unitCost: "100.125000",
  };
}
function batch(records: unknown[] = [enrollment()], batchId = "batch-A", inputScope: unknown = scope) {
  return { batchId, scope: inputScope, records };
}
function ready(plan: MusicOpeningPlan) {
  expect(plan.status).toBe("READY");
  if (plan.status !== "READY") throw new Error(JSON.stringify(plan.issues));
  return plan;
}
function applied(plan: MusicOpeningPlan): MusicOpeningApplied[] {
  const result = ready(plan);
  return result.entries.map((entry, index) => ({
    scope: result.scope,
    identity: { entityKind: entry.record.entityKind, sourceRecordKey: entry.record.sourceRecordKey },
    contentHash: entry.contentHash, targetEntityId: `synthetic-target-${index}`,
    appliedBatchId: result.batchId, sourceRevision: entry.record.sourceRevision,
  }));
}
function blocked(plan: MusicOpeningPlan, code?: string) {
  expect(plan.status).toBe("BLOCKED");
  expect(plan).not.toHaveProperty("entries");
  if (plan.status !== "BLOCKED") throw new Error("Expected a fully blocked plan");
  if (code) expect(plan.issues.some((issue) => issue.code === code)).toBe(true);
}
const lesson = { sourceTermKey: "term-7", originalLessonOrdinal: 3, occurredAt: "2026-10-01T00:00:00+08:00" };

function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

describe("dedicated opening state, without business-event side effects", () => {
  it("preserves original term 7 / lesson 3, original price, validity, and opening tuition", () => {
    const result = projectMusicOpeningLesson(scope, enrollment(), lesson);
    expect(result).toEqual({
      originalTermNumber: 7, originalLessonOrdinal: 3, originalTermLessonCount: 4,
      originalUnitPrice: 800, activatedAt: "2026-09-15T02:00:00.000Z", expiresAt: "2026-11-30T15:59:59.999Z",
      openingRemainingLessons: 2, openingReservedLessons: 1, openingAvailableLessons: 1,
      openingPaid: 2000, openingReceivable: 800,
    });
  });
  it("never treats closed ordinals as attendance or assumes they equal consumed credit", () => {
    const record = enrollment();
    record.balance = { consumedBeforeCutoff: 1, remainingAtCutoff: 3, reservedAtCutoff: 1, unresolvedMakeupLessons: 1 };
    expect(projectMusicOpeningLesson(scope, record, lesson).originalLessonOrdinal).toBe(3);
    expect(ready(planMusicOpeningBatch(batch([record]), [])).entries[0].record).toEqual(record);
  });
  it("requires explicit original ordinal rather than re-numbering after reordering or a backfill", () => {
    const fourth = { ...lesson, originalLessonOrdinal: 4, occurredAt: "2026-10-15T02:00:00.000Z" };
    expect(projectMusicOpeningLesson(scope, enrollment(), fourth).originalLessonOrdinal).toBe(4);
    expect(projectMusicOpeningLesson(scope, enrollment(), lesson).originalLessonOrdinal).toBe(3);
    const { originalLessonOrdinal: _ordinal, ...missingOrdinal } = lesson;
    void _ordinal;
    expect(() => projectMusicOpeningLesson(scope, enrollment(), missingOrdinal)).toThrow();
  });
  it("repeating after a hypothetical attendance restoration never resets dates or consumes credit", () => {
    const record = enrollment(); const input = batch([record]); freeze(input);
    const before = JSON.stringify(input);
    const first = projectMusicOpeningLesson(scope, record, lesson);
    for (let i = 0; i < 3; i++) {
      expect(projectMusicOpeningLesson(scope, record, lesson)).toEqual(first);
      ready(planMusicOpeningBatch(input, []));
    }
    expect(JSON.stringify(input)).toBe(before);
    // This is NOT a test of the existing course-booking service, which is unchanged.
  });
  it("preserves unknown original price and dates without a current-price or 2099 fallback", () => {
    const record = { ...enrollment(), originalUnitPrice: null, activatedAt: null, expiresAt: null };
    const result = projectMusicOpeningLesson(scope, record, lesson);
    expect(result.originalUnitPrice).toBeNull(); expect(result.activatedAt).toBeNull(); expect(result.expiresAt).toBeNull();
  });
  it("represents paid and receivable as opening state, not a newly confirmed purchase", () => {
    const result = ready(planMusicOpeningBatch(batch(), []));
    expect(result.entries[0].record).toHaveProperty("tuition.paidBeforeCutoff", 2000);
    for (const field of ["attendance", "receipts", "cashbookEntries", "payroll", "stockMovements", "purchase"]) {
      expect(result).not.toHaveProperty(field);
    }
  });
  it("keeps inventory quantity and exact six-decimal cost as state only", () => {
    const record = inventory();
    const entry = ready(planMusicOpeningBatch(batch([record]), [])).entries[0];
    expect(entry.record).toEqual(record); expect(entry.action).toBe("CREATE");
    expect(entry.record).not.toHaveProperty("movement");
    expect(ready(planMusicOpeningBatch(batch([{ ...record, unitCost: null }]), [])).entries[0].record).toHaveProperty("unitCost", null);
  });
  it("does not conflate paid and gift lessons when original term snapshots include gifts", () => {
    const record = enrollment(); record.giftLessons = 1;
    record.terms[0].totalLessons = 5; record.balance.remainingAtCutoff = 3;
    expect(projectMusicOpeningLesson(scope, record, lesson).originalTermLessonCount).toBe(5);
    expect(projectMusicOpeningLesson(scope, record, lesson).originalUnitPrice).toBe(800);
  });
});

describe("Taipei cutoff and explicit source lesson validation", () => {
  it.each(["2026-09-30T16:00:00.000Z", "2026-10-01T00:00:00+08:00"])("includes exact cutoff %s", (occurredAt) => {
    expect(projectMusicOpeningLesson(scope, enrollment(), { ...lesson, occurredAt }).originalLessonOrdinal).toBe(3);
  });
  it("rejects the preceding millisecond rather than using extraction date", () => {
    expect(() => projectMusicOpeningLesson(scope, enrollment(), { ...lesson, occurredAt: "2026-09-30T15:59:59.999Z" })).toThrow("Pre-cutoff");
  });
  it.each(["2026-10-01T00:00:00", "2026-02-30T00:00:00Z", "garbage", "2026-09-15T02:00:00+99:99", "2026-09-15T02:00:00+14:99", "2026-09-15T02:00:00.000123Z", "9999-12-31T23:00:00-02:00", "0000-01-01T00:00:00+01:00"])("rejects ambiguous or impossible timestamp %s", (occurredAt) => {
    expect(() => projectMusicOpeningLesson(scope, enrollment(), { ...lesson, occurredAt })).toThrow();
  });
  it.each(["2026-02-30", "2026-13-01", "2026-2-01", "2025-02-29", "x", ""])("rejects invalid business date %s", (cutoffBusinessDate) => {
    blocked(planMusicOpeningBatch(batch([enrollment()], "batch-A", { ...scope, cutoffBusinessDate }), []), "INVALID_INPUT");
  });
  it("accepts an actual leap-day cutoff with earlier original activation", () => {
    const record = { ...enrollment(), activatedAt: null };
    ready(planMusicOpeningBatch(batch([record], "batch-A", { ...scope, cutoffBusinessDate: "2024-02-29" }), []));
  });
  it.each(["2026-09-15T02:00:00+99:99", "2026-09-15T02:00:00+14:99", "2026-09-15T02:00:00.000123Z", "9999-12-31T23:00:00-02:00", "0000-01-01T00:00:00+01:00"])("blocks malformed or precision-losing opening timestamps %s without throwing", (activatedAt) => {
    blocked(planMusicOpeningBatch(batch([{ ...enrollment(), activatedAt }]), []), "INVALID_INPUT");
  });
  it.each(["2026-09-30T16:00:00.000Z", "2026-10-03T02:00:00.000Z"])("does not classify activation on or after cutoff as opening %s", (activatedAt) => {
    blocked(planMusicOpeningBatch(batch([{ ...enrollment(), activatedAt }]), []), "INVALID_INPUT");
  });
  it.each([1, 2, 5, 0, 1.5])("rejects closed/out-of-range/invalid ordinal %s", (originalLessonOrdinal) => {
    expect(() => projectMusicOpeningLesson(scope, enrollment(), { ...lesson, originalLessonOrdinal })).toThrow();
  });
  it("rejects another term and rejects projecting inventory as a lesson", () => {
    expect(() => projectMusicOpeningLesson(scope, enrollment(), { ...lesson, sourceTermKey: "unknown" })).toThrow();
    expect(() => projectMusicOpeningLesson(scope, inventory(), lesson)).toThrow("Expected a music enrollment");
  });
});

describe("identity, idempotency, interrupted reruns and conflict blocking", () => {
  it("same input in same or new batch is a no-op after applied mapping", () => {
    const first = planMusicOpeningBatch(batch(), []); const ledger = applied(first); freeze(ledger);
    for (const batchId of ["batch-A", "batch-B"]) {
      const rerun = ready(planMusicOpeningBatch(batch([enrollment()], batchId), ledger));
      expect(rerun.entries).toHaveLength(1); expect(rerun.entries[0].action).toBe("NO_OP");
      expect(rerun.entries[0].targetEntityId).toBe("synthetic-target-0");
    }
  });
  it("different opaque revision with identical state remains a no-op", () => {
    const ledger = applied(planMusicOpeningBatch(batch(), []));
    const changedRevision = { ...enrollment(), sourceRevision: "revision-unordered-xyz" };
    expect(ready(planMusicOpeningBatch(batch([changedRevision]), ledger)).entries[0].action).toBe("NO_OP");
  });
  it("deduplicates identical records within one batch", () => {
    const record = enrollment();
    expect(ready(planMusicOpeningBatch(batch([record, record]), [])).entries).toHaveLength(1);
  });
  it("only proposes missing states when recovering an interrupted batch", () => {
    const records = [enrollment(), inventory()];
    const ledger = applied(planMusicOpeningBatch(batch([records[0]]), []));
    const rerun = ready(planMusicOpeningBatch(batch(records), ledger));
    expect(rerun.entries.map((entry) => entry.action)).toEqual(["NO_OP", "CREATE"]);
    // Persisting either item, and DB atomicity, are deliberately outside this test.
  });
  it.each([
    (r: MusicOpeningEnrollment) => { r.originalUnitPrice = 900; },
    (r: MusicOpeningEnrollment) => { r.terms[0].closedBeforeCutoff = 1; },
    (r: MusicOpeningEnrollment) => { r.expiresAt = "2026-12-15T15:59:59.999Z"; },
    (r: MusicOpeningEnrollment) => { r.tuition.paidBeforeCutoff = 2100; r.tuition.receivableAtCutoff = 700; },
  ])("blocks changed source state even if other records are valid", (change) => {
    const ledger = applied(planMusicOpeningBatch(batch(), [])); const modified = enrollment(); change(modified);
    blocked(planMusicOpeningBatch(batch([inventory(), modified], "batch-B"), ledger), "SOURCE_CONFLICT");
  });
  it("blocks inconsistent duplicate records even without an existing mapping", () => {
    blocked(planMusicOpeningBatch(batch([enrollment(), { ...enrollment(), originalUnitPrice: 900 }]), []), "DUPLICATE_SOURCE");
  });
  it("canonicalizes property and term order without changing original term numbers", () => {
    const record = enrollment(); record.paidLessons = 8; record.balance.remainingAtCutoff = 6;
    record.terms.push({ sourceTermKey: "term-8", originalTermNumber: 8, totalLessons: 4, closedBeforeCutoff: 0 });
    const ledger = applied(planMusicOpeningBatch(batch([record]), []));
    const reversed = Object.fromEntries(Object.entries(record).reverse()); reversed.terms = [...record.terms].reverse();
    expect(ready(planMusicOpeningBatch(batch([reversed]), ledger)).entries[0].action).toBe("NO_OP");
  });
  it("canonicalizes equivalent timezone offsets and exact decimal representations", () => {
    const first = [enrollment(), { ...inventory(), unitCost: "100.1" }];
    const ledger = applied(planMusicOpeningBatch(batch(first), []));
    const second = [{ ...enrollment(), activatedAt: "2026-09-15T10:00:00+08:00" }, { ...inventory(), unitCost: "100.100000" }];
    expect(ready(planMusicOpeningBatch(batch(second), ledger)).entries.map((e) => e.action)).toEqual(["NO_OP", "NO_OP"]);
  });
  it("isolates store, source tenant and entity type, with collision-safe key boundaries", () => {
    const identity = { entityKind: "MUSIC_ENROLLMENT", sourceRecordKey: "source|id" };
    const original = musicOpeningKey(scope, identity);
    const variants = [
      musicOpeningKey({ ...scope, targetStoreId: "other-store" }, identity),
      musicOpeningKey({ ...scope, sourceTenantKey: "other-tenant" }, identity),
      musicOpeningKey(scope, { ...identity, entityKind: "INVENTORY_POSITION" }),
      musicOpeningKey(scope, { ...identity, sourceRecordKey: "source" }),
      musicOpeningKey({ ...scope, sourceTenantKey: `${scope.sourceTenantKey}|source` }, { ...identity, sourceRecordKey: "id" }),
    ];
    expect(new Set([original, ...variants]).size).toBe(6);
    expect(() => musicOpeningKey({ ...scope, sourceSystem: "UNVERIFIED" }, identity)).toThrow();
  });
  it("does not add the batch or cutoff to identity to evade an existing state", () => {
    const identity = { entityKind: "MUSIC_ENROLLMENT", sourceRecordKey: "enrollment-A" };
    expect(musicOpeningKey(scope, identity)).toBe(musicOpeningKey({ ...scope, cutoffBusinessDate: "2026-11-01" }, identity));
    const ledger = applied(planMusicOpeningBatch(batch(), []));
    blocked(planMusicOpeningBatch(batch([enrollment()], "new-batch", { ...scope, cutoffBusinessDate: "2026-11-01" }), ledger), "SCOPE_MISMATCH");
  });
  it.each(["targetStoreId", "sourceTenantKey"])("rejects a ledger from a different %s", (field) => {
    const ledger = applied(planMusicOpeningBatch(batch(), []));
    ledger[0].scope = { ...scope, [field]: "different" };
    blocked(planMusicOpeningBatch(batch(), ledger), "SCOPE_MISMATCH");
  });
  it("rejects duplicate mappings and multiple source keys bound to the same target", () => {
    const ledger = applied(planMusicOpeningBatch(batch(), []));
    blocked(planMusicOpeningBatch(batch(), [ledger[0], ledger[0]]), "LEDGER_CONFLICT");
    blocked(planMusicOpeningBatch(batch(), [ledger[0], { ...ledger[0], identity: { ...ledger[0].identity, sourceRecordKey: "second-source" } }]), "LEDGER_CONFLICT");
  });
  it("rejects a malformed ledger instead of treating it as empty", () => {
    for (const ledger of [null, {}, [null], [{ contentHash: "broken" }]]) blocked(planMusicOpeningBatch(batch(), ledger), "INVALID_INPUT");
  });
  it("rerunning inventory cannot reapply opening stock and changed stock is a conflict", () => {
    const ledger = applied(planMusicOpeningBatch(batch([inventory()]), []));
    expect(ready(planMusicOpeningBatch(batch([inventory()]), ledger)).entries[0].action).toBe("NO_OP");
    blocked(planMusicOpeningBatch(batch([{ ...inventory(), onHandQuantity: 13 }]), ledger), "SOURCE_CONFLICT");
  });
});

describe("strict, bounded input validation", () => {
  it.each([
    (r: MusicOpeningEnrollment) => { r.paidLessons = -1; },
    (r: MusicOpeningEnrollment) => { r.paidLessons = Number.MAX_SAFE_INTEGER; },
    (r: MusicOpeningEnrollment) => { r.giftLessons = NaN; },
    (r: MusicOpeningEnrollment) => { r.terms[0].totalLessons = 3; },
    (r: MusicOpeningEnrollment) => { r.terms[0].closedBeforeCutoff = 5; },
    (r: MusicOpeningEnrollment) => { r.terms.push({ ...r.terms[0] }); },
    (r: MusicOpeningEnrollment) => { r.balance.remainingAtCutoff = 3; },
    (r: MusicOpeningEnrollment) => { r.balance.reservedAtCutoff = 3; },
    (r: MusicOpeningEnrollment) => { r.originalUnitPrice = 1.5; },
    (r: MusicOpeningEnrollment) => { r.expiresAt = "2026-09-01T00:00:00.000Z"; },
    (r: MusicOpeningEnrollment) => { r.tuition.receivableAtCutoff = 900; },
    (r: MusicOpeningEnrollment) => { r.tuition.paidBeforeCutoff = 3000; },
    (r: MusicOpeningEnrollment) => { r.tuition.agreedTuition = 3500; r.tuition.receivableAtCutoff = 1500; },
    (r: MusicOpeningEnrollment) => { r.sourceRecordKey = " "; },
  ])("blocks invalid enrollment instead of guessing corrected values", (change) => {
    const record = enrollment(); change(record);
    blocked(planMusicOpeningBatch(batch([record]), []), "INVALID_INPUT");
  });
  it.each([
    { onHandQuantity: -1 }, { onHandQuantity: 0.5 }, { reservedQuantity: 13 },
    { unitCost: -1 }, { unitCost: "1.1234567" }, { unitCost: "1000000000000" },
  ])("blocks invalid inventory %j", (patch) => {
    blocked(planMusicOpeningBatch(batch([{ ...inventory(), ...patch }]), []), "INVALID_INPUT");
  });
  it("rejects unknown transaction/attendance fields rather than silently dropping them", () => {
    for (const field of ["attendance", "cashbookEntry", "payroll", "stockMovement"]) {
      blocked(planMusicOpeningBatch(batch([{ ...enrollment(), [field]: {} }]), []), "INVALID_INPUT");
    }
  });
  it("rejects missing required values and unsupported version/timezone", () => {
    blocked(planMusicOpeningBatch(batch([{}]), []), "INVALID_INPUT");
    blocked(planMusicOpeningBatch(batch([], "batch-A"), []), "INVALID_INPUT");
    for (const patch of [{ version: 2 }, { timeZone: "UTC" }]) blocked(planMusicOpeningBatch(batch([enrollment()], "batch-A", { ...scope, ...patch }), []), "INVALID_INPUT");
  });
});
