import "server-only";
import { AppError } from "@/lib/errors";
import { courseSelfBookingEnabled, COURSE_SELF_BOOKING_DISABLED_MESSAGE } from "@/lib/course-self-booking";

/** Apply only to new student reservations/joins/reschedules, never generic member access. */
export function assertCourseSelfBookingEnabled(rule: { selfBookingEnabled?: boolean } | null | undefined) {
  if (!courseSelfBookingEnabled(rule)) throw new AppError("FORBIDDEN", COURSE_SELF_BOOKING_DISABLED_MESSAGE);
}
