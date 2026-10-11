import "server-only";
import { AppError } from "@/lib/errors";
import { courseSelfBookingEnabled, courseSelfLeaveEnabled, courseSelfRescheduleEnabled, COURSE_SELF_BOOKING_DISABLED_MESSAGE } from "@/lib/course-self-booking";

/** Apply only to new student reservations/joins/reschedules, never generic member access. */
export function assertCourseSelfBookingEnabled(rule: { selfBookingEnabled?: boolean } | null | undefined) {
  if (!courseSelfBookingEnabled(rule)) throw new AppError("FORBIDDEN", COURSE_SELF_BOOKING_DISABLED_MESSAGE);
}

export function assertCourseSelfLeaveEnabled(rule: {selfLeaveEnabled?:boolean}|null|undefined) {
 if(!courseSelfLeaveEnabled(rule))throw new AppError("FORBIDDEN","請假請聯繫店家");
}
export function assertCourseSelfRescheduleEnabled(rule: {selfBookingEnabled?:boolean;selfRescheduleEnabled?:boolean}|null|undefined) {
 if(!courseSelfRescheduleEnabled(rule))throw new AppError("FORBIDDEN","改期請聯繫店家");
}
