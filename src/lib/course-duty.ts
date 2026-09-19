import { generateSlots } from "./slot-generator";
import { resolvedCourseHours, type Hour, type Special } from "./course-business-hours";

const minutes = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/** Duty slots cover their business interval, clipped at the period's end. */
export function courseDutyIntervals(date: string, hours: Hour[], specials: Special[]) {
  return resolvedCourseHours(date, hours, specials).periods.flatMap(period =>
    generateSlots(period.openTime, period.closeTime, period.slotInterval, period.defaultCapacity)
      .map(slot => ({ slotTime: slot.startTime, start: minutes(slot.startTime),
        end: Math.min(minutes(slot.startTime) + period.slotInterval, minutes(period.closeTime)) })),
  );
}

export function dutyCoversCourse(startTime: string, endTime: string,
  intervals: {slotTime: string; start: number; end: number}[], assignedSlots: string[]) {
  let cursor = minutes(startTime);
  const end = minutes(endTime);
  if (end <= cursor) return false;
  const assigned = new Set(assignedSlots);
  for (const interval of intervals.filter(i => assigned.has(i.slotTime)).sort((a,b)=>a.start-b.start)) {
    if (interval.start > cursor) return false;
    if (interval.end > cursor) cursor = interval.end;
    if (cursor >= end) return true;
  }
  return false;
}
