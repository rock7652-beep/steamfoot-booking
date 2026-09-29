import { compensationRule } from "./course-compensation";

export type TeacherFeeSeat = {
  id: string;
  customerName: string;
  status: string;
  bookingKind: string;
  absenceKind: string | null;
  originalUnitPrice: number | null;
};
export type TeacherFeeDetail = { id: string; name: string; base: number | null; amount: number | null; reason: string };
export type TeacherFeeResult = { amount: number | null; issue: string | null; details: TeacherFeeDetail[] };

/** Never infer an original price from discounted receipts or the current catalogue. */
export function originalMusicUnitPrice(order: { listPrice: number | null; points: number; musicBonusLessons: number }): number | null {
  const paidLessons = order.points - order.musicBonusLessons;
  if (order.listPrice === null || !Number.isSafeInteger(order.listPrice) || order.listPrice < 0 ||
      !Number.isSafeInteger(paidLessons) || paidLessons <= 0) return null;
  const price = order.listPrice / paidLessons;
  return Number.isSafeInteger(price) ? price : null;
}

/** Music v2: original price, one rounding per learner, then sum. CLASS is once per session. */
export function calculateTeacherFee(input: {
  rule: unknown; teacherAttendance?: string; cancelled?: boolean;
  trialMode?: string | null; trialBase?: number | null; seats: TeacherFeeSeat[];
}): TeacherFeeResult {
  const result = (amount: number | null, issue: string | null = null, details: TeacherFeeDetail[] = []): TeacherFeeResult => ({ amount, issue, details });
  if (input.cancelled || input.teacherAttendance === "LEAVE" || input.teacherAttendance === "NO_SHOW") return result(0);
  const parsed = compensationRule.safeParse(input.rule);
  if (!parsed.success || parsed.data.mode === "HOUR") return result(null, "授課費率待核對");
  if (input.seats.some(s => s.status === "RESERVED")) return result(null, "尚有學員待點名");
  const rule = parsed.data;
  if (rule.mode === "CLASS") return Number.isSafeInteger(rule.value) ? result(rule.value) : result(null, "固定授課費須為整數");
  const due = input.seats.filter(s => s.bookingKind !== "TEACHER_MAKEUP" &&
    (s.status === "ATTENDED" || s.status === "NO_SHOW" || s.absenceKind === "GROUP_LEAVE_FORFEITED"));
  const details = due.map(s => {
    const freeTrial = s.bookingKind === "TRIAL" && input.trialMode === "FREE";
    const base = freeTrial ? input.trialBase ?? null : s.originalUnitPrice;
    // Integer arithmetic at the rounding boundary avoids 0.55-style binary float drift.
    const amount = base !== null && Number.isSafeInteger(base) && base >= 0
      ? Math.floor((base * Math.round(rule.value * 100) + 5000) / 10000) : null;
    return { id: s.id, name: s.customerName, base, amount,
      reason: base === null ? "原單堂價待核對" : freeTrial ? "免費體驗計酬基數" : s.status === "NO_SHOW" ? "曠課扣堂" : s.absenceKind === "GROUP_LEAVE_FORFEITED" ? "團班請假扣堂" : "原單堂價" };
  });
  if (details.some(d => d.amount === null)) return result(null, "學員原單堂價待核對", details);
  const total = details.reduce((sum, d) => sum + d.amount!, 0);
  return Number.isSafeInteger(total) ? result(total, null, details) : result(null, "授課費超過可計算範圍", details);
}

/** The version lives in the immutable class rule. Existing class rounding is not rewritten. */
export function isTeacherFeeV2(rule: unknown): boolean {
  return !!rule && typeof rule === "object" && "calculationVersion" in rule && rule.calculationVersion === 2;
}
