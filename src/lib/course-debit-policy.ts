import type { CourseBusinessProfile } from "./store-business-profile";

export type CourseSettlementTarget = "CANCELLED" | "ATTENDED" | "CHECKED_IN" | "NO_SHOW" | "STUDENT_LEAVE";
type Context = { target: CourseSettlementTarget; hasCard: boolean; classType?: string | null };

const fitnessDebitPolicy = (context: Context) => ({
  groupLeaveForfeited: false,
  shouldDebit: context.target === "ATTENDED" || (context.target === "NO_SHOW" && context.hasCard),
  allowsNoShowMakeup: false,
});
const musicDebitPolicy = (context: Context) => {
  const groupLeaveForfeited = context.target === "STUDENT_LEAVE" && context.hasCard && context.classType === "GROUP";
  return {
    groupLeaveForfeited,
    shouldDebit: context.target === "ATTENDED" || (context.target === "NO_SHOW" && context.hasCard) || groupLeaveForfeited,
    allowsNoShowMakeup: false,
  };
};

/** Policies decide; the transaction owns authorization, balance updates and ledger writes. */
export function courseDebitPolicy(profile: CourseBusinessProfile, context: Context) {
  return profile === "MUSIC" ? musicDebitPolicy(context) : fitnessDebitPolicy(context);
}

/** Historical debit state survives a later change of the store business profile. */
export function courseBookingWasDebited(booking: { status: string; absenceKind?: string | null }) {
  return booking.status === "ATTENDED" || booking.status === "NO_SHOW" || booking.absenceKind === "GROUP_LEAVE_FORFEITED";
}

/** Corrections clear leave markers; RESERVED and CANCELLED release the original debit. */
export function correctedCourseBookingWillDebit(target: "RESERVED" | "ATTENDED" | "NO_SHOW" | "CANCELLED") {
  return target === "ATTENDED" || target === "NO_SHOW";
}
