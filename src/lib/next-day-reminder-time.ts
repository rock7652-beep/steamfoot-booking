import { parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import { CUSTOMER_NEXT_DAY_REMINDER_TIME } from './reminder-schedule';

/** Customer next-day appointment reminders use the Taiwan 18:00 trigger.
 * The short cron window tolerates execution delay; it is not an evening-wide
 * catch-up window. Existing failed deliveries keep their original identity. */
export function nextDayReminderTriggerAt(now: Date): Date {
  return nextDayReminderForDate(toLocalDateStr(now));
}
export function nextDayReminderForDate(date: string): Date {
  return parseTaipeiDateTime(date, CUSTOMER_NEXT_DAY_REMINDER_TIME)!;
}
export function isNextDayReminderBatch(now: Date): boolean {
  const elapsed = now.getTime() - nextDayReminderTriggerAt(now).getTime();
  return elapsed >= 0 && elapsed < 5 * 60 * 1000;
}
