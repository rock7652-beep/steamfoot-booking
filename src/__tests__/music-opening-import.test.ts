import { describe, expect, it } from "vitest";
import { musicOpeningImportHash, planVerifiedMusicOpeningImport } from "@/lib/music-opening-import";
import { musicOpeningMakeupSourceKey } from "@/lib/music-opening-makeup";
import { planMusicOpeningBatch } from "@/lib/music-opening-state";
import { musicOpeningDateIssue, musicOpeningOperationIssue, readMusicOpeningCard, readMusicOpeningLesson } from "@/lib/music-opening-runtime";
import { syntheticOpeningCard, syntheticOpeningBooking } from "./fixtures/music-opening";
import { importFixture, importProof } from "./fixtures/music-opening-import";

describe("verified opening import contract", () => {
  it("keeps paid total, actual consumption, ordinary and makeup disjoint", () => {
    const data = importFixture(), plan = planVerifiedMusicOpeningImport(data, importProof(data));
    expect(plan.status).toBe("READY"); if (plan.status !== "READY") return;
    expect(plan.ordinary.entries[0].record).toMatchObject({ paidLessons: 4, balance: { consumedBeforeCutoff: 1, remainingAtCutoff: 2, separatedMakeup: { sourceLessonKeys: ["synthetic-leave-2"] } } });
    expect(plan.makeup.counts.openingSourceRights).toBe(1);
    expect(plan.data.enrollments[0].dates.raw).toEqual(data.enrollments[0].dates.raw);
    expect(plan.data.enrollments[0].record.expiresAt).toBe("2026-11-30T15:59:59.999Z");
  });
  it.each(["ordinaryBalance", "makeupExpiry"] as const)("requires the actual %s business rule", field => {
    const data = importFixture(); data.enrollments[0].rules[field] = "UNVERIFIED";
    expect(planVerifiedMusicOpeningImport(data, importProof(data)).status).toBe("HOLD");
  });
  it.each(["missing", "wrong-customer", "extra-enrollment"])("requires explicit per-enrollment cutoff coverage: %s", kind => {
    const d = importFixture();
    if (kind === "missing") d.makeup.manifest.cutoffCoverage = [];
    if (kind === "wrong-customer") d.makeup.manifest.cutoffCoverage[0].customerId = "wrong-customer";
    if (kind === "extra-enrollment") d.makeup.manifest.cutoffCoverage.push({ sourceEnrollmentKey: "unrelated-enrollment", customerId: "synthetic-student", expectedOutstandingAtCutoff: 0, openingSourceKeys: [] });
    expect(planVerifiedMusicOpeningImport(d, importProof(d)).status).toBe("HOLD");
  });
  it("does not interpret raw empty duration as verified no expiry", () => {
    const data = importFixture(); data.enrollments[0].record.expiresAt = null; data.enrollments[0].record.expiryVerification = { kind: "UNKNOWN" };
    expect(planVerifiedMusicOpeningImport(data, importProof(data))).toMatchObject({ status: "HOLD", issue: "SOURCE_DATE_UNVERIFIED" });
  });
  it("represents verified no expiry but refuses a fake finite ordinary-card date", () => {
    const data = importFixture(), r = data.enrollments[0].record;
    r.expiresAt = null; r.expiryVerification = { kind: "NO_EXPIRY", evidenceKey: "synthetic-no-expiry" };
    expect(planVerifiedMusicOpeningImport(data, importProof(data))).toMatchObject({ status: "HOLD", issue: "VERIFIED_NO_EXPIRY_TARGET_SCHEMA_UNSUPPORTED" });
    const card = syntheticOpeningCard(r), state = readMusicOpeningCard(card, card.storeId);
    expect(musicOpeningOperationIssue(state, card)).toContain("已核實無期限");
    expect(musicOpeningDateIssue(state, new Date("2026-10-20T02:00:00Z"))).toContain("已核實無期限");
    r.expiresAt = "2099-12-31T15:59:59.999Z";
    expect(planVerifiedMusicOpeningImport(data, importProof(data)).status).toBe("HOLD");
  });
  it.each(["activation", "proof", "latest-balance", "unresolved", "reserved", "fake-consumption", "overlap", "source-key", "missing-slot", "duplicate-slot", "separate-coverage", "mapping", "stale"])("rejects %s without granting rights", kind => {
    const data = importFixture(), item = data.enrollments[0];
    if (kind === "activation") item.dates.activationVerification = "UNVERIFIED";
    if (kind === "latest-balance") data.balanceAsOf = "2026-10-08T00:00:00Z";
    if (kind === "unresolved") item.record.balance.unresolvedMakeupLessons = 1;
    if (kind === "reserved") item.record.balance.reservedAtCutoff = 1;
    if (kind === "fake-consumption") item.record.balance.consumedBeforeCutoff = 2;
    if (kind === "overlap") item.record.ordinarySourceSlots![0].sourceLessonKey = "synthetic-leave-2";
    if (kind === "source-key") item.record.sourceStudentKey = "different-source-student";
    if (kind === "missing-slot") item.record.ordinarySourceSlots!.pop();
    if (kind === "duplicate-slot") item.record.ordinarySourceSlots![1] = item.record.ordinarySourceSlots![0];
    if (kind === "separate-coverage") item.record.balance.separatedMakeup!.sourceLessonKeys = ["different-source-key"];
    if (kind === "mapping") item.mapping.templateId = "other-template";
    const proof = importProof(data);
    if (kind === "proof") proof.contentHash = "a".repeat(64);
    if (kind === "stale") proof.now = "2026-10-09T00:02:00Z";
    expect(planVerifiedMusicOpeningImport(data, proof).status).toBe("HOLD");
  });
  it("cutoff changes cannot mint a second source identity", () => {
    const data = importFixture(), old = planVerifiedMusicOpeningImport(data, importProof(data));
    if (old.status !== "READY") throw new Error(old.issue);
    data.makeup.scope.cutoffBusinessDate = "2026-10-02";
    const next = planMusicOpeningBatch({ batchId: "next", scope: data.makeup.scope, records: [data.enrollments[0].record] }, []);
    expect(next.status).toBe("READY"); if (next.status !== "READY") return;
    expect(next.entries[0].key).toBe(old.ordinary.entries[0].key);
    expect(next.entries[0].contentHash).not.toBe(old.ordinary.entries[0].contentHash);
  });
  it("a source date equal to cutoff cannot become an opening makeup right", () => {
    const data = importFixture(), right = data.makeup.records[0];
    right.sourceDate.value = data.makeup.scope.cutoffBusinessDate;
    // No actual original booking is present: the pure schema rejects it.
    expect(() => musicOpeningImportHash(data)).toThrow();
  });
  it("later mapped leave is not reissued as opening and cannot create its missing native card", () => {
    const data = importFixture(), right = data.makeup.records[0];
    right.sourceDate.value = "2026-10-02"; right.balanceTreatment = "NATIVE_CARD_VERIFIED";
    right.nativeSourceBooking = { id: "synthetic-native-leave", cardId: "synthetic-existing-card", storeId: "store-lubymusic", customerId: right.mapping.customerId, templateId: right.mapping.templateId, unit: "SESSION", sourceLessonKey: right.sourceLessonKey, status: "CANCELLED", absenceKind: "STUDENT_LEAVE", activeMakeupBookingId: null };
    data.enrollments[0].record.balance.separatedMakeup!.sourceLessonKeys = [];
    data.enrollments[0].record.balance.remainingAtCutoff = 3;
    data.enrollments[0].record.terms[0].closedBeforeCutoff = 1;
    data.enrollments[0].record.ordinarySourceSlots!.push({ sourceTermKey: right.sourceTermKey, originalLessonOrdinal: 2, sourceLessonKey: right.sourceLessonKey });
    data.makeup.manifest.cutoffCoverage = [{ sourceEnrollmentKey: data.enrollments[0].record.sourceRecordKey, customerId: data.enrollments[0].mapping.customerId, expectedOutstandingAtCutoff: 0, openingSourceKeys: [] }]; data.makeup.manifest.sourceKeys = [musicOpeningMakeupSourceKey(right)];
    expect(planVerifiedMusicOpeningImport(data, importProof(data))).toMatchObject({ status: "HOLD", issue: "POST_CUTOFF_REQUIRES_EXISTING_CARD" });
    data.enrollments[0].expected = { kind: "EXISTING", cardId: "synthetic-existing-card", contentHash: "a".repeat(64) };
    const plan = planVerifiedMusicOpeningImport(data, importProof(data));
    expect(plan.status).toBe("READY"); if (plan.status !== "READY") return;
    expect(plan.makeup.counts).toMatchObject({ openingSourceRights: 0, nativeSourceRights: 1 });
    // A later leave cannot point into an ordinal already consumed at cutoff.
    data.enrollments[0].record.balance.remainingAtCutoff = 2;
    data.enrollments[0].record.balance.consumedBeforeCutoff = 2;
    data.enrollments[0].record.ordinarySourceSlots!.pop();
    expect(planVerifiedMusicOpeningImport(data, importProof(data))).toMatchObject({ status: "HOLD", issue: "POST_CUTOFF_SOURCE_NOT_IN_ORDINARY_BASELINE" });
  });
  it("runtime refuses a separate makeup slot masquerading as an ordinary CARD lesson", () => {
    const data = importFixture(), r = data.enrollments[0].record, right = data.makeup.records[0];
    r.terms[0].closedBeforeCutoff = 1; right.originalLessonOrdinal = 3;
    r.ordinarySourceSlots![0].originalLessonOrdinal = 2;
    const plan = planVerifiedMusicOpeningImport(data, importProof(data)); expect(plan.status).toBe("READY");
    const card = syntheticOpeningCard(r), state = readMusicOpeningCard(card, card.storeId);
    const booking = syntheticOpeningBooking();
    booking.musicOpeningSourceLessonKey = right.sourceLessonKey; booking.musicOpeningLessonOrdinal = 3;
    expect(readMusicOpeningLesson(state, booking).kind).toBe("BLOCKED");
    booking.musicOpeningSourceLessonKey = r.ordinarySourceSlots![0].sourceLessonKey; booking.musicOpeningLessonOrdinal = 2;
    expect(readMusicOpeningLesson(state, booking).kind).toBe("OPENING");
    booking.musicOpeningSourceLessonKey = "unmapped-new-key";
    expect(readMusicOpeningLesson(state, booking).kind).toBe("BLOCKED");
  });
  it.each(["COMPLETED", "NO_SHOW"] as const)("post-cutoff %s cannot become fake pre-cutoff consumption", sourceStatus => {
    const data = importFixture(), r = data.enrollments[0].record, right = data.makeup.records[0];
    right.sourceDate.value = "2026-10-02"; right.sourceStatus = sourceStatus;
    if (sourceStatus === "NO_SHOW") right.type = "NO_SHOW";
    else right.completedPair = { sourceMakeupLessonKey: "synthetic-completion", attendance: "ATTENDED" };
    r.balance.separatedMakeup!.sourceLessonKeys = []; r.balance.consumedBeforeCutoff = 2;
    data.makeup.manifest.cutoffCoverage = [{ sourceEnrollmentKey: data.enrollments[0].record.sourceRecordKey, customerId: data.enrollments[0].mapping.customerId, expectedOutstandingAtCutoff: 0, openingSourceKeys: [] }];
    expect(planVerifiedMusicOpeningImport(data, importProof(data))).toMatchObject({ status: "HOLD", issue: "POST_CUTOFF_HISTORY_REQUIRES_NATIVE_EVENT" });
  });
  it.each([null, "2026-10-01", "2026-09-30"])("uses completion date, not original leave date, to exclude a completed pair: %s", completion => {
    const data = importFixture(), r = data.enrollments[0].record, right = data.makeup.records[0];
    right.sourceStatus = "COMPLETED";
    right.completedPair = { sourceMakeupLessonKey: "synthetic-completion", attendance: "ATTENDED",
      ...(completion ? { sourceDate: { value: completion, verification: "VERIFIED" as const } } : {}) };
    r.balance.separatedMakeup!.sourceLessonKeys = []; r.balance.consumedBeforeCutoff = 2;
    data.makeup.manifest.cutoffCoverage = [{ sourceEnrollmentKey: r.sourceRecordKey, customerId: data.enrollments[0].mapping.customerId, expectedOutstandingAtCutoff: 0, openingSourceKeys: [] }];
    const plan = planVerifiedMusicOpeningImport(data, importProof(data));
    expect(plan.status).toBe(completion === "2026-09-30" ? "READY" : "HOLD");
    if (plan.status === "READY") expect(plan.makeup.counts).toMatchObject({ openingSourceRights: 0, excludedCompleted: 1 });
    else expect(plan.issue).toBe(completion ? "POST_CUTOFF_COMPLETION_REQUIRES_NATIVE_EVENT" : "COMPLETION_DATE_UNVERIFIED");
  });
  it.each(["synthetic-ordinary-3", "synthetic-leave-2"])("a completed pair cannot reuse an ordinary or original source lesson: %s", completedKey => {
    const data = importFixture(), r = data.enrollments[0].record, right = data.makeup.records[0];
    right.sourceStatus = "COMPLETED";
    right.completedPair = { sourceMakeupLessonKey: completedKey, attendance: "ATTENDED", sourceDate: { value: "2026-09-29", verification: "VERIFIED" } };
    r.balance.separatedMakeup!.sourceLessonKeys = []; r.balance.consumedBeforeCutoff = 2;
    data.makeup.manifest.cutoffCoverage = [{ sourceEnrollmentKey: r.sourceRecordKey, customerId: data.enrollments[0].mapping.customerId, expectedOutstandingAtCutoff: 0, openingSourceKeys: [] }];
    expect(planVerifiedMusicOpeningImport(data, importProof(data))).toMatchObject({ status: "HOLD", issue: "COMPLETED_PAIR_SOURCE_OVERLAP" });
  });
});
