import { describe, expect, it } from "vitest";
import {
  musicOpeningMakeupRecordSchema, parseMusicOpeningMakeupSnapshot, classifyMusicOpeningMakeupRecord,
  musicOpeningMakeupSourceKey, musicOpeningMakeupSourceSlotKey, musicOpeningMakeupContentHash,
  planMusicOpeningMakeupBatch, summarizeMusicOpeningMakeupRights, assertMusicOpeningMakeupTarget,
  MusicOpeningMakeupBatch, MusicOpeningMakeupRecord,
} from "@/lib/music-opening-makeup";
import { makeupRecord, makeupBatch, makeupVerification } from "./fixtures/music-opening-makeup";
const plan = (b = makeupBatch(), old: unknown = [], receipts: unknown = []) => planMusicOpeningMakeupBatch(b, old, receipts, makeupVerification(b));
function ready(b = makeupBatch()) { const p = plan(b); if (p.status !== "READY") throw new Error(p.issue); return p; }
function existing(p = ready(), version = 7) { return p.entries.map(e => ({ id: `right-${e.snapshot.originalTermNumber}`, sourceKey: e.sourceKey, sourceSlotKey: e.sourceSlotKey, contentHash: e.contentHash, snapshot: e.snapshot, version })); }
function native(): MusicOpeningMakeupRecord {
  const r = makeupRecord({ sourceEnrollmentKey: "enrollment-11", sourceTermKey: "term-11", originalTermNumber: 11,
    sourceLessonKey: "original-11-1", originalLessonOrdinal: 1, sourceDate: { value: "2026-10-02", verification: "VERIFIED" }, balanceTreatment: "NATIVE_CARD_VERIFIED" });
  r.nativeSourceBooking = { id: "real-native-source", storeId: r.scope.targetStoreId, customerId: r.mapping.customerId,
    templateId: r.mapping.templateId, cardId: "native-card", unit: "SESSION", sourceLessonKey: r.sourceLessonKey,
    status: "CANCELLED", absenceKind: "STUDENT_LEAVE", activeMakeupBookingId: null };
  return r;
}
function completed(i = 1) { return makeupRecord({ sourceEnrollmentKey: `completed-enrollment-${i}`, sourceLessonKey: `completed-source-${i}`,
  sourceStatus: "COMPLETED", completedPair: { sourceMakeupLessonKey: `actual-makeup-${i}`, attendance: "ATTENDED" } }); }
function noShow() { return makeupRecord({ sourceEnrollmentKey: "no-show-enrollment", sourceLessonKey: "no-show-source", type: "NO_SHOW", sourceStatus: "NO_SHOW" }); }
type MutableFixture = Record<string, unknown> & { sourceDate: Record<string, unknown>; mapping: Record<string, unknown>; expiry: Record<string, unknown> };
const target = { storeId: "synthetic-store", customerId: "synthetic-student", templateId: "synthetic-template", businessDate: "2026-10-15" };

