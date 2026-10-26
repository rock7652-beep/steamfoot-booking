/** Taiwan local times for next-day reminders; these do not enable delivery. */
import {parseTaipeiDateTime,toLocalDateStr} from './date-utils';
export const CUSTOMER_NEXT_DAY_REMINDER_TIME = '18:00';
export const PERSONNEL_NEXT_DAY_REMINDER_TIME = '21:00';
export const NEXT_DAY_REMINDER_SCHEDULE = `明日提醒（台灣時間）：顧客前一天 ${CUSTOMER_NEXT_DAY_REMINDER_TIME}；教師／教練／技師前一天 ${PERSONNEL_NEXT_DAY_REMINDER_TIME}。`;
export function isPersonnelReminderBatch(now:Date) {
  const elapsed=now.getTime()-parseTaipeiDateTime(toLocalDateStr(now),PERSONNEL_NEXT_DAY_REMINDER_TIME)!.getTime();
  return elapsed>=0&&elapsed<10*60_000;
}
