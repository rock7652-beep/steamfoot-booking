/**
 * Local-only opening-state contract. No persistence, attendance, receipts, payroll,
 * inventory movements or production callers. See docs/music-opening-state-20261007.md.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { dayRange } from "./date-utils";

const key = z.string().min(1).max(200).refine((v) => v.trim() === v, "Key must not have surrounding whitespace");
const count = z.number().int().min(0).max(100_000);
const money = z.number().int().min(0).max(2_147_483_647);
// Prisma stores milliseconds. Reject finer precision instead of silently losing it.
const instant = z.string().datetime({ offset: true })
  .regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/)
  .transform((value, ctx) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 0 || date.getUTCFullYear() > 9999) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid timestamp or UTC offset" });
      return z.NEVER;
    }
    return date.toISOString();
  });
const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const date = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v && v >= "2000-01-01";
}, "Expected an actual calendar date on or after 2000-01-01");
const scopeSchema = z.object({
  version: z.literal(1),
  targetStoreId: key,
  sourceSystem: z.literal("YINJIAOYUN"),
  sourceTenantKey: key,
  timeZone: z.literal("Asia/Taipei"),
  cutoffBusinessDate: businessDate,
}).strict();
const identitySchema = z.object({
  entityKind: z.enum(["MUSIC_ENROLLMENT", "INVENTORY_POSITION"]),
  sourceRecordKey: key,
}).strict();
const termSchema = z.object({
  sourceTermKey: key,
  originalTermNumber: z.number().int().min(1).max(100_000),
  totalLessons: count.refine((v) => v > 0, "A term must contain lessons"),
  // A closed ordinal prefix is not an attendance or a debit event.
  closedBeforeCutoff: count,
}).strict();
export const musicOpeningEnrollmentSchema = z.object({
  entityKind: z.literal("MUSIC_ENROLLMENT"),
  sourceRecordKey: key,
  sourceRevision: key,
  sourceStudentKey: key,
  sourcePlanKey: key,
  paidLessons: count,
  giftLessons: count,
  terms: z.array(termSchema).min(1).max(100),
  ordinarySourceSlots: z.array(z.object({ sourceLessonKey: key, sourceTermKey: key,
    originalLessonOrdinal: z.number().int().min(1).max(100_000) }).strict()).max(100_000).optional(),
  balance: z.object({
    consumedBeforeCutoff: count,
    remainingAtCutoff: count,
    reservedAtCutoff: count,
    unresolvedMakeupLessons: count,
    // Verified, disjoint pre-cutoff rights. Never count a leave as consumption.
    // Omitted on legacy snapshots, whose original hashes and blocking remain intact.
    separatedMakeup: z.object({
      verification: z.literal("VERIFIED_DISJOINT"),
      sourceLessonKeys: z.array(key).max(100_000),
    }).strict().optional(),
  }).strict(),
  originalUnitPrice: money.nullable(),
  activatedAt: instant.nullable(),
  expiresAt: instant.nullable(),
  expiryVerification: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("UNKNOWN") }).strict(),
    z.object({ kind: z.literal("NO_EXPIRY"), evidenceKey: key }).strict(),
    z.object({ kind: z.literal("SPECIFIED"), evidenceKey: key }).strict(),
  ]).optional(),
  tuition: z.object({
    currency: z.literal("TWD"),
    originalListPrice: money.nullable(),
    agreedTuition: money,
    paidBeforeCutoff: money,
    receivableAtCutoff: money,
  }).strict(),
}).strict();
// Decimal(18,6), represented without binary floating-point conversion.
const decimalCost = z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/).transform((value) => {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
});
const inventorySchema = z.object({
  entityKind: z.literal("INVENTORY_POSITION"),
  sourceRecordKey: key,
  sourceRevision: key,
  sourceProductKey: key,
  sourceLocationKey: key,
  sourceLotKey: key.nullable(),
  currency: z.literal("TWD"),
  onHandQuantity: count,
  reservedQuantity: count,
  unitCost: decimalCost.nullable(),
}).strict();
const recordSchema = z.discriminatedUnion("entityKind", [musicOpeningEnrollmentSchema, inventorySchema]).superRefine((record, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (record.entityKind === "INVENTORY_POSITION") {
    if (record.reservedQuantity > record.onHandQuantity) issue(["reservedQuantity"], "Reserved inventory exceeds on-hand quantity");
    return;
  }
  const total = record.paidLessons + record.giftLessons;
  if (total <= 0 || total > 100_000 || record.terms.reduce((sum, term) => sum + term.totalLessons, 0) !== total) {
    issue(["terms"], "Term total must equal original paid plus gift lessons within the supported limit");
  }
  const ids = new Set<string>();
  const numbers = new Set<number>();
  record.terms.forEach((term, index) => {
    if (ids.has(term.sourceTermKey) || numbers.has(term.originalTermNumber)) issue(["terms", index], "Duplicate source term key or original term number");
    ids.add(term.sourceTermKey); numbers.add(term.originalTermNumber);
    if (term.closedBeforeCutoff > term.totalLessons) issue(["terms", index, "closedBeforeCutoff"], "Closed prefix exceeds term size");
  });
  const separate = record.balance.separatedMakeup?.sourceLessonKeys ?? [];
  if (new Set(separate).size !== separate.length) issue(["balance", "separatedMakeup"], "Duplicate separate makeup source lesson");
  if (record.balance.consumedBeforeCutoff + record.balance.remainingAtCutoff + separate.length !== total) {
    issue(["balance"], "Consumed plus ordinary remaining plus separate makeup must reconcile to original purchased lessons");
  }
  if (record.expiryVerification && (record.expiryVerification.kind === "SPECIFIED") !== (record.expiresAt !== null)) {
    issue(["expiryVerification"], "Verified expiry kind must agree with original expiresAt; never use a sentinel date");
  }
  if (record.balance.separatedMakeup && !record.ordinarySourceSlots) issue(["ordinarySourceSlots"], "Separated balances require an exact ordinary source-slot manifest");
  if (record.ordinarySourceSlots) {
    const slots = new Set<string>(), keys = new Set<string>();
    if (record.ordinarySourceSlots.length !== record.balance.remainingAtCutoff) issue(["ordinarySourceSlots"], "Ordinary source-slot count must equal ordinary cutoff balance");
    for (const slot of record.ordinarySourceSlots) {
      const tuple = JSON.stringify([slot.sourceTermKey, slot.originalLessonOrdinal]);
      const term = record.terms.find(t => t.sourceTermKey === slot.sourceTermKey);
      if (!term || slot.originalLessonOrdinal <= term.closedBeforeCutoff || slot.originalLessonOrdinal > term.totalLessons || slots.has(tuple) || keys.has(slot.sourceLessonKey) || separate.includes(slot.sourceLessonKey)) issue(["ordinarySourceSlots"], "Invalid, duplicate or overlapping ordinary source slot");
      slots.add(tuple); keys.add(slot.sourceLessonKey);
    }
  }
  if (record.balance.reservedAtCutoff > record.balance.remainingAtCutoff) issue(["balance", "reservedAtCutoff"], "Reservations exceed remaining credit");
  if (record.activatedAt && record.expiresAt && Date.parse(record.expiresAt) < Date.parse(record.activatedAt)) issue(["expiresAt"], "Expiry precedes activation");
  const tuition = record.tuition;
  if (tuition.originalListPrice !== null && tuition.agreedTuition > tuition.originalListPrice) {
    issue(["tuition", "agreedTuition"], "Tuition above the original list price requires separate fee reconciliation");
  }
  if (tuition.paidBeforeCutoff + tuition.receivableAtCutoff !== tuition.agreedTuition) issue(["tuition"], "Opening paid plus receivable must equal agreed tuition");
});
const batchSchema = z.object({
  batchId: key,
  scope: scopeSchema,
  records: z.array(recordSchema).min(1).max(10_000),
}).strict().superRefine((batch, ctx) => {
  // Object refinements also run when a child string refinement is dirty.
  // Never call dayRange on an invalid date and turn BLOCKED into a RangeError.
  if (!businessDate.safeParse(batch.scope.cutoffBusinessDate).success) return;
  const cutoff = dayRange(batch.scope.cutoffBusinessDate).start.toISOString();
  batch.records.forEach((record, index) => {
    if (record.entityKind === "MUSIC_ENROLLMENT" && record.activatedAt && Date.parse(record.activatedAt) >= Date.parse(cutoff)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["records", index, "activatedAt"], message: "Opening activation must be before cutoff; later activation is a new event" });
    }
  });
});
const appliedSchema = z.object({
  scope: scopeSchema,
  identity: identitySchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetEntityId: key,
  appliedBatchId: key,
  sourceRevision: key,
}).strict();

export type MusicOpeningScope = z.infer<typeof scopeSchema>;
export type MusicOpeningRecord = z.infer<typeof recordSchema>;
export type MusicOpeningEnrollment = z.infer<typeof musicOpeningEnrollmentSchema>;
export type MusicOpeningApplied = z.infer<typeof appliedSchema>;
export type MusicOpeningIssue = {
  code: "INVALID_INPUT" | "SCOPE_MISMATCH" | "DUPLICATE_SOURCE" | "SOURCE_CONFLICT" | "LEDGER_CONFLICT";
  path: string;
  message: string;
};
export type MusicOpeningEntry = {
  action: "CREATE" | "NO_OP";
  key: string;
  contentHash: string;
  record: MusicOpeningRecord;
  targetEntityId: string | null;
};
export type MusicOpeningPlan =
  | { status: "BLOCKED"; issues: MusicOpeningIssue[] }
  | { status: "READY"; batchId: string; scope: MusicOpeningScope; entries: MusicOpeningEntry[] };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((name) => `${JSON.stringify(name)}:${canonical(object[name])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Cutoff/batch are intentionally absent: changing them must not mint a second identity. */