describe("strict verified immutable source", () => {
  it("freezes an independent parsed source snapshot", () => { const r = makeupRecord(); const parsed = parseMusicOpeningMakeupSnapshot(r); expect(Object.isFrozen(parsed.mapping)).toBe(true); r.mapping.customerId = "changed"; expect(parsed.mapping.customerId).toBe("synthetic-student"); });
  it.each([
    ["unknown field", (r: MutableFixture) => { r.extra = true; }],
    ["nested unknown field", (r: MutableFixture) => { r.mapping.extra = true; }],
    ["unknown date", (r: MutableFixture) => { r.sourceDate.verification = "UNVERIFIED"; }],
    ["impossible date", (r: MutableFixture) => { r.sourceDate.value = "2026-02-30"; }],
    ["empty date", (r: MutableFixture) => { r.sourceDate.value = ""; }],
    ["timestamp as date", (r: MutableFixture) => { r.sourceDate.value = "2026-09-01T00:00:00Z"; }],
    ["unknown expiry", (r: MutableFixture) => { r.expiry.verification = "UNVERIFIED"; }],
    ["missing expiry", (r: MutableFixture) => { delete (r as Record<string, unknown>).expiry; }],
    ["expiry before original", (r: MutableFixture) => { r.expiry.value = "2026-08-01"; }],
    ["overlapping balance", (r: MutableFixture) => { r.balanceTreatment = "OVERLAPS"; }],
    ["unknown balance", (r: MutableFixture) => { r.balanceTreatment = "UNVERIFIED"; }],
    ["unmapped customer", (r: MutableFixture) => { r.mapping.status = "UNVERIFIED"; }],
    ["blank source key", (r: MutableFixture) => { r.sourceLessonKey = " "; }],
    ["zero ordinal", (r: MutableFixture) => { r.originalLessonOrdinal = 0; }],
    ["fraction term", (r: MutableFixture) => { r.originalTermNumber = 9.5; }],
    ["unknown absence", (r: MutableFixture) => { r.type = "ABSENCE"; }],
    ["group leave", (r: MutableFixture) => { r.mapping.classType = "GROUP"; }],
    ["prototype class name", (r: MutableFixture) => { r.mapping.classType = "INDIVIDUAL"; }],
    ["completed without attendance pair", (r: MutableFixture) => { r.sourceStatus = "COMPLETED"; }],
    ["completion pair on outstanding", (r: MutableFixture) => { r.completedPair = { sourceMakeupLessonKey: "done", attendance: "ATTENDED" }; }],
    ["no-show relabeled outstanding", (r: MutableFixture) => { r.type = "NO_SHOW"; }],
  ])("blocks %s", (_, mutate) => { const r = makeupRecord(); mutate(r); expect(musicOpeningMakeupRecordSchema.safeParse(r).success).toBe(false); });
  it("accepts explicitly verified no expiry and teacher absence on a group class", () => { const r = makeupRecord({ type: "TEACHER_ABSENT", expiry: { value: null, verification: "VERIFIED" } }); r.mapping.classType = "GROUP"; expect(parseMusicOpeningMakeupSnapshot(r)).toEqual(r); });
  it("keeps source identity independent of revised cutoff/date/reason/metadata", () => { const r = makeupRecord(), changed = makeupRecord({ sourceRevision: "r2", type: "TEACHER_ABSENT" }); changed.scope.cutoffBusinessDate = "2026-10-02"; expect(musicOpeningMakeupSourceKey(changed)).toBe(musicOpeningMakeupSourceKey(r)); expect(musicOpeningMakeupContentHash(changed)).not.toBe(musicOpeningMakeupContentHash(r)); });
  it("ignores opaque revision in hash but catches changed mapping", () => { const r = makeupRecord(); expect(musicOpeningMakeupContentHash({ ...r, sourceRevision: "r2" })).toBe(musicOpeningMakeupContentHash(r)); const changed = structuredClone(r); changed.mapping.templateId = "new"; expect(musicOpeningMakeupContentHash(changed)).not.toBe(musicOpeningMakeupContentHash(r)); });
  it("separates native post-cutoff rights and excludes historical completion/no-show", () => { expect(classifyMusicOpeningMakeupRecord(native())).toBe("POST_CUTOFF"); expect(classifyMusicOpeningMakeupRecord(completed())).toBe("EXCLUDE_COMPLETED"); expect(classifyMusicOpeningMakeupRecord(noShow())).toBe("EXCLUDE_NO_SHOW"); for (const r of [native(), completed(), noShow()]) expect(() => parseMusicOpeningMakeupSnapshot(r)).toThrow("NOT_OPENING_ENTITLEMENT"); });
  it.each(["storeId", "customerId", "templateId", "sourceLessonKey", "unit", "status", "absenceKind", "activeMakeupBookingId"])("blocks invalid native %s", field => { const r = native(); (r.nativeSourceBooking as unknown as Record<string, unknown>)[field] = "wrong"; expect(musicOpeningMakeupRecordSchema.safeParse(r).success).toBe(false); });
  it("never manufactures pre-cutoff source booking", () => { const r = native(); r.sourceDate.value = "2026-09-02"; r.balanceTreatment = "SEPARATE_VERIFIED"; expect(musicOpeningMakeupRecordSchema.safeParse(r).success).toBe(false); });
});

