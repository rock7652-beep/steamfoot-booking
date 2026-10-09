/** Offline/import-core contract only. No database client, HTTP, delivery or trial service. */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { payloadSchema, sanitizeConsultationPayload, type ConsultationPayload } from "./consultation-lead";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const isoSchema = z.string().refine(value => {
  try { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value; }
  catch { return false; }
}, "Canonical UTC millisecond timestamp required");
const candidateSchema = z.object({
  classification: z.literal("real_candidate_pending_root_review"),
  sourceRow: z.number().int().min(2).max(2147483647),
  originalRequestId: z.string().uuid(), rawRowSha256: hashSchema,
  sourceSubmissionFingerprint: hashSchema,
  sourceDate: z.object({ createdAt: isoSchema, serial: z.number().finite(), timezone: z.literal("Etc/GMT") }),
  // This reviewed batch has no historical contact activity to reconstruct.
  originalStatus: z.literal("待聯繫"), mappedStatus: z.literal("NEW"),
  originalFollowUpNote: z.literal(""), originalNotificationStatus: z.string(),
  canonicalHqPayload: payloadSchema, canonicalHqPayloadHash: hashSchema,
  phoneImport: z.object({ observedText: z.string(), normalizedText: z.string(), altered: z.literal(false) }),
  warnings: z.array(z.string()),
});
const manifestSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("PRIVATE_READ_ONLY_AUDIT_NOT_AN_IMPORT"),
  spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
  sourceSheetId: z.number().int().min(1).max(2147483647), snapshotSha256: hashSchema,
  totals: z.object({ summaryMirrorRows: z.number().int().min(0) }).optional(),
  rows: z.array(z.object({ classification: z.string() }).passthrough()),
});
type Candidate = z.infer<typeof candidateSchema>;
export type LegacyTarget = { environment: "production" | "preview"; projectId: string; database: "postgres"; schema: "public" };
export type LegacyApproval = {
  target: LegacyTarget; manifestSha256: string; snapshotSha256: string;
  requestIds: string[]; expectedCandidates: number;
};
export type LegacySourceObservation = {
  spreadsheetId: string; sheetId: number; timezone: string;
  rows: { sourceRow: number; formattedValues: string[]; dateSerial: number; cellNotes: string[] }[];
};
export type LegacyProvenance = {
  sourceKind: "GOOGLE_SHEETS"; spreadsheetId: string; sheetId: number; requestId: string;
  sourceRow: number; sourceRowSha256: string; snapshotSha256: string; manifestSha256: string;
  sourceCreatedAt: string; sourceTimezone: "Etc/GMT"; sourceStatus: string;
  sourceFollowUpNote: string; sourceNotificationStatus: string; sourceSubmissionFingerprint: string;
  phoneNeedsReview: boolean; importedAt: string; importedBy: string;
};
export type LegacyExisting = {
  id: string; requestId: string; payloadHash: string; originalPayload: unknown;
  createdAt: string; sheetStatus: string; sheetAttemptedAt: string | null;
  sheetConfirmedAt: string | null; legacyImport: LegacyProvenance | null;
};
export type LegacyInsert = LegacyExisting & {
  status: "NEW"; revision: 1; storeName: string; industry: string;
  contactName: string | null; phone: string | null; lineId: string | null; contactWay: string | null;
  websiteUrl: string | null; facebookUrl: string | null; instagramUrl: string | null;
  trialApplicationId: null; trialLinkedAt: null; trialLinkedBy: null; updatedAt: string;
};
export type LegacyPlan = {
  insert: Candidate[]; skipped: string[]; conflicts: string[];
  excludedTests: number; excludedMirrors: number; phoneReviewCount: number;
};
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (reason: string): never => { throw new Error(`LEGACY_IMPORT_${reason}`); };
const same = (a: unknown, b: unknown): boolean => {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, stable(value)])) : v;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
};
function payloadSnapshot(payload: ConsultationPayload) {
  const value = sanitizeConsultationPayload(payloadSchema.parse(payload));
  return { payload: value, hash: sha256(JSON.stringify(value)) };
}
function parseReviewed(manifestText: string, approval: LegacyApproval, snapshotText: string) {
  hashSchema.parse(approval.manifestSha256); hashSchema.parse(approval.snapshotSha256);
  if (sha256(manifestText) !== approval.manifestSha256) fail("STALE_MANIFEST");
  if (sha256(snapshotText) !== approval.snapshotSha256) fail("STALE_SNAPSHOT");
  const manifest = manifestSchema.parse(JSON.parse(manifestText));
  if (manifest.snapshotSha256 !== approval.snapshotSha256) fail("SNAPSHOT_MISMATCH");
  const candidates: Candidate[] = []; let excludedTests = 0; let excludedMirrors = manifest.totals?.summaryMirrorRows ?? 0;
  for (const row of manifest.rows) {
    if (row.classification === "excluded_explicit_test") { excludedTests++; continue; }
    if (row.classification === "excluded_formula_mirror") { excludedMirrors++; continue; }
    if (row.classification !== "real_candidate_pending_root_review") fail("UNKNOWN_CLASSIFICATION");
    const candidate = candidateSchema.parse(row);
    const payload = payloadSnapshot(candidate.canonicalHqPayload);
    if (candidate.originalRequestId !== payload.payload.requestId || candidate.canonicalHqPayloadHash !== payload.hash
      || !same(candidate.canonicalHqPayload, payload.payload)) fail("PAYLOAD_MISMATCH");
    if (/TEST[-_]DO[-_]NOT[-_]CONTACT|SYSTEM_QA_DO_NOT_CONTACT|【HQ測試】|QA_URL_ONLY_|系統驗收|系統測試|正式收件測試|非店家申請/i.test(JSON.stringify(payload.payload))) fail("TEST_CANDIDATE");
    if (candidate.phoneImport.observedText !== candidate.phoneImport.normalizedText
      || (payload.payload.phone ?? "") !== candidate.phoneImport.observedText) fail("PHONE_CHANGED");
    // Reconstruction of a source UTC Sheet serial, not a business-day calculation.
    if (new Date(Math.round((candidate.sourceDate.serial - 25569) * 86400000)).toISOString() !== candidate.sourceDate.createdAt) fail("SOURCE_DATE_MISMATCH");
    candidates.push(candidate);
  }
  const ids = candidates.map(row => row.originalRequestId);
  if (ids.length !== approval.expectedCandidates || ids.length === 0 || new Set(ids).size !== ids.length
    || new Set(approval.requestIds).size !== approval.requestIds.length || !same([...ids].sort(), [...approval.requestIds].sort())) fail("CANDIDATE_SET_MISMATCH");
  return { manifest, candidates, excludedTests, excludedMirrors };
}
function verifySource(parsed: ReturnType<typeof parseReviewed>, source: LegacySourceObservation) {
  if (source.spreadsheetId !== parsed.manifest.spreadsheetId || source.sheetId !== parsed.manifest.sourceSheetId || source.timezone !== "Etc/GMT") fail("SOURCE_IDENTITY_MISMATCH");
  if (source.rows.length !== parsed.candidates.length) fail("SOURCE_ROW_SET_MISMATCH");
  for (const row of parsed.candidates) {
    const matches = source.rows.filter(item => item.formattedValues[27] === row.originalRequestId);
    if (matches.length !== 1) fail("SOURCE_UUID_MISSING_OR_DUPLICATE");
    const current = matches[0];
    if (current.formattedValues.length !== 30 || current.formattedValues.some(value => typeof value !== "string")
      || current.sourceRow !== row.sourceRow || sha256(JSON.stringify(current.formattedValues)) !== row.rawRowSha256
      || current.dateSerial !== row.sourceDate.serial || current.cellNotes.some(note => note !== "")
      || current.formattedValues[16] !== row.originalStatus || current.formattedValues[17] !== row.originalFollowUpNote) fail("SOURCE_CHANGED");
  }
}
function originalMatches(row: Candidate, existing: LegacyExisting, manifest: ReturnType<typeof parseReviewed>["manifest"], approval: LegacyApproval) {
  const p = existing.legacyImport;
  return existing.payloadHash === row.canonicalHqPayloadHash && same(existing.originalPayload, row.canonicalHqPayload)
    && existing.createdAt === row.sourceDate.createdAt && existing.sheetStatus === "LEGACY_IMPORTED"
    && existing.sheetAttemptedAt === null && existing.sheetConfirmedAt === null && !!p
    && p.sourceKind === "GOOGLE_SHEETS" && p.spreadsheetId === manifest.spreadsheetId && p.sheetId === manifest.sourceSheetId
    && p.requestId === row.originalRequestId && p.sourceRowSha256 === row.rawRowSha256
    && p.manifestSha256 === approval.manifestSha256 && p.snapshotSha256 === approval.snapshotSha256
    && p.sourceCreatedAt === row.sourceDate.createdAt && p.sourceRow === row.sourceRow
    && p.sourceTimezone === row.sourceDate.timezone && p.sourceStatus === row.originalStatus
    && p.sourceFollowUpNote === row.originalFollowUpNote && p.sourceNotificationStatus === row.originalNotificationStatus
    && p.sourceSubmissionFingerprint === row.sourceSubmissionFingerprint
    && p.phoneNeedsReview === row.warnings.some(w => w.startsWith("PHONE_STORED_AS_NUMBER:"))
    && typeof p.importedBy === "string" && p.importedBy.trim().length > 0
    && isoSchema.safeParse(p.importedAt).success && p.importedAt >= row.sourceDate.createdAt;
}
export function planLegacyConsultationImport(input: {
  manifestText: string; snapshotText: string; approval: LegacyApproval; actualTarget: LegacyTarget;
  source: LegacySourceObservation; existing: LegacyExisting[];
}): LegacyPlan {
  if (!same(input.actualTarget, input.approval.target) || !["production", "preview"].includes(input.actualTarget.environment)
    || !/^[a-z]{20}$/.test(input.actualTarget.projectId)
    || input.actualTarget.database !== "postgres" || input.actualTarget.schema !== "public") fail("TARGET_MISMATCH");
  const parsed = parseReviewed(input.manifestText, input.approval, input.snapshotText); verifySource(parsed, input.source);
  const allowedIds = new Set(parsed.candidates.map(row => row.originalRequestId));
  if (input.existing.some(row => !allowedIds.has(row.requestId))) fail("UNBOUNDED_DESTINATION_RESULT");
  const result: LegacyPlan = { insert: [], skipped: [], conflicts: [], excludedTests: parsed.excludedTests,
    excludedMirrors: parsed.excludedMirrors, phoneReviewCount: parsed.candidates.filter(row => row.warnings.some(w => w.startsWith("PHONE_STORED_AS_NUMBER:"))).length };
  for (const row of parsed.candidates) {
    const matches = input.existing.filter(existing => existing.requestId === row.originalRequestId);
    if (!matches.length) result.insert.push(row);
    else if (matches.length === 1 && originalMatches(row, matches[0], parsed.manifest, input.approval)) result.skipped.push(row.originalRequestId);
    else result.conflicts.push(row.originalRequestId);
  }
  return result;
}