export function musicOpeningKey(scopeInput: unknown, identityInput: unknown): string {
  const scope = scopeSchema.parse(scopeInput);
  const identity = identitySchema.parse(identityInput);
  return JSON.stringify([scope.version, scope.targetStoreId, scope.sourceSystem, scope.sourceTenantKey, identity.entityKind, identity.sourceRecordKey]);
}
function identityOf(record: MusicOpeningRecord) {
  return { entityKind: record.entityKind, sourceRecordKey: record.sourceRecordKey };
}
function contentHash(scope: MusicOpeningScope, record: MusicOpeningRecord): string {
  const { sourceRevision: _revision, ...state } = record;
  void _revision; // Opaque audit metadata, never a source version ordering assumption.
  const normalized = state.entityKind === "MUSIC_ENROLLMENT"
    ? { ...state, terms: [...state.terms].sort((a, b) => a.originalTermNumber - b.originalTermNumber),
        ...(state.balance.separatedMakeup ? { balance: { ...state.balance, separatedMakeup: {
          ...state.balance.separatedMakeup, sourceLessonKeys: [...state.balance.separatedMakeup.sourceLessonKeys].sort(),
        } } } : {}),
        ...(state.ordinarySourceSlots ? { ordinarySourceSlots: [...state.ordinarySourceSlots].sort((a, b) => a.sourceTermKey.localeCompare(b.sourceTermKey) || a.originalLessonOrdinal - b.originalLessonOrdinal) } : {}) }
    : state;
  return createHash("sha256").update(canonical({ scope, state: normalized })).digest("hex");
}

