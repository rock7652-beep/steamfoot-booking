/** Missing legacy rules retain the existing student self-booking behavior. */
export function courseSelfBookingEnabled(rule: { selfBookingEnabled?: boolean } | null | undefined): boolean {
  return rule?.selfBookingEnabled !== false;
}

export const COURSE_SELF_BOOKING_DISABLED_MESSAGE = "如需預約，請聯繫店家";

export function courseSelfLeaveEnabled(rule: {selfLeaveEnabled?:boolean}|null|undefined) { return rule?.selfLeaveEnabled !== false; }
export function courseSelfRescheduleEnabled(rule: {selfBookingEnabled?:boolean;selfRescheduleEnabled?:boolean}|null|undefined) {
  return rule?.selfRescheduleEnabled ?? courseSelfBookingEnabled(rule);
}
