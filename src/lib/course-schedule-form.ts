import { buildCourseOccurrences, type CourseScheduleInput } from "@/lib/course-scheduling";
import { addTaiwanDuration, generateWeeklyDateStrings, parseLocalDate, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";

export function courseWeeklyDates(date: string, weeks: number, extraWeekdays: number[] = []) {
  if (!parseTaipeiDateTime(date, "00:00")) throw new Error("請先選擇日期");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 53) throw new Error("請輸入 1–53 週");
  if (extraWeekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("上課日不正確");
  const startDay = parseLocalDate(date).getDay();
  const weekdays = [...new Set([startDay, ...extraWeekdays])];
  const dates = [...new Set(weekdays.flatMap(day => generateWeeklyDateStrings(addTaiwanDuration(date, (day - startDay + 7) % 7, "DAY"), weeks)))].sort();
  if (dates.length > 53) throw new Error("一次最多安排 53 堂，請減少週數或上課日");
  return dates;
}

export function courseScheduleFormFields(fields: FormData, defaults: { templateId: string; requestKey: string }): CourseScheduleInput {
  const mode = String(fields.get("repeatMode") || "once");
  const weeklyDates = mode === "weekly" && fields.has("repeatWeeks")
    ? courseWeeklyDates(String(fields.get("date") || ""), Number(fields.get("repeatWeeks")), fields.getAll("weekday").map(Number))
    : null;
  return {
    templateId: String(fields.get("templateId") || defaults.templateId),
    roomId: String(fields.get("roomId") || ""),
    coachId: String(fields.get("coachId") || ""),
    date: String(fields.get("date") || ""),
    time: String(fields.get("time") || ""),
    durationMinutes: Number(fields.get("duration")),
    capacity: Number(fields.get("capacity")),
    requestKey: defaults.requestKey,
    repeatUntil: mode === "weekly" && !weeklyDates ? String(fields.get("until") || "") : undefined,
    weekdays: mode === "weekly" && !weeklyDates && fields.getAll("weekday").length ? fields.getAll("weekday").map(Number) : undefined,
    additionalDates: weeklyDates ? weeklyDates.filter(date => date !== fields.get("date")) : mode === "dates" ? fields.getAll("additionalDates").map(String) : undefined,
  };
}

export function courseScheduleCreatedDates(fields: FormData, defaults: { templateId: string; requestKey: string }) {
  return buildCourseOccurrences(courseScheduleFormFields(fields, defaults)).map(occurrence => toLocalDateStr(occurrence.startsAt));
}
