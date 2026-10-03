export const COURSE_START_INTERVAL_MINUTES = 30;
export const COURSE_DURATION_OPTIONS = [30, 60, 90, 120] as const;

export type AvailabilityPeriod = { openTime: string; closeTime: string };

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeAvailabilityPeriods(value: unknown): AvailabilityPeriod[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      if (!validTime(row.openTime) || !validTime(row.closeTime) || row.openTime >= row.closeTime) return null;
      return { openTime: row.openTime, closeTime: row.closeTime };
    })
    .filter((item): item is AvailabilityPeriod => !!item)
    .sort((a, b) => a.openTime.localeCompare(b.openTime));
}

export function minuteOfDay(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function periodContains(periods: AvailabilityPeriod[], startTime: string, durationMinutes = COURSE_START_INTERVAL_MINUTES) {
  const start = minuteOfDay(startTime);
  const end = start + durationMinutes;
  return periods.some((period) => start >= minuteOfDay(period.openTime) && end <= minuteOfDay(period.closeTime));
}

export function intersectAvailabilityPeriods(a: AvailabilityPeriod[], b: AvailabilityPeriod[]) {
  const result: AvailabilityPeriod[] = [];
  for (const left of a) {
    for (const right of b) {
      const start = Math.max(minuteOfDay(left.openTime), minuteOfDay(right.openTime));
      const end = Math.min(minuteOfDay(left.closeTime), minuteOfDay(right.closeTime));
      if (start < end) {
        const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        result.push({ openTime: format(start), closeTime: format(end) });
      }
    }
  }
  return result;
}

/** Return original row indexes, so overlapping and reversed intervals can be corrected in place. */
export function availabilityPeriodErrors(periods:AvailabilityPeriod[]):Record<number,string> {
 const errors:Record<number,string>={};
 periods.forEach((p,i)=>{if(!validTime(p.openTime)||!validTime(p.closeTime))errors[i]='請填完整時間';else if(p.openTime>=p.closeTime)errors[i]='結束需晚於開始';});
 periods.forEach((p,i)=>{if(p.openTime>=p.closeTime||!validTime(p.openTime)||!validTime(p.closeTime))return;periods.forEach((other,j)=>{if(j<=i||other.openTime>=other.closeTime||!validTime(other.openTime)||!validTime(other.closeTime))return;if(p.openTime<other.closeTime&&other.openTime<p.closeTime){errors[i]='與其他時段重疊';errors[j]='與其他時段重疊';}});});
 return errors;
}
