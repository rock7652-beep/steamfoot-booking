import {courseWeekStart} from '@/lib/course-calendar';
import {dayRange,monthRange,addTaiwanDuration} from '@/lib/date-utils';
/** The same Monday–Sunday range drawn by the shared schedule board. */
export function beautyScheduleRange(date:string,calendar:'day'|'week'|'month'){
 if(calendar==='month')return monthRange(date.slice(0,7));
 if(calendar==='day')return dayRange(date);
 const start=courseWeekStart(date);
 return {start:dayRange(start).start,end:dayRange(addTaiwanDuration(start,6,'DAY')).end};
}
