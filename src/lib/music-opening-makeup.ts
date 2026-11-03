/**
 * Pure server-side opening make-up contract. No persistence or external effects.
 * Source identities/snapshots must never be passed to client components. A READY
 * plan is neither source verification nor permission to import real records.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

const key = z.string().min(1).max(200).refine(v => v.trim() === v, "INVALID_SOURCE_KEY");
const count = z.number().int().min(0).max(100_000);
const ordinal = count.refine(v => v > 0, "INVALID_SOURCE_SLOT");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  // Calendar validation only; this does not derive a local business date.
  return value >= "2000-01-01" && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "SOURCE_DATE_UNRESOLVED");
const instant = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
export const musicOpeningMakeupScopeSchema = z.object({
  version: z.literal(1), targetStoreId: key, sourceSystem: z.literal("YINJIAOYUN"),
  sourceTenantKey: key, timeZone: z.literal("Asia/Taipei"), cutoffBusinessDate: date,
}).strict();

export const musicOpeningMakeupRecordSchema = z.object({
  scope: musicOpeningMakeupScopeSchema,
  sourceEnrollmentKey: key, sourceLessonKey: key, sourceStudentKey: key, sourceTermKey: key,
  originalTermNumber: ordinal, originalLessonOrdinal: ordinal,
  type: z.enum(["STUDENT_LEAVE", "TEACHER_ABSENT", "NO_SHOW"]),
  sourceStatus: z.enum(["OUTSTANDING", "COMPLETED", "NO_SHOW"]),
  sourceDate: z.object({ value: date, verification: z.literal("VERIFIED") }).strict(),
  mapping: z.object({ status: z.literal("VERIFIED"), customerId: key, templateId: key,
    classType: z.enum(["PRIVATE", "SELF_ORGANIZED", "GROUP"]) }).strict(),
  balanceTreatment: z.enum(["SEPARATE_VERIFIED", "NATIVE_CARD_VERIFIED", "OVERLAPS", "UNVERIFIED"]),
  expiry: z.object({ verification: z.literal("VERIFIED"), value: date.nullable() }).strict(),
  completedPair: z.object({ sourceMakeupLessonKey: key, attendance: z.literal("ATTENDED"),
    // Optional only for legacy snapshots. New combined imports require the
    // verified completion date, independently from the original leave date.
    sourceDate: z.object({ value: date, verification: z.literal("VERIFIED") }).strict().optional(),
  }).strict().nullable(),
  nativeSourceBooking: z.object({
    id: key, storeId: key, customerId: key, templateId: key, cardId: key,
    unit: z.literal("SESSION"), sourceLessonKey: key, status: z.literal("CANCELLED"),
    absenceKind: z.literal("STUDENT_LEAVE"), activeMakeupBookingId: z.null(),
  }).strict().nullable(),
  sourceRevision: key,
}).strict().superRefine((r, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (r.expiry.value !== null && r.expiry.value < r.sourceDate.value) issue("INVALID_EXPIRY");
  if (r.type === "NO_SHOW" || r.sourceStatus === "NO_SHOW") {
    if (r.type !== "NO_SHOW" || r.sourceStatus !== "NO_SHOW" || r.completedPair || r.nativeSourceBooking) issue("NO_SHOW_CANNOT_GRANT_RIGHT");
    return;
  }
  if (r.sourceStatus === "COMPLETED") {
    if (!r.completedPair || r.nativeSourceBooking) issue("UNVERIFIED_COMPLETED_PAIR");
    if (r.completedPair?.sourceDate && r.completedPair.sourceDate.value < r.sourceDate.value) issue("COMPLETION_PRECEDES_SOURCE_LESSON");
    return;
  }
  if (r.completedPair) issue("COMPLETED_PAIR_CANNOT_BE_OUTSTANDING");
  if (r.type === "STUDENT_LEAVE" && r.mapping.classType === "GROUP") issue("GROUP_LEAVE_NOT_MAKEUP_ELIGIBLE");
  if (r.sourceDate.value < r.scope.cutoffBusinessDate) {
    if (r.nativeSourceBooking) issue("NO_FABRICATED_PRE_CUTOFF_BOOKING");
    if (r.balanceTreatment !== "SEPARATE_VERIFIED") issue("OPENING_BALANCE_OVERLAP_OR_UNKNOWN");
  } else {
    if (r.type !== "STUDENT_LEAVE") issue("NATIVE_TEACHER_MAKEUP_PATH_UNVERIFIED");
    const b = r.nativeSourceBooking;
    if (!b || b.storeId !== r.scope.targetStoreId || b.customerId !== r.mapping.customerId ||
        b.templateId !== r.mapping.templateId || b.sourceLessonKey !== r.sourceLessonKey) issue("UNMAPPED_POST_CUTOFF_MAKEUP");
    if (r.balanceTreatment !== "NATIVE_CARD_VERIFIED") issue("POST_CUTOFF_BALANCE_UNKNOWN");
  }
});
export type MusicOpeningMakeupRecord = z.infer<typeof musicOpeningMakeupRecordSchema>;
export type MusicOpeningMakeupDisposition = "OPENING" | "POST_CUTOFF" | "EXCLUDE_COMPLETED" | "EXCLUDE_NO_SHOW";
export type MusicOpeningMakeupReceipt = {
  kind: MusicOpeningMakeupDisposition; sourceKey: string; sourceSlotKey: string;
  contentHash: string; snapshot: MusicOpeningMakeupRecord;
};
export type MusicOpeningMakeupExisting = {
  id: string; sourceKey: string; sourceSlotKey: string; contentHash: string;
  snapshot: unknown; version: number;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function musicOpeningMakeupHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function assert(condition: unknown, issue: string): asserts condition {
  if (!condition) throw new Error(issue);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
export function classifyMusicOpeningMakeupRecord(input: unknown): MusicOpeningMakeupDisposition {
  const r = musicOpeningMakeupRecordSchema.parse(input);
  if (r.sourceStatus === "NO_SHOW") return "EXCLUDE_NO_SHOW";
  if (r.sourceStatus === "COMPLETED") return "EXCLUDE_COMPLETED";
  return r.sourceDate.value < r.scope.cutoffBusinessDate ? "OPENING" : "POST_CUTOFF";
}
export function parseMusicOpeningMakeupSnapshot(input: unknown): MusicOpeningMakeupRecord {
  const r = musicOpeningMakeupRecordSchema.parse(input);
  assert(classifyMusicOpeningMakeupRecord(r) === "OPENING", "NOT_OPENING_ENTITLEMENT");
  return freeze(r);
}
/** Cutoff, revision, current card, date and reason never create a new identity. */
export function musicOpeningMakeupSourceKey(input: unknown): string {
  const r = musicOpeningMakeupRecordSchema.parse(input), s = r.scope;
  return JSON.stringify([1, s.targetStoreId, s.sourceSystem, s.sourceTenantKey, "OPENING_MAKEUP_RIGHT", r.sourceEnrollmentKey, r.sourceLessonKey]);
}
export function musicOpeningMakeupSourceSlotKey(input: unknown): string {
  const r = musicOpeningMakeupRecordSchema.parse(input), s = r.scope;
  return JSON.stringify([s.targetStoreId, s.sourceSystem, s.sourceTenantKey, r.sourceEnrollmentKey, r.sourceTermKey, r.originalLessonOrdinal]);
}
export function musicOpeningMakeupContentHash(input: unknown): string {
  const { sourceRevision, ...stable } = musicOpeningMakeupRecordSchema.parse(input);
  void sourceRevision;
  return musicOpeningMakeupHash(stable);
}
const coverageSchema = z.object({
  sourceEnrollmentKey: key, customerId: key, expectedOutstandingAtCutoff: count,
  openingSourceKeys: z.array(z.string().min(1)).max(10_000),
}).strict();
export const musicOpeningMakeupBatchSchema = z.object({
  batchId: key, scope: musicOpeningMakeupScopeSchema,
  records: z.array(musicOpeningMakeupRecordSchema).max(10_000),
  manifest: z.object({
    status: z.literal("VERIFIED_COMPLETE"), sourceManifestKey: key, sourceRevision: key,
    capturedAt: instant, verifiedAt: instant, validUntil: instant,
    expectedRecordCount: count, sourceKeys: z.array(z.string().min(1)).max(10_000),
    cutoffCoverage: z.array(coverageSchema).max(10_000),
    balanceVerification: z.literal("DISJOINT_VERIFIED"),
  }).strict(),
}).strict();
export type MusicOpeningMakeupBatch = z.infer<typeof musicOpeningMakeupBatchSchema>;
/** Must come from an independently checked server adapter, never browser input. */
const verificationSchema = z.object({
  now: instant, maxAgeMs: z.number().int().min(1).max(86_400_000),
  sourceManifestKey: key, sourceRevision: key, manifestContentHash: digest,
}).strict();
export type MusicOpeningMakeupVerification = z.infer<typeof verificationSchema>;
export function musicOpeningMakeupManifestHash(input: unknown): string {
  const b = musicOpeningMakeupBatchSchema.parse(input);
  return musicOpeningMakeupHash({ scope: b.scope, manifest: {
    ...b.manifest, sourceKeys: [...b.manifest.sourceKeys].sort(),
    cutoffCoverage: b.manifest.cutoffCoverage.map(c => ({ ...c, openingSourceKeys: [...c.openingSourceKeys].sort() }))
      .sort((a, c) => a.sourceEnrollmentKey.localeCompare(c.sourceEnrollmentKey)),
  }, records: b.records.map(r => ({ sourceKey: musicOpeningMakeupSourceKey(r), contentHash: musicOpeningMakeupContentHash(r) }))
    .sort((a, c) => a.sourceKey.localeCompare(c.sourceKey)) });
}
const receiptSchema = z.object({
  kind: z.enum(["OPENING", "POST_CUTOFF", "EXCLUDE_COMPLETED", "EXCLUDE_NO_SHOW"]),
  sourceKey: z.string().min(1), sourceSlotKey: z.string().min(1), contentHash: digest,
  snapshot: musicOpeningMakeupRecordSchema,
}).strict();
const existingSchema = z.object({
  id: key, sourceKey: z.string().min(1), sourceSlotKey: z.string().min(1), contentHash: digest,
  snapshot: musicOpeningMakeupRecordSchema, version: z.number().int().min(0).max(2_147_483_647),
}).strict();
export type MusicOpeningMakeupPlan =
  | { status: "BLOCKED"; issue: string }
  | { status: "READY"; batchId: string; manifestHash: string; scope: MusicOpeningMakeupBatch["scope"];
      entries: (MusicOpeningMakeupReceipt & { action: "CREATE" | "NO_OP"; targetEntityId: string | null; version: number })[];
      receipts: MusicOpeningMakeupReceipt[]; postCutoff: MusicOpeningMakeupRecord[];
      excluded: MusicOpeningMakeupReceipt[]; cutoffCoverage: z.infer<typeof coverageSchema>[];
      counts: { openingSourceRights: number; nativeSourceRights: number; excludedCompleted: number; excludedNoShow: number } };

