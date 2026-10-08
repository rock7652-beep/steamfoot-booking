/** Missing legacy rules retain the existing student self-booking behavior. */
export function courseSelfBookingEnabled(rule: { selfBookingEnabled?: boolean } | null | undefined): boolean {
  return rule?.selfBookingEnabled !== false;
}

export const COURSE_SELF_BOOKING_DISABLED_MESSAGE = "如需預約或調整時間，請聯繫店家";
