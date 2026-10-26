import { parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";

/** All next-day appointment reminders use the same Taiwan 18:00 trigger.
 * The short cron window tolerates execution delay; it is not an evening-wide
 * catch-up window. Existing failed deliveries keep their original identity. */
export function nextDayReminderTriggerAt(now: Date): Date {
  return nextDayReminderForDate(toLocalDateStr(now));
}
export function nextDayReminderForDate(date: string): Date {
  return parseTaipeiDateTime(date, "18:00")!;
}
export function isNextDayReminderBatch(now: Date): boolean {
  const elapsed = now.getTime() - nextDayReminderTriggerAt(now).getTime();
  return elapsed >= 0 && elapsed < 5 * 60 * 1000;
}
