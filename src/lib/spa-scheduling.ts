import { parseTaipeiDateTime } from "@/lib/date-utils";

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function validSpaDate(date: string): boolean {
  return parseTaipeiDateTime(date, "00:00") !== null;
}
export function spaEndTime(start: string, durations: { serviceMinutes: number; bufferMinutes: number }[]): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || durations.length === 0 ||
      durations.some(d => !Number.isInteger(d.serviceMinutes) || d.serviceMinutes <= 0 || !Number.isInteger(d.bufferMinutes) || d.bufferMinutes < 0)) {
    throw new Error("服務時間設定不正確");
  }
  const end = minutesOf(start) + durations.reduce((n, d) => n + d.serviceMinutes + d.bufferMinutes, 0);
  if (end > 1440) throw new Error("預約不可跨日，請選擇較早的時間");
  return timeOf(end);
}
export function overlaps(start: string, end: string, otherStart: string, otherEnd: string): boolean {
  return start < otherEnd && end > otherStart;
}
export function staffAvailable(start: string, end: string,
  regular: { startTime: string; endTime: string; isActive: boolean } | null,
  exceptions: { type: string; startTime: string | null; endTime: string | null }[],
): boolean {
  if (exceptions.some(e => e.type === "UNAVAILABLE" && overlaps(start, end, e.startTime ?? "00:00", e.endTime ?? "24:00"))) return false;
  const available = exceptions.filter(e => e.type === "AVAILABLE").map(e => ({ startTime: e.startTime ?? "00:00", endTime: e.endTime ?? "24:00" }));
  if (regular?.isActive) available.push(regular);
  const ranges = available.sort((a, b) => a.startTime.localeCompare(b.startTime));
  let covered = start;
  for (const range of ranges) {
    if (range.startTime > covered) break;
    if (range.endTime > covered) covered = range.endTime;
    if (covered >= end) return true;
  }
  return false;
}
export function applicableLocations<T extends { id: string }>(locations: T[], treatmentLocationIds: string[][]): T[] {
  return locations.filter(location => treatmentLocationIds.every(ids => ids.includes(location.id)));
}