/** Pure, atomic planning only. A READY plan is not a DB transaction or authorization. */
export function planMusicOpeningBatch(input: unknown, appliedInput: unknown): MusicOpeningPlan {
  const batch = batchSchema.safeParse(input);
  const ledger = z.array(appliedSchema).max(10_000).safeParse(appliedInput);
  const issues: MusicOpeningIssue[] = [];
  for (const [name, result] of [["batch", batch], ["ledger", ledger]] as const) {
    if (!result.success) issues.push(...result.error.issues.map((issue) => ({
      code: "INVALID_INPUT" as const, path: [name, ...issue.path].join("."), message: issue.message,
    })));
  }
  if (!batch.success || !ledger.success) return { status: "BLOCKED", issues };
  const { scope, batchId, records } = batch.data;
  const appliedByKey = new Map<string, MusicOpeningApplied>();
  const targetKeys = new Set<string>();
  ledger.data.forEach((entry, index) => {
    if (canonical(entry.scope) !== canonical(scope)) {
      issues.push({ code: "SCOPE_MISMATCH", path: `ledger.${index}.scope`, message: "Ledger must be scoped to the exact store, source tenant and cutoff" });
    }
    const id = musicOpeningKey(entry.scope, entry.identity);
    const target = JSON.stringify([entry.scope.targetStoreId, entry.identity.entityKind, entry.targetEntityId]);
    if (appliedByKey.has(id) || targetKeys.has(target)) {
      issues.push({ code: "LEDGER_CONFLICT", path: `ledger.${index}`, message: "Duplicate source mapping or target entity in ledger" });
    }
    appliedByKey.set(id, entry); targetKeys.add(target);
  });
  const entries = new Map<string, MusicOpeningEntry>();
  records.forEach((record, index) => {
    const id = musicOpeningKey(scope, identityOf(record));
    const hash = contentHash(scope, record);
    const duplicate = entries.get(id);
    if (duplicate) {
      if (duplicate.contentHash !== hash) issues.push({ code: "DUPLICATE_SOURCE", path: `batch.records.${index}`, message: "Same source key has different opening states in this batch" });
      return;
    }
    const previous = appliedByKey.get(id);
    if (previous && previous.contentHash !== hash) issues.push({ code: "SOURCE_CONFLICT", path: `batch.records.${index}`, message: "Existing opening state differs; review a correction instead of overwriting or replaying it" });
    entries.set(id, { action: previous ? "NO_OP" : "CREATE", key: id, contentHash: hash, record, targetEntityId: previous?.targetEntityId ?? null });
  });
  return issues.length ? { status: "BLOCKED", issues } : { status: "READY", batchId, scope, entries: [...entries.values()] };
}

