import { addTaiwanDuration, formatTWDateTime, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";

export type FixedCourseSeries = {
  requestKey: string;
  roomId: string;
  coachId: string;
  startsAt: Date;
  endsAt: Date;
  frequency: string;
  untilDate: Date | null;
  excludedDates: string[];
  cancelledAt: Date | null;
};

export type CourseRange = { startsAt: Date; endsAt: Date };

/** Return a fixed-series occurrence on a local Taipei calendar date, if any. */
export function fixedSeriesOccurrenceOnDate(series: FixedCourseSeries, date: string): CourseRange | null {
  if (series.cancelledAt) return null;
  const firstDate = toLocalDateStr(series.startsAt);
  if (date < firstDate || (series.untilDate && date > toLocalDateStr(series.untilDate)) || series.excludedDates.includes(date)) return null;
  const first = Date.parse(`${firstDate}T12:00:00Z`);
  const current = Date.parse(`${date}T12:00:00Z`);
  const day = Math.round((current - first) / 86_400_000);
  const cadence = series.frequency === "BIWEEKLY" ? 14 : 7;
  if (day < 0 || day % cadence !== 0) return null;
  const time = formatTWDateTime(series.startsAt).slice(11, 16);
  const startsAt = parseTaipeiDateTime(date, time);
  if (!startsAt) return null;
  return { startsAt, endsAt: new Date(startsAt.getTime() + series.endsAt.getTime() - series.startsAt.getTime()) };
}

export function findFixedSeriesConflicts(
  series: FixedCourseSeries[],
  ranges: CourseRange[],
  resources: { roomId: string; coachId: string },
  excludeRequestKey?: string,
) {
  const conflicts: { date: string; reason: string; startsAt: Date }[] = [];
  const dates = new Set<string>();
  for (const range of ranges) {
    const lastDate = toLocalDateStr(new Date(range.endsAt.getTime() - 1));
    for (let date = addTaiwanDuration(toLocalDateStr(range.startsAt), -1, "DAY"); date <= lastDate; date = addTaiwanDuration(date, 1, "DAY")) dates.add(date);
  }
  for (const rule of series) {
    if (rule.requestKey === excludeRequestKey || (rule.roomId !== resources.roomId && rule.coachId !== resources.coachId)) continue;
    for (const date of dates) {
      const occurrence = fixedSeriesOccurrenceOnDate(rule, date);
      if (!occurrence) continue;
      const range = ranges.find(item => item.startsAt < occurrence.endsAt && item.endsAt > occurrence.startsAt);
      if (!range) continue;
      conflicts.push({ date:toLocalDateStr(range.startsAt), startsAt: occurrence.startsAt, reason: `${formatTWDateTime(occurrence.startsAt).slice(11, 16)} ${rule.roomId === resources.roomId ? "教室" : "老師"}已有固定課` });
    }
  }
  return conflicts;
}

/** Build a bounded batch for the calendar while the rule itself stays open-ended. */
export function buildNextFixedSeriesOccurrences(series: FixedCourseSeries, afterDate: string, count = 53) {
  const dates: string[] = [];
  let date = toLocalDateStr(series.startsAt);
  const cadence = series.frequency === "BIWEEKLY" ? 14 : 7;
  for (let index = 0; index < 3000 && dates.length < count; index++) {
    date = addTaiwanDuration(toLocalDateStr(series.startsAt), index * cadence, "DAY");
    if (date <= afterDate || (series.untilDate && date > toLocalDateStr(series.untilDate))) continue;
    if (!series.excludedDates.includes(date)) dates.push(date);
  }
  return dates.map(date => {
    const range = fixedSeriesOccurrenceOnDate(series, date);
    return range;
  }).filter((range): range is CourseRange => !!range);
}

/** A new ongoing rule must also check reservations after the calendar's current window. */
export function findOngoingFixedSeriesConflicts(proposed:FixedCourseSeries,rules:FixedCourseSeries[],occupied:Array<CourseRange & {roomId:string;coachId?:string}>) {
  const issues:{date:string;reason:string}[]=[];
  for(const rule of rules){
    if(rule.requestKey===proposed.requestKey||rule.cancelledAt||rule.roomId!==proposed.roomId&&rule.coachId!==proposed.coachId)continue;
    const anchor=toLocalDateStr(rule.startsAt>proposed.startsAt?rule.startsAt:proposed.startsAt);
    // Two weekly/biweekly patterns repeat within fourteen days. Each excluded
    // date can defer the first overlap by at most one additional fortnight.
    for(let day=0;day<28+14*(rule.excludedDates.length+proposed.excludedDates.length);day++){
      const date=addTaiwanDuration(anchor,day,"DAY");
      if(proposed.untilDate&&date>toLocalDateStr(proposed.untilDate)||rule.untilDate&&date>addTaiwanDuration(toLocalDateStr(rule.untilDate),1,"DAY"))break;
      const range=fixedSeriesOccurrenceOnDate(proposed,date);
      if(!range)continue;
      const conflict=findFixedSeriesConflicts([rule],[range],proposed)[0];
      if(conflict){issues.push({date:conflict.date,reason:conflict.reason});break;}
    }
  }
  for(const item of occupied){
    if(item.roomId!==proposed.roomId&&(!item.coachId||item.coachId!==proposed.coachId))continue;
    const first=addTaiwanDuration(toLocalDateStr(item.startsAt),-1,"DAY"),last=toLocalDateStr(item.endsAt);
    for(let date=first;date<=last;date=addTaiwanDuration(date,1,"DAY")){
      const range=fixedSeriesOccurrenceOnDate(proposed,date);
      if(range&&range.startsAt<item.endsAt&&range.endsAt>item.startsAt){issues.push({date:toLocalDateStr(range.startsAt),reason:item.roomId===proposed.roomId?"教室已有課程或租借":"老師已有課程"});break;}
    }
  }
  return issues;
}
