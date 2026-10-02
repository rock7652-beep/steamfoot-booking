import { buildCourseOccurrences, type CourseScheduleInput } from "@/lib/course-scheduling";
import { toLocalDateStr } from "@/lib/date-utils";

export function courseScheduleFormFields(fields: FormData, defaults: { templateId: string; requestKey: string }): CourseScheduleInput {
  const mode = String(fields.get("repeatMode") || "once");
  return {
    templateId: String(fields.get("templateId") || defaults.templateId),
    roomId: String(fields.get("roomId") || ""),
    coachId: String(fields.get("coachId") || ""),
    date: String(fields.get("date") || ""),
    time: String(fields.get("time") || ""),
    durationMinutes: Number(fields.get("duration")),
    capacity: Number(fields.get("capacity")),
    requestKey: defaults.requestKey,
    repeatUntil: mode === "weekly" ? String(fields.get("until") || "") : undefined,
    weekdays: mode === "weekly" && fields.getAll("weekday").length ? fields.getAll("weekday").map(Number) : undefined,
    additionalDates: mode === "dates" ? fields.getAll("additionalDates").map(String) : undefined,
  };
}

export function courseScheduleCreatedDates(fields: FormData, defaults: { templateId: string; requestKey: string }) {
  return buildCourseOccurrences(courseScheduleFormFields(fields, defaults)).map(occurrence => toLocalDateStr(occurrence.startsAt));
}
