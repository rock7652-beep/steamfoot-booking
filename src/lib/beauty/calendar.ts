import {courseWeekStart} from '@/lib/course-calendar';
import {dayRange,monthRange,addTaiwanDuration} from '@/lib/date-utils';
/** The same Monday–Sunday range drawn by the shared schedule board. */
export function beautyScheduleRange(date:string,calendar:'day'|'week'|'month'){
 if(calendar==='month')return monthRange(date.slice(0,7));
 if(calendar==='day')return dayRange(date);
 const start=courseWeekStart(date);
 return {start:dayRange(start).start,end:dayRange(addTaiwanDuration(start,6,'DAY')).end};
}

/** Same padded month read as the native sports controller, including cross-month weeks. */
export function beautyNativeCalendarRange(date:string){
 const first=date.slice(0,7)+'-01';
 return {start:dayRange(addTaiwanDuration(first,-6,'DAY')).start,end:dayRange(addTaiwanDuration(addTaiwanDuration(first,1,'MONTH'),5,'DAY')).end};
}

/** Adapt beauty hours to the existing schedule board, including closed weekdays. */
export function beautyStaffAvailability(technicians: {id:string;weekly:unknown;exceptions:unknown}[]) {
 const staffAvailability = technicians.flatMap(t => Array.isArray(t.weekly)
   ? Array.from({length:7},(_,dayOfWeek)=>({staffId:t.id,dayOfWeek,segments:(t.weekly as {day:number;start:string;end:string}[]).filter(p=>p.day===dayOfWeek).map(p=>({openTime:p.start,closeTime:p.end}))})) : []);
 const staffAvailabilityExceptions = technicians.flatMap(t => Object.entries((t.exceptions ?? {}) as Record<string,{start:string;end:string}[]>).map(([date,periods])=>({staffId:t.id,date,type:periods.length?'CUSTOM':'UNAVAILABLE',segments:periods.map(p=>({openTime:p.start,closeTime:p.end})),reason:null})));
 return {staffAvailability,staffAvailabilityExceptions};
}
