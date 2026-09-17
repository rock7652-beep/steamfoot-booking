import { dayRange, monthRange, parseTaipeiDateTime, toLocalDateStr, toLocalMonthStr } from "@/lib/date-utils";

export type CourseAnalysisRange = { startDate: string; endDate: string };
export function courseAnalysisRange(params: { preset?: string; startDate?: string; endDate?: string; month?: string }): CourseAnalysisRange {
  if (params.startDate || params.endDate) {
    if (!params.startDate || !params.endDate || !parseTaipeiDateTime(params.startDate, "00:00") || !parseTaipeiDateTime(params.endDate, "00:00") || params.startDate > params.endDate)
      throw new Error("請選擇有效的開始與結束日期");
    return { startDate: params.startDate, endDate: params.endDate };
  }
  if (params.preset === "today") return { startDate: toLocalDateStr(), endDate: toLocalDateStr() };
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : toLocalMonthStr();
  const bounds = monthRange(month);
  return { startDate: toLocalDateStr(bounds.start), endDate: toLocalDateStr(bounds.end) };
}
/** Previous adjacent period of identical length; no month-to-date/full-month mismatch. */
export function previousCourseAnalysisRange(range: CourseAnalysisRange): CourseAnalysisRange {
  const start = dayRange(range.startDate).start, end = dayRange(range.endDate).end;
  const length = end.getTime() - start.getTime() + 1;
  return { startDate: toLocalDateStr(new Date(start.getTime() - length)), endDate: toLocalDateStr(new Date(start.getTime() - 1)) };
}
/** Calendar shift clamps leap-day endpoints to the final day of the target month. */
export function shiftCourseCalendarDate(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,"0")}-${String(Math.min(day,last)).padStart(2,"0")}`;
}
export function courseAnalysisPriorYear(range: CourseAnalysisRange): CourseAnalysisRange {
  return { startDate: shiftCourseCalendarDate(range.startDate,-12), endDate: shiftCourseCalendarDate(range.endDate,-12) };
}
export type CourseAnalysisSession = {
  id: string; coachId: string; startsAt: Date; endsAt: Date;
  bookings: { customerId: string; customerName: string; status: string; checkedInAt: Date | null; pointCost: number; card: { unit: string } }[];
};
export function summarizeCourseAttendance(sessions: CourseAnalysisSession[], firstAttendance: Map<string, Date>, range: CourseAnalysisRange) {
  const bounds = { start: dayRange(range.startDate).start, end: dayRange(range.endDate).end };
  const selected = sessions.filter(s => s.startsAt >= bounds.start && s.startsAt <= bounds.end);
  const bookings = selected.flatMap(s => s.bookings).filter(b => b.status !== "CANCELLED");
  const completed = bookings.filter(b => b.status === "ATTENDED");
  const visitors = [...new Set(completed.map(b => b.customerId))];
  const newVisitors = visitors.filter(id => { const first = firstAttendance.get(id); return first && first >= bounds.start && first <= bounds.end; });
  const unknownFirstVisits = visitors.filter(id => !firstAttendance.has(id));
  return {
    sessions: selected.length,
    hours: selected.reduce((n,s)=>n+(s.endsAt.getTime()-s.startsAt.getTime())/3600000,0),
    participants: new Set(bookings.map(b=>b.customerId)).size, participations: bookings.length,
    completed: completed.length, checkedIn: bookings.filter(b=>b.status==="RESERVED" && b.checkedInAt).length,
    noShow: bookings.filter(b=>b.status==="NO_SHOW").length,
    pointsUsed: completed.filter(b=>b.card.unit==="POINT").reduce((n,b)=>n+b.pointCost,0),
    sessionsUsed: completed.filter(b=>b.card.unit==="SESSION").reduce((n,b)=>n+b.pointCost,0),
    visitors, newVisitors, returningVisitors: visitors.filter(id=>!newVisitors.includes(id)&&!unknownFirstVisits.includes(id)), unknownFirstVisits,
    customers: [...new Map(completed.map(b=>[b.customerId,{id:b.customerId,name:b.customerName}])).values()],
    coaches: [...new Set(selected.map(s=>s.coachId))].map(id=>({id,sessions:selected.filter(s=>s.coachId===id).length,completed:selected.filter(s=>s.coachId===id).flatMap(s=>s.bookings).filter(b=>b.status==="ATTENDED").length})),
  };
}
