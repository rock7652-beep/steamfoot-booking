import { addTaiwanDuration } from "@/lib/date-utils";

/**
 * 產生可預約日期清單（含起訖日），日期皆為台灣 YYYY-MM-DD 字串。
 *
 * 呼叫端負責先用 resolveBookableUntilDate() 算出 bookableUntil；
 * 這裡只做純日期列舉，避免後台 UI 各自手寫 today + N 天。
 */
export function enumerateBookableDates(
  todayStr: string,
  bookableUntil: string,
): string[] {
  if (bookableUntil < todayStr) return [];

  const days: string[] = [];
  for (let date = todayStr; date <= bookableUntil; date = addTaiwanDuration(date, 1, "DAY")) {
    days.push(date);
  }
  return days;
}