describe("complete fresh manifests and remembered dispositions", () => {
  it("plans 2 opening plus 1 native and zero grants from ten completed pairs or no-show", () => {
    const second = makeupRecord({ sourceEnrollmentKey: "enrollment-10", sourceLessonKey: "original-10-3", sourceTermKey: "term-10", originalTermNumber: 10 });
    const p = ready(makeupBatch([makeupRecord(), second, native(), ...Array.from({ length: 10 }, (_, i) => completed(i)), noShow()]));
    expect(p.entries).toHaveLength(2); expect(p.counts).toEqual({ openingSourceRights: 2, nativeSourceRights: 1, excludedCompleted: 10, excludedNoShow: 1 }); expect(p.receipts).toHaveLength(14);
  });
  it("replay preserves lifecycle version and does not create another right", () => { const p = ready(); const replay = plan(makeupBatch(), existing(p, 9), p.receipts); expect(replay.status).toBe("READY"); if (replay.status === "READY") expect(replay.entries[0]).toMatchObject({ action: "NO_OP", version: 9, targetEntityId: "right-9" }); });
  it("does not recreate a disappeared previously issued right", () => { const p = ready(); expect(plan(makeupBatch(), [], p.receipts)).toEqual({ status: "BLOCKED", issue: "MISSING_PREVIOUS_ENTITLEMENT" }); });
  it.each([
    ["count", (b: MusicOpeningMakeupBatch) => { b.manifest.expectedRecordCount++; }],
    ["missing source key", (b: MusicOpeningMakeupBatch) => { b.manifest.sourceKeys = []; }],
    ["different source key", (b: MusicOpeningMakeupBatch) => { b.manifest.sourceKeys = ["unknown"]; }],
    ["missing cutoff coverage", (b: MusicOpeningMakeupBatch) => { b.manifest.cutoffCoverage = []; }],
    ["cutoff count", (b: MusicOpeningMakeupBatch) => { b.manifest.cutoffCoverage[0].expectedOutstandingAtCutoff++; }],
    ["wrong cutoff customer", (b: MusicOpeningMakeupBatch) => { b.manifest.cutoffCoverage[0].customerId = "wrong"; }],
    ["duplicate cutoff mapping", (b: MusicOpeningMakeupBatch) => { b.manifest.cutoffCoverage.push(b.manifest.cutoffCoverage[0]); }],
    ["expired manifest", (b: MusicOpeningMakeupBatch) => { b.manifest.validUntil = "2026-10-08T00:02:00Z"; }],
    ["future capture", (b: MusicOpeningMakeupBatch) => { b.manifest.capturedAt = "2026-10-09T00:00:00Z"; }],
    ["future verification", (b: MusicOpeningMakeupBatch) => { b.manifest.verifiedAt = "2026-10-09T00:00:00Z"; }],
    ["stale capture", (b: MusicOpeningMakeupBatch) => { b.manifest.capturedAt = "2026-10-07T00:00:00Z"; }],
  ])("blocks %s", (_, mutate) => { const b = makeupBatch(); mutate(b); expect(plan(b).status).toBe("BLOCKED"); });
  it("requires independent manifest verification", () => { const b = makeupBatch(); const v = makeupVerification(b); v.sourceRevision = "other"; expect(planMusicOpeningMakeupBatch(b, [], [], v).status).toBe("BLOCKED"); v.sourceRevision = b.manifest.sourceRevision; v.manifestContentHash = "f".repeat(64); expect(planMusicOpeningMakeupBatch(b, [], [], v).status).toBe("BLOCKED"); });
  it("blocks renamed source ID occupying same original slot", () => { const p = ready(); const r = makeupRecord({ sourceLessonKey: "renamed" }); expect(musicOpeningMakeupSourceSlotKey(r)).toBe(p.entries[0].sourceSlotKey); expect(plan(makeupBatch([r]), existing(p), p.receipts).status).toBe("BLOCKED"); });
  it("blocks changed content and duplicate slots atomically", () => { const p = ready(); const r = makeupRecord({ type: "TEACHER_ABSENT" }); expect(plan(makeupBatch([r]), existing(p), p.receipts).status).toBe("BLOCKED"); expect(plan(makeupBatch([makeupRecord(), makeupRecord({ sourceLessonKey: "other" })])).status).toBe("BLOCKED"); });
  it.each(["completed", "no-show"])("remembers %s exclusion so lost evidence cannot mint a right", kind => { const excluded = kind === "completed" ? completed() : noShow(); const p = ready(makeupBatch([excluded])); const changed = makeupRecord({ sourceEnrollmentKey: excluded.sourceEnrollmentKey, sourceLessonKey: excluded.sourceLessonKey }); expect(plan(makeupBatch([changed]), [], p.receipts)).toEqual({ status: "BLOCKED", issue: "PREVIOUS_DISPOSITION_CHANGED_REQUIRES_REVIEW" }); });
  it.each(["completed", "no-show"])("changed cutoff cannot conceal a remembered %s disposition", kind => {
    const excluded = kind === "completed" ? completed() : noShow();
    const p = ready(makeupBatch([excluded]));
    const changed = makeupRecord({ sourceEnrollmentKey: excluded.sourceEnrollmentKey, sourceLessonKey: excluded.sourceLessonKey });
    changed.scope.cutoffBusinessDate = "2026-10-02";
    const b = makeupBatch([changed]); b.scope = changed.scope;
    expect(plan(b, [], p.receipts)).toEqual({ status: "BLOCKED", issue: "INVALID_PRIOR_RECEIPT" });
  });
  it("blocks omission of a prior exclusion and duplicate completion target", () => { const p = ready(makeupBatch([completed()])); expect(plan(makeupBatch([]), [], p.receipts).status).toBe("BLOCKED"); const a = completed(1), b = completed(2); b.completedPair = a.completedPair; expect(plan(makeupBatch([a, b])).status).toBe("BLOCKED"); });
});

