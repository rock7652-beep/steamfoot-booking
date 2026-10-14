import { addTaiwanDuration, parseTaipeiDateTime } from "@/lib/date-utils";

export type FixedScheduleFrequency = "WEEKLY" | "BIWEEKLY";
export type FixedScheduleDates = { dates: string[]; lastSupportedDate: string; error?: string };

/** Build the dates shown by the music fixed-course form before saving. */
export function buildFixedScheduleDates(startDate: string, frequency: FixedScheduleFrequency, validUntil?: string): FixedScheduleDates {
  const intervalDays = frequency === "BIWEEKLY" ? 14 : 7;
  const lastSupportedDate = parseTaipeiDateTime(startDate, "00:00")
    ? addTaiwanDuration(startDate, 52 * intervalDays, "DAY")
    : startDate;
  if (!parseTaipeiDateTime(startDate, "00:00")) return { dates: [], lastSupportedDate, error: "請選擇有效的開始日期" };
  if (validUntil && !parseTaipeiDateTime(validUntil, "00:00")) return { dates: [], lastSupportedDate, error: "請選擇有效的期限" };
  if (validUntil && validUntil < startDate) return { dates: [], lastSupportedDate, error: "有效期限不能早於開始日期" };
  if (validUntil && validUntil > lastSupportedDate) return { dates: [], lastSupportedDate, error: "目前一次最多安排未來 53 次，請縮短有效期限" };
  const endDate = validUntil || lastSupportedDate;
  const distance = Math.floor((Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) / 86400000);
  const count = Math.min(53, Math.floor(distance / intervalDays) + 1);
  return { dates: Array.from({ length: count }, (_, index) => addTaiwanDuration(startDate, index * intervalDays, "DAY")), lastSupportedDate };
}
