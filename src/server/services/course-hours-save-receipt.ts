import "server-only";
import {createHash} from "node:crypto";
import {resolvedCourseHours,type Hour,type Special} from "@/lib/course-business-hours";
import {parseBusinessPeriods} from "@/lib/business-periods";
import {addTaiwanDuration} from "@/lib/date-utils";
import type {courseDayHoursValues} from "@/lib/course-day-hours-save";
import type {z} from "zod";
import type {courseTransaction} from "@/server/services/course-access";
export type CourseHoursState={hours:Hour[];specials:(Special&{id:string})[]};
export async function readCourseHoursState(tx:Parameters<Parameters<typeof courseTransaction>[1]>[0],storeId:string):Promise<CourseHoursState>{
 const hours=await tx.$queryRaw<Hour[]>`SELECT "dayOfWeek","isOpen","openTime","closeTime",segments,"slotInterval","defaultCapacity" FROM "BusinessHours" WHERE "storeId"=${storeId}`;
 const specials=await tx.$queryRaw<(Special&{id:string})[]>`SELECT id,date,type,reason,"openTime","closeTime",segments,"slotInterval","defaultCapacity" FROM "SpecialBusinessDay" WHERE "storeId"=${storeId}`;
 return {hours,specials};
}
function periods(row:Hour|Special){return parseBusinessPeriods(row.segments,{...row,slotInterval:row.slotInterval??60,defaultCapacity:row.defaultCapacity??6}).sort((a,b)=>a.openTime.localeCompare(b.openTime)).map(p=>[p.openTime,p.closeTime,p.slotInterval,p.defaultCapacity]);}
export function courseHoursRevision(state:CourseHoursState){
 const hours=[...state.hours].sort((a,b)=>a.dayOfWeek-b.dayOfWeek).map(r=>[r.dayOfWeek,r.isOpen,r.openTime,r.closeTime,r.slotInterval,r.defaultCapacity,periods(r)]);
 const specials=[...state.specials].sort((a,b)=>a.date.getTime()-b.date.getTime()).map(r=>[r.date.toISOString().slice(0,10),r.type,r.reason,r.openTime,r.closeTime,r.slotInterval,r.defaultCapacity,periods(r)]);
 return createHash("sha256").update(JSON.stringify([hours,specials])).digest("hex");
}
/** Simulate only fields written by the mutation, so lost-response retries do not write again. */
export function intendedCourseHours(state:CourseHoursState,d:z.infer<typeof courseDayHoursValues>,interval:number):CourseHoursState{
 const open=d.status==="open"||d.status==="custom",sorted=[...d.periods].sort((a,b)=>a.openTime.localeCompare(b.openTime));
 const segments=sorted.map(p=>({...p,slotInterval:interval,defaultCapacity:6}));
 const openTime=open?sorted[0]?.openTime??null:null,closeTime=open?sorted.at(-1)?.closeTime??null:null;
 let hours=[...state.hours],specials=[...state.specials];
 if(["weekly","permanent","template"].includes(d.mode)){
  const dayOfWeek=new Date(d.date+"T00:00:00Z").getUTCDay(),old=hours.find(h=>h.dayOfWeek===dayOfWeek);
  hours=[...hours.filter(h=>h.dayOfWeek!==dayOfWeek),{dayOfWeek,isOpen:open,openTime,closeTime,segments,slotInterval:interval,defaultCapacity:old?.defaultCapacity??6}];
 }
 const count=d.mode==="copy"||d.mode==="template"?d.weeks:0;
 for(let week=0;d.mode!=="weekly"&&week<=count;week++){
  const dateStr=addTaiwanDuration(d.date,week*7,"DAY"),old=specials.find(s=>s.date.toISOString().slice(0,10)===dateStr);
  specials=specials.filter(s=>s.date.toISOString().slice(0,10)!==dateStr);
  if(!["permanent","template"].includes(d.mode)&&d.status!=="open")specials.push({id:old?.id??"",date:new Date(dateStr+"T00:00:00Z"),type:d.status,reason:d.reason||null,openTime,closeTime,segments,slotInterval:interval,defaultCapacity:old?.defaultCapacity??null});
 }
 return {hours,specials};
}
export function courseDayDetail(state:CourseHoursState,date:string,interval:number){
 const value=resolvedCourseHours(date,state.hours,state.specials);
 return {...value,specialDayId:state.specials.find(s=>s.date.toISOString().slice(0,10)===date)?.id??null,slots:[],slotInterval:interval,defaultCapacity:6,weeklyDefault:state.hours.find(h=>h.dayOfWeek===value.dayOfWeek)??null,hoursRevision:courseHoursRevision(state)};
}
export function courseHoursReceiptData(state:CourseHoursState,date:string,interval:number){
 const names=["週日","週一","週二","週三","週四","週五","週六"],prefix=date.slice(0,7),[year,month]=prefix.split("-").map(Number);
 const weekly=names.map((dayName,dayOfWeek)=>{const r=state.hours.find(h=>h.dayOfWeek===dayOfWeek);return {dayName,dayOfWeek,persisted:!!r,isOpen:r?.isOpen??true,openTime:r?.openTime??null,closeTime:r?.closeTime??null,slotInterval:r?.slotInterval??interval,defaultCapacity:r?.defaultCapacity??6,periods:r?parseBusinessPeriods(r.segments,r):[]};});
 const specials=state.specials.filter(r=>r.date.toISOString().startsWith(prefix)).map(r=>({id:r.id,date:r.date.toISOString().slice(0,10),type:r.type,reason:r.reason,openTime:r.openTime,closeTime:r.closeTime}));
 const summary:Record<string,{status:"open"|"closed"|"training"|"custom";openTime:string|null;closeTime:string|null;slotCount:number;overrideCount:number}>={};
 for(let n=1;n<=new Date(Date.UTC(year,month,0)).getUTCDate();n++){const day=`${prefix}-${String(n).padStart(2,"0")}`;summary[day]={...resolvedCourseHours(day,state.hours,state.specials),slotCount:0,overrideCount:0};}
 return {date,day:courseDayDetail(state,date,interval),weekly,specials,summary};
}