/** Atomic import plan. Existing versions and all exclusion receipts survive replay. */
export function planMusicOpeningMakeupBatch(input: unknown, existingInput: unknown, priorReceiptsInput: unknown, verificationInput: unknown): MusicOpeningMakeupPlan {
  try {
    const b = musicOpeningMakeupBatchSchema.parse(input), v = verificationSchema.parse(verificationInput);
    const existing = z.array(existingSchema).max(10_000).parse(existingInput);
    const priorReceipts = z.array(receiptSchema).max(10_000).parse(priorReceiptsInput);
    const m = b.manifest, now = Date.parse(v.now), captured = Date.parse(m.capturedAt), verified = Date.parse(m.verifiedAt);
    assert(m.sourceManifestKey === v.sourceManifestKey && m.sourceRevision === v.sourceRevision &&
      musicOpeningMakeupManifestHash(b) === v.manifestContentHash, "MANIFEST_VERIFICATION_MISMATCH");
    assert(captured <= verified && verified <= now && now < Date.parse(m.validUntil) && now - captured <= v.maxAgeMs,
      "MANIFEST_STALE_OR_FUTURE");
    assert(m.expectedRecordCount === b.records.length && m.sourceKeys.length === b.records.length &&
      new Set(m.sourceKeys).size === m.sourceKeys.length, "MANIFEST_INCOMPLETE");
    const expectedKeys = new Set(m.sourceKeys), scopeHash = musicOpeningMakeupHash(b.scope);
    const old = new Map<string, z.infer<typeof existingSchema>>(), oldSlots = new Map<string, string>();
    const prior = new Map<string, MusicOpeningMakeupReceipt>(), priorSlots = new Map<string, string>();
    for (const e of existing) {
      assert(musicOpeningMakeupHash(e.snapshot.scope) === scopeHash && classifyMusicOpeningMakeupRecord(e.snapshot) === "OPENING" &&
        e.sourceKey === musicOpeningMakeupSourceKey(e.snapshot) && e.sourceSlotKey === musicOpeningMakeupSourceSlotKey(e.snapshot) &&
        e.contentHash === musicOpeningMakeupContentHash(e.snapshot), "INVALID_EXISTING_ENTITLEMENT");
      assert(!old.has(e.sourceKey) && !oldSlots.has(e.sourceSlotKey), "DUPLICATE_EXISTING_ENTITLEMENT");
      old.set(e.sourceKey, e); oldSlots.set(e.sourceSlotKey, e.sourceKey);
    }
    for (const r of priorReceipts) {
      assert(musicOpeningMakeupHash(r.snapshot.scope) === scopeHash && r.kind === classifyMusicOpeningMakeupRecord(r.snapshot) &&
        r.sourceKey === musicOpeningMakeupSourceKey(r.snapshot) && r.sourceSlotKey === musicOpeningMakeupSourceSlotKey(r.snapshot) &&
        r.contentHash === musicOpeningMakeupContentHash(r.snapshot), "INVALID_PRIOR_RECEIPT");
      assert(!prior.has(r.sourceKey) && !priorSlots.has(r.sourceSlotKey), "DUPLICATE_PRIOR_RECEIPT");
      prior.set(r.sourceKey, r); priorSlots.set(r.sourceSlotKey, r.sourceKey);
    }
    const entries: Extract<MusicOpeningMakeupPlan, { status: "READY" }>["entries"] = [];
    const receipts: MusicOpeningMakeupReceipt[] = [], postCutoff: MusicOpeningMakeupRecord[] = [], excluded: MusicOpeningMakeupReceipt[] = [];
    const seen = new Set<string>(), slots = new Set<string>(), completedTargets = new Set<string>(), nativeIds = new Set<string>();
    for (const r of b.records) {
      assert(musicOpeningMakeupHash(r.scope) === scopeHash, "MIXED_SCOPE");
      const sk = musicOpeningMakeupSourceKey(r), sl = musicOpeningMakeupSourceSlotKey(r), ch = musicOpeningMakeupContentHash(r);
      const kind = classifyMusicOpeningMakeupRecord(r);
      assert(expectedKeys.has(sk) && !seen.has(sk), "MANIFEST_INCOMPLETE_OR_DUPLICATE_SOURCE");
      assert(!slots.has(sl) && (!oldSlots.has(sl) || oldSlots.get(sl) === sk), "DUPLICATE_SOURCE_SLOT");
      assert(!priorSlots.has(sl) || priorSlots.get(sl) === sk, "PRIOR_SOURCE_SLOT_RENAMED_REQUIRES_REVIEW");
      assert(!prior.has(sk) || prior.get(sk)!.contentHash === ch, "PREVIOUS_DISPOSITION_CHANGED_REQUIRES_REVIEW");
      seen.add(sk); slots.add(sl);
      const receipt = freeze({ kind, sourceKey: sk, sourceSlotKey: sl, contentHash: ch, snapshot: r });
      receipts.push(receipt);
      if (kind === "OPENING") {
        const previous = old.get(sk);
        assert(!previous || previous.contentHash === ch, "SOURCE_CONTENT_CONFLICT");
        // Receipt without its promised row is corruption, never permission to recreate a spent right.
        assert(!prior.has(sk) || previous, "MISSING_PREVIOUS_ENTITLEMENT");
        entries.push({ ...receipt, action: previous ? "NO_OP" : "CREATE", targetEntityId: previous?.id ?? null, version: previous?.version ?? 0 });
      } else {
        assert(!old.has(sk), "OPENING_HISTORY_CHANGED_REQUIRES_CORRECTION");
        if (kind === "POST_CUTOFF") {
          const id = r.nativeSourceBooking!.id;
          assert(!nativeIds.has(id), "DUPLICATE_NATIVE_SOURCE_BOOKING"); nativeIds.add(id); postCutoff.push(r);
        } else {
          if (kind === "EXCLUDE_COMPLETED") {
            const target = JSON.stringify([r.scope.sourceTenantKey, r.completedPair!.sourceMakeupLessonKey]);
            assert(!completedTargets.has(target), "DUPLICATE_COMPLETED_PAIR"); completedTargets.add(target);
          }
          excluded.push(receipt);
        }
      }
    }
    // A complete newer manifest may not silently omit already remembered source facts.
    assert([...old.keys(), ...prior.keys()].every(sk => seen.has(sk)), "MANIFEST_LOST_PRIOR_SOURCE");
    const covered = new Set<string>(), enrollmentKeys = new Set<string>();
    for (const c of m.cutoffCoverage) {
      assert(!enrollmentKeys.has(c.sourceEnrollmentKey), "DUPLICATE_CUTOFF_ENROLLMENT"); enrollmentKeys.add(c.sourceEnrollmentKey);
      assert(c.expectedOutstandingAtCutoff === c.openingSourceKeys.length, "CUTOFF_COUNT_MISMATCH");
      for (const sk of c.openingSourceKeys) {
        const e = entries.find(entry => entry.sourceKey === sk);
        assert(e && e.snapshot.sourceEnrollmentKey === c.sourceEnrollmentKey && e.snapshot.mapping.customerId === c.customerId && !covered.has(sk), "INVALID_CUTOFF_COVERAGE");
        covered.add(sk);
      }
    }
    assert(covered.size === entries.length, "INCOMPLETE_CUTOFF_COVERAGE");
    return freeze({ status: "READY", batchId: b.batchId, scope: b.scope, manifestHash: v.manifestContentHash,
      entries, receipts, postCutoff, excluded, cutoffCoverage: m.cutoffCoverage,
      counts: { openingSourceRights: entries.length, nativeSourceRights: postCutoff.length,
        excludedCompleted: excluded.filter(r => r.kind === "EXCLUDE_COMPLETED").length,
        excludedNoShow: excluded.filter(r => r.kind === "EXCLUDE_NO_SHOW").length } });
  } catch (error) {
    return { status: "BLOCKED", issue: error instanceof z.ZodError ? `INVALID_INPUT: ${error.issues.map(i => i.message).join("; ")}` : error instanceof Error ? error.message : "INVALID_INPUT" };
  }
}

