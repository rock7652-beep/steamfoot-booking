import { monthRange, toLocalMonthStr } from "@/lib/date-utils";

/** Quota unit = one created attendee booking, including cancelled/no-show/trial.
 * Creation month in Taipei, not class date. Shared by display and locked reservation. */
export function courseMonthlyBookingWhere(storeId: string, now = new Date()) {
  const { start, end } = monthRange(toLocalMonthStr(now));
  return { storeId, createdAt: { gte: start, lte: end } };
}
