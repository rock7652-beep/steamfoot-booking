/** Verified staging contract, not a source scraper or an authorization grant.
 * Raw source observations stay separate from canonical dates and cutoff balances.
 * All fixtures must be synthetic; callers must keep this payload server-side. */
import { z } from "zod";
import { dayRange } from "./date-utils";
import { musicOpeningEnrollmentSchema, planMusicOpeningBatch, type MusicOpeningApplied } from "./music-opening-state";
import {
  musicOpeningMakeupBatchSchema, musicOpeningMakeupHash, musicOpeningMakeupManifestHash,
  planMusicOpeningMakeupBatch, classifyMusicOpeningMakeupRecord, type MusicOpeningMakeupPlan,
} from "./music-opening-makeup";

const key = z.string().min(1).max(200).refine(v => v.trim() === v);
const instant = z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v)));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const musicOpeningImportSchema = z.object({
  // The make-up batch owns the same exact source/store/cutoff scope.
  makeup: musicOpeningMakeupBatchSchema,
  balanceAsOf: instant,
  sourceManifestKey: key,
  sourceRevision: key,
  enrollments: z.array(z.object({
    record: musicOpeningEnrollmentSchema,
    mapping: z.object({ verification: z.literal("VERIFIED"), customerId: key, planId: key, templateId: key,
      classType: z.enum(["PRIVATE", "SELF_ORGANIZED", "GROUP"]) }).strict(),
    rules: z.object({ ordinaryBalance: z.enum(["UNVERIFIED", "EXCLUDES_MAKEUP_VERIFIED"]),
      makeupExpiry: z.enum(["UNVERIFIED", "SOURCE_VERIFIED"]), evidenceKey: key.nullable() }).strict(),
    dates: z.object({
      activationVerification: z.enum(["UNVERIFIED", "VERIFIED"]),
      activationEvidenceKey: key.nullable(),
      // An empty source field is a raw fact, never implicit NO_EXPIRY.
      raw: z.array(z.object({ sourceFieldKey: key, value: z.string().max(200).nullable() }).strict()).max(100),
    }).strict(),
    expected: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("ABSENT") }).strict(),
      z.object({ kind: z.literal("EXISTING"), cardId: key, contentHash: digest }).strict(),
    ]),
  }).strict()).min(1).max(100),
}).strict();
export type MusicOpeningImportInput = z.infer<typeof musicOpeningImportSchema>;
const proofSchema = z.object({
  sourceManifestKey: key, sourceRevision: key, contentHash: digest,
  now: instant, maxAgeMs: z.number().int().min(1).max(86_400_000),
}).strict();
export type MusicOpeningImportProof = z.infer<typeof proofSchema>;

/** Excludes a compare-and-swap expectation: replay can change ABSENT to EXISTING.
 * Revision, observation time and all raw evidence remain in the independently
 * verified manifest, but never replace the historical balanceAsOf. */
export function musicOpeningImportHash(input: unknown) {
  const data = musicOpeningImportSchema.parse(input);
  return musicOpeningMakeupHash({ ...data, enrollments: data.enrollments.map(({ expected: _expected, ...item }) => {
    void _expected;
    return item;
  }) });
}

