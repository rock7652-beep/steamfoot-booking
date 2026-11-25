import { parseTaipeiDateTime } from "@/lib/date-utils";

const BOOKING_LEAD_MS = 30 * 60 * 1000;

export const STEAM_SLOT_CLOSED_LABEL = "已截止預約";
export const STEAM_SLOT_CLOSED_MESSAGE = "此時段已截止預約，請選擇其他時段。";

export function steamBookingTimeLeft(date: string, slot: string, now = Date.now()): number {
  const startsAt = parseTaipeiDateTime(date, slot);
  return startsAt ? startsAt.getTime() - BOOKING_LEAD_MS - now : -1;
}
