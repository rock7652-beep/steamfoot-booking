/** Server-side consumers for the local opening-state integration draft. No writes. */
import { z } from "zod";
import { dayRange } from "./date-utils";
import { planMusicOpeningBatch, projectMusicOpeningLesson, type MusicOpeningEnrollment, type MusicOpeningScope } from "./music-opening-state";

export const MUSIC_OPENING_SELECT = {
  storeId: true, cardId: true, customerId: true, sourceKey: true,
  contentHash: true, snapshot: true, appliedBatchId: true, teacherFeePolicy: true,
} as const;

export type OpeningCard = {
  id?: string;
  storeId?: string;
  unit?: string;
  musicOpeningStateRequired?: boolean;
  musicOpeningState?: unknown;
  musicActivatedAt?: Date | null;
  expiresAt?: Date;
  members?: { customerId: string }[];
};
export type OpeningState =
  | { kind: "NATIVE" }
  | { kind: "BLOCKED"; issue: string }
  | { kind: "OPENING"; scope: MusicOpeningScope; record: MusicOpeningEnrollment; customerId: string; teacherFeePolicy: "UNVERIFIED" | "MUSIC_V2_ORIGINAL_PRICE" };
export type OpeningBooking = {
  pointCost?: number;
  bookingKind?: string;
  musicOpeningMakeupEntitlementId?: string | null;
  companionIndex?: number | null;
  makeupForBookingId?: string | null;
  customerId?: string | null;
  musicOpeningTermKey?: string | null;
  musicOpeningLessonOrdinal?: number | null;
  musicOpeningSourceLessonKey?: string | null;
  session: { startsAt: Date };
};
/** Either marker is enough to isolate a right, including damaged/incomplete rows. */
export function isMusicOpeningMakeupBooking(booking: {
  bookingKind?: string;
  musicOpeningMakeupEntitlementId?: string | null;
  openingMakeupSource?: boolean;
}): boolean {
  return booking.bookingKind === "OPENING_MAKEUP" || booking.musicOpeningMakeupEntitlementId != null || booking.openingMakeupSource === true;
}
export const MUSIC_OPENING_MAKEUP_OPERATION_ISSUE = "期初補課須由店家使用專用權益流程處理";
export const MUSIC_OPENING_MAKEUP_FEE_ISSUE = "UNVERIFIED：期初補課授課費規則尚未核對";

const rowSchema = z.object({
  storeId: z.string().min(1), cardId: z.string().min(1), customerId: z.string().min(1),
  sourceKey: z.string().min(1), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: z.object({ scope: z.unknown(), record: z.unknown() }).strict(),
  appliedBatchId: z.string().min(1), teacherFeePolicy: z.enum(["UNVERIFIED", "MUSIC_V2_ORIGINAL_PRICE"]),
});
const blocked = (issue: string): OpeningState => ({ kind: "BLOCKED", issue });

/** Missing imported state, wrong tenancy or damaged snapshots never fall back to native. */
export function readMusicOpeningCard(card: OpeningCard | null | undefined, storeId: string, customerId?: string | null): OpeningState {
  if (!card || (!card.musicOpeningStateRequired && !card.musicOpeningState)) return { kind: "NATIVE" };
  if (!card.musicOpeningStateRequired || !card.musicOpeningState) return blocked("期初來源標記或資料缺漏，請先核對");
  const parsed = rowSchema.safeParse(card.musicOpeningState);
  if (!parsed.success) return blocked("期初資料格式不完整，請先核對");
  const row = parsed.data;
  if (card.id !== row.cardId || card.storeId !== storeId || row.storeId !== storeId || card.unit !== "SESSION" ||
      (customerId !== undefined && customerId !== row.customerId) ||
      (card.members && (card.members.length !== 1 || card.members[0].customerId !== row.customerId))) {
    return blocked("期初資料與本店方案或學員關聯不一致");
  }
  const plan = planMusicOpeningBatch({ batchId: row.appliedBatchId, scope: row.snapshot.scope, records: [row.snapshot.record] }, []);
  if (plan.status !== "READY" || plan.scope.targetStoreId !== storeId || plan.entries.length !== 1) return blocked("期初資料尚未通過核對");
  const entry = plan.entries[0];
  if (entry.key !== row.sourceKey || entry.contentHash !== row.contentHash || entry.record.entityKind !== "MUSIC_ENROLLMENT") {
    return blocked("期初來源鍵或內容核對碼不一致");
  }
  return { kind: "OPENING", scope: plan.scope, record: entry.record, customerId: row.customerId, teacherFeePolicy: row.teacherFeePolicy };
}

/** Until their source links are materialized, do not guess opening holds or makeup. */
export function musicOpeningOperationIssue(state: OpeningState, card: OpeningCard): string | null {
  if (state.kind === "NATIVE") return null;
  if (state.kind === "BLOCKED") return state.issue;
  const record = state.record;
  if (record.expiryVerification?.kind === "NO_EXPIRY") return "已核實無期限；現有普通方案儲存格式尚未支援，暫不能變更課程";
  if (!record.activatedAt || !record.expiresAt) return "期初啟用日或到期日未確認，暫不能變更課程";
  if (record.balance.reservedAtCutoff > 0) return "切點時預約尚未完成來源連結核對，暫不能變更課程";
  if (record.balance.unresolvedMakeupLessons > 0) return "期初待補課尚未完成來源連結核對，暫不能變更課程";
  if (!(card.musicActivatedAt instanceof Date) || !(card.expiresAt instanceof Date) ||
      card.musicActivatedAt.getTime() !== Date.parse(record.activatedAt) || card.expiresAt.getTime() !== Date.parse(record.expiresAt)) {
    return "方案效期與期初基準不一致，請先核對";
  }
  return null;
}

