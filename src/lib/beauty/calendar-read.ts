import type {BeautyDashboardData} from '@/server/beauty/queries';
export type BeautyCalendarData=Pick<BeautyDashboardData,'date'|'calendar'|'items'|'calendarDays'>;
export async function readBeautyCalendar(date:string,calendar:BeautyDashboardData['calendar'],slug:string):Promise<{success:true;data:BeautyCalendarData}|{success:false;error:string}>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const r=await fetch('/api/beauty/calendar?'+new URLSearchParams({date,calendar,store:slug}),{cache:'no-store',credentials:'same-origin',signal:controller.signal});const value=await r.json();if(!value||typeof value.success!=='boolean'||(!r.ok&&value.success))throw Error('讀取失敗');return value;}finally{clearTimeout(timer);}
}
