import { buildCourseOccurrences, type CourseScheduleInput } from "@/lib/course-scheduling";
import { addTaiwanDuration, generateWeeklyDateStrings, parseLocalDate, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";


export function shiftCourseOccurrenceDates(dates: string[], index: number, nextDate: string) {
  const serial = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const [year, month, day] = value.split("-").map(Number);
    const stamp = Date.UTC(year, month - 1, day);
    return new Date(stamp).toISOString().slice(0, 10) === value ? stamp : NaN;
  };
  if (!Number.isInteger(index) || index < 0 || index >= dates.length || !Number.isFinite(serial(nextDate))) {
    throw new Error("請選擇有效日期");
  }
  if (index > 0 && nextDate <= dates[index - 1]) throw new Error("日期需晚於上一堂");
  const delta = (serial(nextDate) - serial(dates[index])) / 86400000;
  return dates.map((date, position) => {
    if (position < index) return date;
    const shifted = new Date(serial(date) + delta * 86400000);
    return shifted.toISOString().slice(0, 10);
  });
}

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
