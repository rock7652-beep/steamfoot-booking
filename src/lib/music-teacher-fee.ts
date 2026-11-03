import { compensationRule } from "./course-compensation";
import { isMusicOpeningMakeupBooking, MUSIC_OPENING_MAKEUP_FEE_ISSUE } from "./music-opening-runtime";
import type { TeacherFeeSeat, TeacherFeeResult, TeacherFeeDetail } from "./teacher-fee-types";

/** Never infer an original price from discounted receipts or the current catalogue. */
export function originalMusicUnitPrice(order: { listPrice: number | null; points: number; musicBonusLessons: number }): number | null {
  const paidLessons = order.points - order.musicBonusLessons;
  if (order.listPrice === null || !Number.isSafeInteger(order.listPrice) || order.listPrice < 0 ||
      !Number.isSafeInteger(paidLessons) || paidLessons <= 0) return null;
  const price = order.listPrice / paidLessons;
  return Number.isSafeInteger(price) ? price : null;
}

/** Music v2: original price, one rounding per learner, then sum. CLASS is once per session. */
export function calculateMusicTeacherFee(input: {
  rule: unknown; teacherAttendance?: string; cancelled?: boolean;
  trialMode?: string | null; trialBase?: number | null; seats: TeacherFeeSeat[];
}): TeacherFeeResult {
  const result = (amount: number | null, issue: string | null = null, details: TeacherFeeDetail[] = []): TeacherFeeResult => ({ amount, issue, details });
  if (input.seats.some(s=>isMusicOpeningMakeupBooking(s)&&!s.verifiedOpeningMakeupFee)) return result(null, MUSIC_OPENING_MAKEUP_FEE_ISSUE);
  if (input.cancelled || input.teacherAttendance === "LEAVE" || input.teacherAttendance === "NO_SHOW") return result(0);
  const parsed = compensationRule.safeParse(input.rule);
  if (!parsed.success || parsed.data.mode === "HOUR") return result(null, "授課費率待核對");
  if (input.seats.some(s => s.status === "RESERVED")) return result(null, "尚有學員待點名");
  const rule = parsed.data;
  const due = input.seats.filter(s => s.bookingKind !== "TEACHER_MAKEUP" &&
    (s.status === "ATTENDED" || s.status === "NO_SHOW" || s.absenceKind === "GROUP_LEAVE_FORFEITED"));
  // A fixed class fee is paid once only when the class has a chargeable attendance.
  // Free teacher makeup and cancelled/leave-only classes must not generate a second fee.
  if (rule.mode === "CLASS") return !due.length ? result(0) : Number.isSafeInteger(rule.value) ? result(rule.value) : result(null, "固定授課費須為整數");
  const details = due.map(s => {
    const freeTrial = s.bookingKind === "TRIAL" && input.trialMode === "FREE";
    const base = freeTrial ? s.verifiedTrialFeeBase ?? input.trialBase ?? null : s.originalUnitPrice;
    // Integer arithmetic at the rounding boundary avoids 0.55-style binary float drift.
    const rational=!freeTrial?s.discountedBasis:undefined;
    const discountedAmount=rational&&Number.isSafeInteger(rational.total)&&rational.total>=0&&Number.isSafeInteger(rational.lessons)&&rational.lessons>0
      ? Number((BigInt(rational.total)*BigInt(Math.round(rule.value*100))*BigInt(2)+BigInt(rational.lessons)*BigInt(10000))/(BigInt(rational.lessons)*BigInt(20000))):null;
    const amount = rational?discountedAmount:base !== null && Number.isSafeInteger(base) && base >= 0
      ? Math.floor((base * Math.round(rule.value * 100) + 5000) / 10000) : null;
    return { id: s.id, name: s.customerName, base, amount,
      reason: base === null ? "原單堂價待核對" : freeTrial ? "免費體驗計酬基數" : rational ? "折後單堂價" : s.status === "NO_SHOW" ? "曠課扣堂" : s.absenceKind === "GROUP_LEAVE_FORFEITED" ? "團班請假扣堂" : "原單堂價" };
  });
  if (details.some(d => d.amount === null)) return result(null, "學員原單堂價待核對", details);
  const total = details.reduce((sum, d) => sum + d.amount!, 0);
  return Number.isSafeInteger(total) ? result(total, null, details) : result(null, "授課費超過可計算範圍", details);
}