type ReadyMakeup = Extract<MusicOpeningMakeupPlan, { status: "READY" }>;
export function planVerifiedMusicOpeningImport(raw: unknown, proofInput: unknown, applied: MusicOpeningApplied[] = []) {
  const hold = (issue: string) => ({ status: "HOLD" as const, issue });
  const parsed = musicOpeningImportSchema.safeParse(raw), proof = proofSchema.safeParse(proofInput);
  if (!parsed.success || !proof.success) return hold("INVALID_INPUT");
  const data = parsed.data, v = proof.data, scope = data.makeup.scope;
  if (v.sourceManifestKey !== data.sourceManifestKey || v.sourceRevision !== data.sourceRevision || v.contentHash !== musicOpeningImportHash(data)) return hold("SOURCE_PROOF_MISMATCH");
  if (Date.parse(data.balanceAsOf) !== dayRange(scope.cutoffBusinessDate).start.getTime()) return hold("BALANCE_IS_NOT_AT_CUTOFF");
  if (Date.parse(data.makeup.manifest.capturedAt) < Date.parse(data.balanceAsOf)) return hold("CUTOFF_AFTER_SOURCE_OBSERVATION");
  const makeupVerification = { now: v.now, maxAgeMs: v.maxAgeMs, sourceManifestKey: data.makeup.manifest.sourceManifestKey,
    sourceRevision: data.makeup.manifest.sourceRevision, manifestContentHash: musicOpeningMakeupManifestHash(data.makeup) };
  // No existing rows here: the service repeats this plan against locked DB rows.
  const makeup = planMusicOpeningMakeupBatch(data.makeup, [], [], makeupVerification);
  if (makeup.status !== "READY") return hold(makeup.issue);
  const ordinary = planMusicOpeningBatch({ batchId: data.makeup.batchId, scope, records: data.enrollments.map(e => e.record) }, applied);
  if (ordinary.status !== "READY") return hold(ordinary.issues.map(i => i.code).join(","));
  if (ordinary.entries.length !== data.enrollments.length) return hold("DUPLICATE_ENROLLMENT");
  if (data.makeup.manifest.cutoffCoverage.length !== data.enrollments.length) return hold("ENROLLMENT_CUTOFF_COVERAGE_UNVERIFIED");
  const covered = new Set<string>(), customers = new Map<string, string>();
  for (const item of data.enrollments) {
    const r = item.record;
    const coverage = data.makeup.manifest.cutoffCoverage.filter(c => c.sourceEnrollmentKey === r.sourceRecordKey);
    if (coverage.length !== 1 || coverage[0].customerId !== item.mapping.customerId) return hold("ENROLLMENT_CUTOFF_COVERAGE_UNVERIFIED");
    if (item.rules.ordinaryBalance !== "EXCLUDES_MAKEUP_VERIFIED" || !item.rules.evidenceKey) return hold("ORDINARY_BALANCE_RULE_UNVERIFIED");
    if (r.balance.unresolvedMakeupLessons || r.balance.reservedAtCutoff) return hold("UNRESOLVED_MAKEUP_OR_RESERVATIONS");
    if (item.dates.activationVerification !== "VERIFIED" || !item.dates.activationEvidenceKey || !r.activatedAt || !r.expiryVerification || r.expiryVerification.kind === "UNKNOWN") return hold("SOURCE_DATE_UNVERIFIED");
    // CoursePointCard.expiresAt is NOT NULL. No far-future sentinel or DDL here.
    if (r.expiryVerification.kind === "NO_EXPIRY") return hold("VERIFIED_NO_EXPIRY_TARGET_SCHEMA_UNSUPPORTED");
    const rights = makeup.entries.filter(e => e.snapshot.sourceEnrollmentKey === r.sourceRecordKey);
    const related = data.makeup.records.filter(e => e.sourceEnrollmentKey === r.sourceRecordKey);
    if (related.length && item.rules.makeupExpiry !== "SOURCE_VERIFIED") return hold("MAKEUP_EXPIRY_RULE_UNVERIFIED");
    const separate = r.balance.separatedMakeup?.sourceLessonKeys ?? [];
    if (separate.length !== rights.length || rights.some(e => !separate.includes(e.snapshot.sourceLessonKey))) return hold("SEPARATE_MAKEUP_COVERAGE_MISMATCH");
    const termSlots = new Set<string>(), lessonKeys = new Set<string>();
    if (!r.ordinarySourceSlots || r.ordinarySourceSlots.length !== r.balance.remainingAtCutoff) return hold("ORDINARY_SLOT_COVERAGE_MISMATCH");
    for (const s of r.ordinarySourceSlots) {
      const term = r.terms.find(t => t.sourceTermKey === s.sourceTermKey);
      const tuple = JSON.stringify([s.sourceTermKey, s.originalLessonOrdinal]);
      if (!term || s.originalLessonOrdinal <= term.closedBeforeCutoff || s.originalLessonOrdinal > term.totalLessons || termSlots.has(tuple) || lessonKeys.has(s.sourceLessonKey)) return hold("INVALID_ORDINARY_SOURCE_SLOT");
      termSlots.add(tuple); lessonKeys.add(s.sourceLessonKey);
    }
    for (const m of related) {
      if (m.sourceStudentKey !== r.sourceStudentKey || m.mapping.customerId !== item.mapping.customerId || m.mapping.templateId !== item.mapping.templateId || m.mapping.classType !== item.mapping.classType) return hold("MAKEUP_MAPPING_MISMATCH");
      const postCutoff = classifyMusicOpeningMakeupRecord(m) === "POST_CUTOFF";
      // Classification excludes completed/no-show before testing chronology.
      // Those later events cannot be smuggled into cutoff consumption either.
      if (m.sourceDate.value >= scope.cutoffBusinessDate && !postCutoff) return hold("POST_CUTOFF_HISTORY_REQUIRES_NATIVE_EVENT");
      if (m.sourceStatus === "COMPLETED") {
        if (!m.completedPair?.sourceDate) return hold("COMPLETION_DATE_UNVERIFIED");
        if (m.completedPair.sourceDate.value >= scope.cutoffBusinessDate) return hold("POST_CUTOFF_COMPLETION_REQUIRES_NATIVE_EVENT");
        const completedKey = m.completedPair.sourceMakeupLessonKey;
        if (r.ordinarySourceSlots.some(s => s.sourceLessonKey === completedKey) || related.some(source => source.sourceLessonKey === completedKey)) return hold("COMPLETED_PAIR_SOURCE_OVERLAP");
      }
      // A later leave may refer to credit which was ordinary at the cutoff.
      // It must already belong to this exact existing card; never create one
      // retrospectively or subtract that later event from the opening balance.
      if (postCutoff && (item.expected.kind !== "EXISTING" || m.nativeSourceBooking?.cardId !== item.expected.cardId)) return hold("POST_CUTOFF_REQUIRES_EXISTING_CARD");
      if (postCutoff && !r.ordinarySourceSlots.some(s => s.sourceLessonKey === m.sourceLessonKey && s.sourceTermKey === m.sourceTermKey && s.originalLessonOrdinal === m.originalLessonOrdinal)) return hold("POST_CUTOFF_SOURCE_NOT_IN_ORDINARY_BASELINE");
      if (!postCutoff && (lessonKeys.has(m.sourceLessonKey) || termSlots.has(JSON.stringify([m.sourceTermKey, m.originalLessonOrdinal])))) return hold("ORDINARY_MAKEUP_OVERLAP");
      const term = r.terms.find(t => t.sourceTermKey === m.sourceTermKey);
      if (!term || term.originalTermNumber !== m.originalTermNumber || m.originalLessonOrdinal > term.totalLessons) return hold("MAKEUP_TERM_MISMATCH");
      covered.add(m.sourceLessonKey + "\0" + r.sourceRecordKey);
    }
    const priorCustomer = customers.get(r.sourceStudentKey);
    if (priorCustomer && priorCustomer !== item.mapping.customerId) return hold("STUDENT_MAPPING_CONFLICT");
    customers.set(r.sourceStudentKey, item.mapping.customerId);
  }
  if (covered.size !== data.makeup.records.length) return hold("UNMAPPED_MAKEUP_ENROLLMENT");
  return { status: "READY" as const, data, ordinary, makeup: makeup as ReadyMakeup, makeupVerification };
}