/** An explicit source ordinal is required; source IDs are never returned to the client. */
export function readMusicOpeningLesson(state: OpeningState, booking: OpeningBooking) {
  if (isMusicOpeningMakeupBooking(booking)) return { kind: "BLOCKED" as const, issue: MUSIC_OPENING_MAKEUP_OPERATION_ISSUE };
  const hasIdentity = booking.musicOpeningTermKey != null || booking.musicOpeningLessonOrdinal != null || booking.musicOpeningSourceLessonKey != null;
  if (state.kind === "NATIVE") return hasIdentity ? { kind: "BLOCKED" as const, issue: "原生方案不可帶入期初堂次關聯" } : { kind: "NATIVE" as const };
  if (state.kind === "BLOCKED") return state;
  if (booking.bookingKind !== "CARD" || booking.pointCost !== 1 || booking.companionIndex != null || booking.makeupForBookingId != null) {
    return { kind: "BLOCKED" as const, issue: "期初僅支援已核對的一人一堂原課，補課或特殊扣堂須另行核對" };
  }
  if (booking.customerId !== state.customerId || !booking.musicOpeningSourceLessonKey || !booking.musicOpeningTermKey || booking.musicOpeningLessonOrdinal == null) {
    return { kind: "BLOCKED" as const, issue: "期初課堂缺少來源堂次或學員關聯，請先核對" };
  }
  if (state.record.ordinarySourceSlots && !state.record.ordinarySourceSlots.some(slot =>
      slot.sourceLessonKey === booking.musicOpeningSourceLessonKey && slot.sourceTermKey === booking.musicOpeningTermKey && slot.originalLessonOrdinal === booking.musicOpeningLessonOrdinal)) {
    return { kind: "BLOCKED" as const, issue: "課堂不屬於已核對的普通堂次，不能以普通餘堂處理補課" };
  }
  try {
    const projection = projectMusicOpeningLesson(state.scope, state.record, {
      sourceTermKey: booking.musicOpeningTermKey,
      originalLessonOrdinal: booking.musicOpeningLessonOrdinal,
      occurredAt: booking.session.startsAt.toISOString(),
    });
    const term = state.record.terms.find((item) => item.sourceTermKey === booking.musicOpeningTermKey)!;
    return { kind: "OPENING" as const, ...projection, closedBeforeCutoff: term.closedBeforeCutoff };
  } catch {
    return { kind: "BLOCKED" as const, issue: "期初堂次、期別或日期不符，請先核對來源" };
  }
}

export function musicOpeningDateIssue(state: OpeningState, startsAt: Date): string | null {
  if (state.kind === "NATIVE") return null;
  if (state.kind === "BLOCKED") return state.issue;
  if (state.record.expiryVerification?.kind === "NO_EXPIRY") return "已核實無期限；現有普通方案儲存格式尚未支援";
  if (!Number.isFinite(startsAt.getTime()) || startsAt < dayRange(state.scope.cutoffBusinessDate).start) return "期初方案不能新增或移至切點前課堂";
  if (!state.record.expiresAt || startsAt.getTime() > Date.parse(state.record.expiresAt)) return "課堂超過期初原有效期限，請先核對";
  return null;
}

/** Shared select for calendar edits; callers keep their existing native checks. */
export const MUSIC_OPENING_CARD_SELECT = {
  id: true, storeId: true, unit: true, expiresAt: true, musicActivatedAt: true,
  musicOpeningStateRequired: true, musicOpeningState: { select: MUSIC_OPENING_SELECT },
  members: { select: { customerId: true } },
} as const;
export function musicOpeningSessionChangeIssue(storeId: string, booking: OpeningBooking & { card?: OpeningCard | null }, startsAt: Date): string | null {
  if (isMusicOpeningMakeupBooking(booking)) return MUSIC_OPENING_MAKEUP_OPERATION_ISSUE;
  const state = readMusicOpeningCard(booking.card, storeId, booking.customerId);
  const issue = musicOpeningOperationIssue(state, booking.card ?? {});
  if (issue) return issue;
  const lesson = readMusicOpeningLesson(state, booking);
  if (lesson.kind === "BLOCKED") return lesson.issue;
  return musicOpeningDateIssue(state, startsAt);
}

/** Include canceled imported history for validation, never for capacity counting. */
export const MUSIC_OPENING_CALENDAR_BOOKINGS = {
  OR: [
    { status: { not: "CANCELLED" } },
    { bookingKind: "OPENING_MAKEUP" },
    { musicOpeningMakeupEntitlementId: { not: null } },
    { card: { is: { musicOpeningStateRequired: true } } },
    { card: { is: { musicOpeningState: { isNot: null } } } },
    { musicOpeningTermKey: { not: null } },
    { musicOpeningLessonOrdinal: { not: null } },
    { musicOpeningSourceLessonKey: { not: null } },
  ],
};
