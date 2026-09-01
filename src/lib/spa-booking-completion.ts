import { parseTaipeiDateTime } from "@/lib/date-utils";

export function canCompleteSpaBooking(
  bookingDate: string,
  bookingTime: string,
  now: Date = new Date(),
): boolean {
  const startsAt = parseTaipeiDateTime(bookingDate, bookingTime);
  return startsAt !== null && startsAt.getTime() <= now.getTime();
}