export function assertMusicOpeningMakeupTarget(input: unknown, targetInput: unknown): void {
  const r = parseMusicOpeningMakeupSnapshot(input);
  const target = z.object({ storeId: key, customerId: key, templateId: key, businessDate: date }).strict().parse(targetInput);
  assert(target.storeId === r.scope.targetStoreId && target.customerId === r.mapping.customerId && target.templateId === r.mapping.templateId, "TARGET_SCOPE_MISMATCH");
  assert(target.businessDate >= r.scope.cutoffBusinessDate && target.businessDate > r.sourceDate.value, "INVALID_TARGET_DATE");
  assert(r.expiry.value === null || target.businessDate <= r.expiry.value, "EXPIRED_FOR_TARGET_DATE");
}

/** Current outstanding includes reserved attempts; a check-in is not attendance. */
export function summarizeMusicOpeningMakeupRights(rights: readonly { id: string; bookings: readonly { status: string }[] }[]) {
  const seen = new Set<string>(); let redeemed = 0, reserved = 0;
  for (const right of rights) {
    assert(!seen.has(right.id), "DUPLICATE_ENTITLEMENT"); seen.add(right.id);
    assert(right.bookings.every(b => ["RESERVED", "ATTENDED", "CANCELLED"].includes(b.status)), "UNVERIFIED_BOOKING_STATUS");
    const live = right.bookings.filter(b => b.status !== "CANCELLED");
    assert(live.length <= 1, "MULTIPLE_ACTIVE_BOOKINGS");
    if (live[0]?.status === "ATTENDED") redeemed++;
    if (live[0]?.status === "RESERVED") reserved++;
  }
  return { issued: rights.length, redeemed, reserved, outstanding: rights.length - redeemed, unreserved: rights.length - redeemed - reserved };
}
