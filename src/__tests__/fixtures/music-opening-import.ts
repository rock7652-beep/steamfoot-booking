import type { MusicOpeningImportInput } from "@/lib/music-opening-import";
import { musicOpeningImportHash } from "@/lib/music-opening-import";
import { makeupBatch, makeupRecord } from "./music-opening-makeup";
import { syntheticOpeningRecord } from "./music-opening";

/** Invented keys, counts and dates only. These are not a real source export. */
export function importFixture(): MusicOpeningImportInput {
  const scope = { ...makeupRecord().scope, targetStoreId: "store-lubymusic", sourceTenantKey: "www.injiaoyun.com:store-lubymusic" };
  const right = makeupRecord({ scope, sourceEnrollmentKey: "synthetic-enrollment", sourceStudentKey: "synthetic-source-student",
    sourceTermKey: "synthetic-term-7", originalTermNumber: 7, originalLessonOrdinal: 2, sourceLessonKey: "synthetic-leave-2" });
  const makeup = makeupBatch([right]); makeup.scope = scope;
  const record = syntheticOpeningRecord();
  record.balance = { consumedBeforeCutoff: 1, remainingAtCutoff: 2, reservedAtCutoff: 0, unresolvedMakeupLessons: 0,
    separatedMakeup: { verification: "VERIFIED_DISJOINT", sourceLessonKeys: [right.sourceLessonKey] } };
  record.expiryVerification = { kind: "SPECIFIED", evidenceKey: "synthetic-expiry-proof" };
  record.ordinarySourceSlots = [3, 4].map(originalLessonOrdinal => ({ sourceTermKey: "synthetic-term-7", originalLessonOrdinal, sourceLessonKey: `synthetic-ordinary-${originalLessonOrdinal}` }));
  return { sourceManifestKey: "synthetic-verified-import", sourceRevision: "synthetic-r1",
    balanceAsOf: "2026-09-30T16:00:00.000Z", makeup,
    enrollments: [{ record, mapping: { verification: "VERIFIED", customerId: "synthetic-student", planId: "synthetic-plan", templateId: "synthetic-template", classType: "PRIVATE" },
      rules: { ordinaryBalance: "EXCLUDES_MAKEUP_VERIFIED", makeupExpiry: "SOURCE_VERIFIED", evidenceKey: "synthetic-rules" },
      dates: { activationVerification: "VERIFIED", activationEvidenceKey: "synthetic-activation-proof",
        raw: [{ sourceFieldKey: "synthetic-displayed-expiry", value: "2026/11/29" }, { sourceFieldKey: "synthetic-duration", value: null }] },
      expected: { kind: "ABSENT" } }],
  };
}
export function importProof(data = importFixture()) {
  return { sourceManifestKey: data.sourceManifestKey, sourceRevision: data.sourceRevision, contentHash: musicOpeningImportHash(data),
    now: "2026-10-08T00:02:00Z", maxAgeMs: 900_000 };
}
