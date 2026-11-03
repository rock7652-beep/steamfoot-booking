import {
  MusicOpeningMakeupRecord, MusicOpeningMakeupBatch,
  musicOpeningMakeupSourceKey, musicOpeningMakeupManifestHash,
} from "@/lib/music-opening-makeup";
/** Entirely synthetic; dates/IDs/expiry are not evidence about any real student. */
export function makeupRecord(patch: Partial<MusicOpeningMakeupRecord> = {}): MusicOpeningMakeupRecord {
  return {
    scope: { version: 1, targetStoreId: "synthetic-store", sourceSystem: "YINJIAOYUN", sourceTenantKey: "synthetic-tenant", timeZone: "Asia/Taipei", cutoffBusinessDate: "2026-10-01" },
    sourceEnrollmentKey: "enrollment-9", sourceLessonKey: "original-9-3", sourceStudentKey: "student-source",
    sourceTermKey: "term-9", originalTermNumber: 9, originalLessonOrdinal: 3,
    type: "STUDENT_LEAVE", sourceStatus: "OUTSTANDING", sourceDate: { value: "2026-09-01", verification: "VERIFIED" },
    mapping: { status: "VERIFIED", customerId: "synthetic-student", templateId: "synthetic-template", classType: "PRIVATE" },
    balanceTreatment: "SEPARATE_VERIFIED", expiry: { verification: "VERIFIED", value: "2026-12-31" },
    completedPair: null, nativeSourceBooking: null, sourceRevision: "revision-1", ...patch,
  };
}
export function makeupBatch(records = [makeupRecord()]): MusicOpeningMakeupBatch {
  const opening = records.filter(r => r.sourceStatus === "OUTSTANDING" && r.sourceDate.value < r.scope.cutoffBusinessDate);
  const enrollments = [...new Set(opening.map(r => r.sourceEnrollmentKey))];
  return {
    batchId: "synthetic-batch", scope: makeupRecord().scope, records,
    manifest: { status: "VERIFIED_COMPLETE", sourceManifestKey: "synthetic-manifest", sourceRevision: "revision-1",
      capturedAt: "2026-10-08T00:00:00Z", verifiedAt: "2026-10-08T00:01:00Z", validUntil: "2026-10-08T01:00:00Z",
      expectedRecordCount: records.length, sourceKeys: records.map(musicOpeningMakeupSourceKey), balanceVerification: "DISJOINT_VERIFIED",
      cutoffCoverage: enrollments.map(sourceEnrollmentKey => ({ sourceEnrollmentKey, customerId: "synthetic-student",
        expectedOutstandingAtCutoff: opening.filter(r => r.sourceEnrollmentKey === sourceEnrollmentKey).length,
        openingSourceKeys: opening.filter(r => r.sourceEnrollmentKey === sourceEnrollmentKey).map(musicOpeningMakeupSourceKey) })),
    },
  };
}
export function makeupVerification(batch: MusicOpeningMakeupBatch) {
  return { now: "2026-10-08T00:02:00Z", maxAgeMs: 900_000, sourceManifestKey: batch.manifest.sourceManifestKey,
    sourceRevision: batch.manifest.sourceRevision, manifestContentHash: musicOpeningMakeupManifestHash(batch) };
}