/**
 * Preview an explicit source lesson, never infer ordinals from target bookings.
 * Repeating this projection cannot consume credit or alter the opening snapshot.
 */
export function projectMusicOpeningLesson(scopeInput: unknown, recordInput: unknown, lessonInput: unknown) {
  const batch = batchSchema.parse({ batchId: "projection", scope: scopeInput, records: [recordInput] });
  const record = batch.records[0];
  if (record.entityKind !== "MUSIC_ENROLLMENT") throw new Error("Expected a music enrollment opening state");
  const lesson = z.object({
    sourceTermKey: key,
    originalLessonOrdinal: z.number().int().min(1).max(100_000),
    occurredAt: instant,
  }).strict().parse(lessonInput);
  const cutoff = dayRange(batch.scope.cutoffBusinessDate).start.toISOString();
  if (Date.parse(lesson.occurredAt) < Date.parse(cutoff)) throw new Error("Pre-cutoff lessons are closed opening state, not imported attendance");
  const term = record.terms.find((candidate) => candidate.sourceTermKey === lesson.sourceTermKey);
  if (!term || lesson.originalLessonOrdinal <= term.closedBeforeCutoff || lesson.originalLessonOrdinal > term.totalLessons) {
    throw new Error("Source lesson must be a known post-cutoff ordinal within its original term");
  }
  return {
    originalTermNumber: term.originalTermNumber,
    originalLessonOrdinal: lesson.originalLessonOrdinal,
    originalTermLessonCount: term.totalLessons,
    originalUnitPrice: record.originalUnitPrice,
    activatedAt: record.activatedAt,
    expiresAt: record.expiresAt,
    openingRemainingLessons: record.balance.remainingAtCutoff,
    openingReservedLessons: record.balance.reservedAtCutoff,
    openingAvailableLessons: record.balance.remainingAtCutoff - record.balance.reservedAtCutoff,
    // Snapshot only. This does not authorize booking, attendance, payroll or collection.
    openingPaid: record.tuition.paidBeforeCutoff,
    openingReceivable: record.tuition.receivableAtCutoff,
  };
}
