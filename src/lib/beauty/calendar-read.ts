import {beautyScheduleRange} from './calendar';
import {dayRange} from '@/lib/date-utils';
import type {BeautyDashboardData} from '@/server/beauty/queries';
export type BeautyCalendarData=Pick<BeautyDashboardData,'date'|'calendar'|'items'|'calendarDays'>&{rentals?:BeautyDashboardData['rentals']};
export async function readBeautyCalendar(date:string,calendar:BeautyDashboardData['calendar'],slug:string):Promise<{success:true;data:BeautyCalendarData}|{success:false;error:string}>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const r=await fetch('/api/beauty/calendar?'+new URLSearchParams({date,calendar,store:slug}),{cache:'no-store',credentials:'same-origin',signal:controller.signal});const value=await r.json();if(!value||typeof value.success!=='boolean'||(!r.ok&&value.success))throw Error('讀取失敗');return value;}finally{clearTimeout(timer);}
}

/** Display-only projection. All controls stay pending until the authorized read returns. */
export function projectBeautyCalendar(source:BeautyCalendarData,date:string,calendar:BeautyDashboardData['calendar']):BeautyCalendarData|null {
 const range=beautyScheduleRange(date,calendar);
 const days=Object.entries(source.calendarDays).filter(([d])=>dayRange(d).start>=range.start&&dayRange(d).end<=range.end);
 const expected=Math.round((+range.end-+range.start+1)/86400000);
 if(days.length!==expected)return null;
 return {date,calendar,rentals:source.rentals?.filter(r=>+new Date(r.occupiedStartsAt)<+range.end&&+new Date(r.occupiedEndsAt)>+range.start),calendarDays:Object.fromEntries(days),items:source.items.filter(b=>+new Date(b.startsAt)>=+range.start&&+new Date(b.startsAt)<=+range.end)};
}