describe("target and current liability projection", () => {
  it("allows a valid target and expiry boundary", () => { expect(() => assertMusicOpeningMakeupTarget(makeupRecord(), target)).not.toThrow(); expect(() => assertMusicOpeningMakeupTarget(makeupRecord(), { ...target, businessDate: "2026-12-31" })).not.toThrow(); });
  it.each(["storeId", "customerId", "templateId"])("rejects cross-scope %s", field => { expect(() => assertMusicOpeningMakeupTarget(makeupRecord(), { ...target, [field]: "wrong" })).toThrow("TARGET_SCOPE_MISMATCH"); });
  it.each(["2026-09-01", "2026-09-30", "2027-01-01", "2026-02-30"])("rejects target date %s", businessDate => { expect(() => assertMusicOpeningMakeupTarget(makeupRecord(), { ...target, businessDate })).toThrow(); });
  it("reservation and check-in stay outstanding; attendance redeems, cancellation releases", () => {
    expect(summarizeMusicOpeningMakeupRights([{ id: "a", bookings: [{ status: "RESERVED" }] }, { id: "b", bookings: [{ status: "CANCELLED" }] }, { id: "c", bookings: [{ status: "ATTENDED" }] }])).toEqual({ issued: 3, redeemed: 1, reserved: 1, outstanding: 2, unreserved: 1 });
  });
  it("blocks multiple live attempts, duplicate rights and unverified no-show policy", () => { expect(() => summarizeMusicOpeningMakeupRights([{ id: "a", bookings: [{ status: "RESERVED" }, { status: "ATTENDED" }] }])).toThrow(); expect(() => summarizeMusicOpeningMakeupRights([{ id: "a", bookings: [] }, { id: "a", bookings: [] }])).toThrow(); expect(() => summarizeMusicOpeningMakeupRights([{ id: "a", bookings: [{ status: "NO_SHOW" }] }])).toThrow(); });
});
