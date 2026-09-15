import { z } from "zod";
import {
  generateWeeklyDateStrings,
  parseTaipeiDateTime,
} from "@/lib/date-utils";

const id = z.string().min(1, "請選擇資料").max(100);
const date = z
  .string()
  .refine((value) => !!parseTaipeiDateTime(value, "00:00"), "請填寫有效日期");
export const courseTemplateInput = z.object({
  name: z.string().trim().min(1, "請填寫課程名稱").max(80),
  defaultRoomId: id,
  durationMinutes: z.number().int().min(1).max(480),
  pointCost: z.number().int().min(1).max(10000),
  capacity: z.number().int().min(1).max(500),
});
export const courseScheduleInput = z.object({
  templateId: id,
  roomId: id,
  coachId: id,
  date,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "請填寫有效時間"),
  durationMinutes: z.number().int().min(1).max(480),
  capacity: z.number().int().min(1).max(500),
  repeatUntil: date.optional(),
  requestKey: z.string().uuid(),
});
export type CourseScheduleInput = z.infer<typeof courseScheduleInput>;

export function buildCourseOccurrences(input: CourseScheduleInput) {
  const parsed = courseScheduleInput.parse(input);
  if (parsed.repeatUntil && parsed.repeatUntil < parsed.date)
    throw new Error("結束日期不能早於開始日期");
  const dates = parsed.repeatUntil
    ? generateWeeklyDateStrings(parsed.date, 53).filter(
        (day) => day <= parsed.repeatUntil!,
      )
    : [parsed.date];
  const maxDate = generateWeeklyDateStrings(parsed.date, 53)[52];
  if (parsed.repeatUntil && parsed.repeatUntil > maxDate)
    throw new Error("一次最多安排 53 週課程");
  return dates.map((day) => {
    const startsAt = parseTaipeiDateTime(day, parsed.time)!;
    return {
      startsAt,
      endsAt: new Date(startsAt.getTime() + parsed.durationMinutes * 60000),
    };
  });
}

export function courseIntervalsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
