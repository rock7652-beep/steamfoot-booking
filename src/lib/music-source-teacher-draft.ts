import { createHash } from "node:crypto";
import { z } from "zod";
import { MUSIC_OPENING_STORE } from "../../scripts/music-opening-preview-scope.mjs";

export const MUSIC_SOURCE_TEACHER_PREFIX = "source-replica:music-teacher:";
export const MUSIC_SOURCE_TEACHER_NAME_PREFIX = "[音教雲] ";
export const MUSIC_SOURCE_TEACHER_TARGET = "MusicSourceTeacherDraft";
export const MUSIC_SOURCE_TEACHER_HOLD = "來源教師仍為停用草稿；完成來源核對與完整人員驗證前，不可修改或啟用";
const sourceId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

/** No contact, authentication, linking, fee, qualification or permission inputs. */
export const musicSourceTeacherSnapshotSchema = z.object({
  version: z.literal(1),
  marker: z.literal("SOURCE_REPLICA"),
  targetStoreId: z.literal(MUSIC_OPENING_STORE),
  sourceSystem: z.literal("YINJIAOYUN"),
  // Verified source alias, not a claimed native tenant ID.
  sourceTenantKey: z.literal("www.injiaoyun.com:store-lubymusic"),
  sourceTeacherId: sourceId,
  sourceRevision: sourceId,
  sourceDisplayName: z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value))
    .refine(value => (MUSIC_SOURCE_TEACHER_NAME_PREFIX + value).length <= 80, "來源姓名加上辨識前綴後不可超過 80 字元"),
}).strict();
export type MusicSourceTeacherSnapshot = z.infer<typeof musicSourceTeacherSnapshotSchema>;

/** Supplied only by an independently reviewed, trusted server-side source reader.
 * This is an evidence contract, not an authorization token or browser input. */
export const musicSourceTeacherProofSchema = z.object({
  status: z.literal("SOURCE_VERIFIED"),
  targetStoreId: z.literal(MUSIC_OPENING_STORE),
  sourceSystem: z.literal("YINJIAOYUN"),
  // Verified source alias, not a claimed native tenant ID.
  sourceTenantKey: z.literal("www.injiaoyun.com:store-lubymusic"),
  sourceTeacherId: sourceId,
  sourceRevision: sourceId,
  snapshotHash: digest,
}).strict();
export type MusicSourceTeacherProof = z.infer<typeof musicSourceTeacherProofSchema>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function musicSourceTeacherHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function musicSourceTeacherIdentity(snapshot: MusicSourceTeacherSnapshot) {
  // Name and revision are intentionally excluded: changes must HOLD the same row.
  const key = musicSourceTeacherHash([snapshot.targetStoreId, snapshot.sourceSystem, snapshot.sourceTenantKey, snapshot.sourceTeacherId]);
  return { staffId: `${MUSIC_SOURCE_TEACHER_PREFIX}staff:${key}`, userId: `${MUSIC_SOURCE_TEACHER_PREFIX}user:${key}`, auditId: `${MUSIC_SOURCE_TEACHER_PREFIX}receipt:${key}` };
}
export function isMusicSourceTeacherId(value: string | null | undefined) {
  return value?.startsWith(MUSIC_SOURCE_TEACHER_PREFIX) ?? false;
}
export function musicSourceTeacherDraftRecords(snapshot: MusicSourceTeacherSnapshot) {
  const identity = musicSourceTeacherIdentity(snapshot);
  const displayName = MUSIC_SOURCE_TEACHER_NAME_PREFIX + snapshot.sourceDisplayName;
  const staff = {
    id: identity.staffId, userId: identity.userId, storeId: snapshot.targetStoreId,
    displayName, status: "INACTIVE" as const, isOwner: false,
    phone: "", emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelation: "", courseBirthday: null,
    courseCoachEnabled: false, courseQualificationsConfirmed: false, courseQualifiedTemplateIds: [] as string[],
    courseDefaultClassFee: null, monthlySpaceFee: "0", spaceFeeEnabled: false,
  };
  const user = {
    id: identity.userId, name: displayName, role: "CUSTOMER" as const, status: "SUSPENDED" as const,
    email: null, phone: null, passwordHash: null, emailVerified: null, image: null,
  };
  const receipt = {
    id: identity.auditId, source: "SOURCE_REPLICA", storeId: snapshot.targetStoreId, module: "MUSIC",
    targetType: MUSIC_SOURCE_TEACHER_TARGET, targetId: identity.staffId, action: "STAGE",
    afterJson: { version: 1, marker: "SOURCE_REPLICA", status: "DRAFT", ...identity, snapshotHash: musicSourceTeacherHash(snapshot), snapshot },
  };
  return { ...identity, staff, user, receipt };
}
export type MusicSourceTeacherStoredState = {
  staff: unknown | null; user: unknown | null; receipts: unknown[]; hasRelatedData: boolean;
};
export function planMusicSourceTeacherDraft(raw: unknown, proofRaw: unknown, stored: MusicSourceTeacherStoredState) {
  const parsed = musicSourceTeacherSnapshotSchema.safeParse(raw);
  const proof = musicSourceTeacherProofSchema.safeParse(proofRaw);
  const hold = (issue: string) => ({ status: "HOLD" as const, issue });
  if (!parsed.success || !proof.success) return hold("INVALID_SOURCE_CONTRACT");
  const snapshot = parsed.data;
  const expectedProof: MusicSourceTeacherProof = {
    status: "SOURCE_VERIFIED", targetStoreId: snapshot.targetStoreId, sourceSystem: snapshot.sourceSystem,
    sourceTenantKey: snapshot.sourceTenantKey, sourceTeacherId: snapshot.sourceTeacherId,
    sourceRevision: snapshot.sourceRevision, snapshotHash: musicSourceTeacherHash(snapshot),
  };
  if (musicSourceTeacherHash(proof.data) !== musicSourceTeacherHash(expectedProof)) return hold("SOURCE_PROOF_MISMATCH");
  const records = musicSourceTeacherDraftRecords(snapshot);
  if (stored.staff === null && stored.user === null && stored.receipts.length === 0 && stored.hasRelatedData === false) return { status: "READY" as const, ...records };
  // Never repair, merge, rename or adopt existing ordinary rows, even on a partial write.
  if (stored.receipts.length !== 1 || musicSourceTeacherHash(stored.receipts[0]) !== musicSourceTeacherHash(records.receipt)) return hold("SOURCE_RECEIPT_MISSING_OR_CHANGED");
  if (stored.hasRelatedData !== false || musicSourceTeacherHash(stored.staff) !== musicSourceTeacherHash(records.staff) || musicSourceTeacherHash(stored.user) !== musicSourceTeacherHash(records.user)) return hold("DRAFT_STATE_CHANGED");
  return { status: "NO_OP" as const, staffId: records.staffId, userId: records.userId };
}
