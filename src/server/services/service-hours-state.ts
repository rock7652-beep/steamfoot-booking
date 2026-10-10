import "server-only";
import {createHash} from "node:crypto";
import type {Prisma} from "@prisma/client";
import {resolveDayRule,buildBusinessHoursMap,buildSpecialDayMap,applySlotOverrides,type BusinessHoursRow,type SpecialDayRow,type SlotOverrideRow} from "@/lib/business-hours-resolver";
import {parseBusinessPeriods} from "@/lib/business-periods";
import {generateSlots} from "@/lib/slot-generator";
export type ServiceHoursState={hours:BusinessHoursRow[];specials:(SpecialDayRow&{id:string})[];overrides:SlotOverrideRow[]};
export async function readServiceHoursState(tx:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string):Promise<ServiceHoursState>{
 const [hours,specials,overrides]=await Promise.all([
  tx.$queryRaw<BusinessHoursRow[]>`SELECT "dayOfWeek","isOpen","openTime","closeTime","slotInterval","defaultCapacity",segments FROM "BusinessHours" WHERE "storeId"=${storeId}`,
  tx.$queryRaw<ServiceHoursState["specials"]>`SELECT id,date,type,reason,"openTime","closeTime","slotInterval","defaultCapacity",segments FROM "SpecialBusinessDay" WHERE "storeId"=${storeId}`,
  tx.$queryRaw<SlotOverrideRow[]>`SELECT date,"startTime",type,capacity,reason FROM "SlotOverride" WHERE "storeId"=${storeId}`,
 ]);return {hours,specials,overrides};
}
export const serviceDate=(row:{date:Date})=>row.date.toISOString().slice(0,10);
export function serviceHoursRevision(state:ServiceHoursState){
 const periods=(r:BusinessHoursRow|SpecialDayRow)=>parseBusinessPeriods(r.segments,{...r,slotInterval:r.slotInterval??60,defaultCapacity:r.defaultCapacity??6}).map(p=>[p.openTime,p.closeTime,p.slotInterval,p.defaultCapacity]);
 return createHash("sha256").update(JSON.stringify([
 [...state.hours].sort((a,b)=>a.dayOfWeek-b.dayOfWeek).map(r=>[r.dayOfWeek,r.isOpen,r.openTime,r.closeTime,r.slotInterval,r.defaultCapacity,periods(r)]),
 [...state.specials].sort((a,b)=>a.date.getTime()-b.date.getTime()).map(r=>[serviceDate(r),r.type,r.reason,r.openTime,r.closeTime,r.slotInterval,r.defaultCapacity,periods(r)]),
 [...state.overrides].sort((a,b)=>serviceDate(a).localeCompare(serviceDate(b))||a.startTime.localeCompare(b.startTime)).map(r=>[serviceDate(r),r.startTime,r.type,r.capacity,r.reason]),
 ])).digest("hex");
}
export function serviceDayRule(state:ServiceHoursState,date:string){return resolveDayRule({dateStr:date,dow:new Date(date+"T00:00:00Z").getUTCDay(),businessHoursMap:buildBusinessHoursMap(state.hours),specialDayMap:buildSpecialDayMap(state.specials)});}
export function serviceHoursReceipt(state:ServiceHoursState,date:string){
 const names=["日","一","二","三","四","五","六"],dow=new Date(date+"T00:00:00Z").getUTCDay(),rule=serviceDayRule(state,date),weekly=state.hours.find(h=>h.dayOfWeek===dow);
 const template=new Map(rule.periods.flatMap(p=>generateSlots(p.openTime,p.closeTime,p.slotInterval,p.defaultCapacity).map(s=>[s.startTime,s.capacity] as const)));
 const slots=applySlotOverrides(rule,state.overrides.filter(o=>serviceDate(o)===date)).map(s=>({startTime:s.startTime,capacity:s.capacity,templateCapacity:template.get(s.startTime)??rule.defaultCapacity,isEnabled:s.isEnabled,inRange:s.inRange,override:s.override,overrideReason:s.overrideReason}));
 const prefix=date.slice(0,7),[year,month]=prefix.split("-").map(Number),summary:Record<string,{status:typeof rule.status;openTime:string|null;closeTime:string|null;slotCount:number;overrideCount:number}>={};
 for(let n=1;n<=new Date(Date.UTC(year,month,0)).getUTCDate();n++){const day=`${prefix}-${String(n).padStart(2,"0")}`,r=serviceDayRule(state,day);summary[day]={status:r.status,openTime:r.openTime,closeTime:r.closeTime,slotCount:r.periods.reduce((count,p)=>count+generateSlots(p.openTime,p.closeTime,p.slotInterval,1).length,0),overrideCount:state.overrides.filter(o=>serviceDate(o)===day).length};}
 return {date,day:{status:rule.status,openTime:rule.openTime,closeTime:rule.closeTime,reason:rule.reason,specialDayId:state.specials.find(s=>serviceDate(s)===date)?.id??null,dayOfWeek:dow,dayName:names[dow],slots,slotInterval:rule.slotInterval,defaultCapacity:rule.defaultCapacity,periods:rule.periods,weeklyDefault:weekly??null,hoursRevision:serviceHoursRevision(state)},weekly:names.map((dayName,dayOfWeek)=>{const h=state.hours.find(h=>h.dayOfWeek===dayOfWeek);return {dayName,dayOfWeek,persisted:!!h,isOpen:h?.isOpen??false,openTime:h?.openTime??null,closeTime:h?.closeTime??null,slotInterval:h?.slotInterval??60,defaultCapacity:h?.defaultCapacity??6,periods:h?parseBusinessPeriods(h.segments,h):[]};}),specials:state.specials.filter(s=>serviceDate(s).startsWith(prefix)).map(s=>({id:s.id,date:serviceDate(s),type:s.type,reason:s.reason,openTime:s.openTime,closeTime:s.closeTime})),summary};
}