/** The adapter must use one SERIALIZABLE transaction and plain INSERT, never upsert.
 * The separate packet adapter binds the connector target; this core never opens a connection. */
export interface LegacyImportReadStore {
  identity(): Promise<LegacyTarget>;
  source(): Promise<LegacySourceObservation>;
  findByRequestIds(ids: readonly string[]): Promise<LegacyExisting[]>;
}
export interface LegacyImportTransaction extends LegacyImportReadStore { insert(row: LegacyInsert): Promise<void> }
export interface LegacyImportStore extends LegacyImportReadStore {
  transaction<T>(work: (tx: LegacyImportTransaction) => Promise<T>): Promise<T>;
}
export async function runLegacyConsultationImport(store: LegacyImportStore, input: {
  manifestText: string; snapshotText: string; approval: LegacyApproval;
}, options: { mode?: "dry-run" | "apply"; explicitApply?: boolean; actorId?: string; now?: () => Date } = {}) {
  // Parse before opening any adapter or attempting a destination lookup.
  const parsed = parseReviewed(input.manifestText, input.approval, input.snapshotText);
  const read = async (reader: LegacyImportReadStore) => planLegacyConsultationImport({ ...input,
    actualTarget: await reader.identity(), source: await reader.source(),
    existing: await reader.findByRequestIds(parsed.candidates.map(row => row.originalRequestId)) });
  if (!options.mode || options.mode === "dry-run") {
    const plan = await read(store);
    return { mode: "dry-run" as const, inserted: 0, proposedInsert: plan.insert.length, skipped: plan.skipped.length,
      conflicts: plan.conflicts.length, phoneReviewCount: plan.phoneReviewCount, excludedTests: plan.excludedTests, excludedMirrors: plan.excludedMirrors };
  }
  if (options.mode !== "apply" || options.explicitApply !== true || !options.actorId?.trim()) fail("APPLY_NOT_APPROVED");
  const actor = z.string().trim().min(1).parse(options.actorId);
  return store.transaction(async tx => {
    const plan = await read(tx);
    if (plan.conflicts.length) fail("DESTINATION_CONFLICT");
    const importedAt = isoSchema.parse((options.now ?? (() => new Date()))().toISOString());
    const insertedIds: string[] = [];
    for (const row of plan.insert) {
      if (importedAt < row.sourceDate.createdAt) fail("IMPORT_BEFORE_SOURCE_DATE");
      const p = row.canonicalHqPayload; const id = randomUUID();
      const provenance: LegacyProvenance = {
        sourceKind: "GOOGLE_SHEETS", spreadsheetId: parsed.manifest.spreadsheetId, sheetId: parsed.manifest.sourceSheetId,
        requestId: row.originalRequestId, sourceRow: row.sourceRow, sourceRowSha256: row.rawRowSha256,
        snapshotSha256: input.approval.snapshotSha256, manifestSha256: input.approval.manifestSha256,
        sourceCreatedAt: row.sourceDate.createdAt, sourceTimezone: "Etc/GMT", sourceStatus: row.originalStatus,
        sourceFollowUpNote: row.originalFollowUpNote, sourceNotificationStatus: row.originalNotificationStatus,
        sourceSubmissionFingerprint: row.sourceSubmissionFingerprint,
        phoneNeedsReview: row.warnings.some(w => w.startsWith("PHONE_STORED_AS_NUMBER:")), importedAt, importedBy: actor,
      };
      await tx.insert({ id, requestId: row.originalRequestId, payloadHash: row.canonicalHqPayloadHash, originalPayload: p,
        createdAt: row.sourceDate.createdAt, updatedAt: importedAt, sheetStatus: "LEGACY_IMPORTED", legacyImport: provenance,
        sheetAttemptedAt: null, sheetConfirmedAt: null, status: "NEW", revision: 1,
        storeName: p.storeName, industry: p.industry, contactName: p.contactName || null, phone: p.phone || null,
        lineId: p.lineId || null, contactWay: p.contactWay || null, websiteUrl: p.websiteUrl || null,
        facebookUrl: p.facebookUrl || null, instagramUrl: p.instagramUrl || null,
        trialApplicationId: null, trialLinkedAt: null, trialLinkedBy: null });
      insertedIds.push(id);
    }
    // Repeat source/identity/exact-ID reconciliation before commit. A discrepancy
    // or failed insert rejects the transaction. The caller also refreshes after commit.
    const verified = await read(tx);
    if (verified.insert.length || verified.conflicts.length || verified.skipped.length !== parsed.candidates.length) fail("POST_INSERT_VERIFICATION_FAILED");
    return { mode: "apply" as const, inserted: insertedIds.length, insertedIds, skipped: plan.skipped.length, conflicts: 0 };
  });
}
