import "server-only";
import {z} from "zod";
import {prisma} from "@/lib/db";
import {spaPrisma} from "@/lib/spa-db";
import {requireWritablePermission} from "@/lib/permissions";
import {resolveWriteStoreId} from "@/lib/store";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {AppError,handleActionError} from "@/lib/errors";
import {addTaiwanDuration,toLocalDateStr} from "@/lib/date-utils";
import {validateBusinessPeriods} from "@/lib/slot-generator";
import {applySlotOverrides} from "@/lib/business-hours-resolver";
import {serviceHoursSaveInput} from "@/lib/service-hours-save";
import {readServiceHoursState,serviceHoursRevision,serviceHoursReceipt,serviceDate,serviceDayRule,type ServiceHoursState} from "./service-hours-state";
import {settingsSaveUncertain} from "./settings-save-error";
import {revalidateBusinessHoursInRoute} from "@/lib/revalidation";
import type {Prisma} from "@prisma/client";
type Tx=Pick<Prisma.TransactionClient,"$queryRaw"|"$executeRaw">;
const serial=(state:ServiceHoursState,dates:string[])=>({specialDays:state.specials.filter(s=>dates.includes(serviceDate(s))).map(s=>({...s,date:serviceDate(s)})),slotOverrides:state.overrides.filter(s=>dates.includes(serviceDate(s))).map(s=>({...s,date:serviceDate(s)}))});
const restoreSchema=z.object({dates:z.array(z.string()),specialDays:z.array(z.object({id:z.string(),date:z.string(),type:z.string(),reason:z.string().nullable(),openTime:z.string().nullable(),closeTime:z.string().nullable(),slotInterval:z.number().nullable(),defaultCapacity:z.number().nullable(),segments:z.unknown()})),slotOverrides:z.array(z.object({date:z.string(),startTime:z.string(),type:z.string(),capacity:z.number().nullable(),reason:z.string().nullable()}))});
export async function saveServiceHours(input:unknown){
 try{
  const user=await requireWritablePermission("business_hours.manage"),storeId=await resolveWriteStoreId(user),{values:d,...receipt}=serviceHoursSaveInput.parse(input);
  if(receipt.expectedStoreId!==storeId)throw new AppError("CONFLICT","門市已切換，請重新開啟設定");
  const industry=await getStoreIndustryModule(storeId);if(industry==="course")throw new AppError("FORBIDDEN","請使用課程營業設定");
  const open=d.status==="open"||d.status==="custom",periods=[...d.periods].map(p=>({...p,slotInterval:p.slotInterval??60,defaultCapacity:p.defaultCapacity??6})).sort((a,b)=>a.openTime.localeCompare(b.openTime));
  if(!["slots","undo"].includes(d.mode)&&open&&(d.status==="custom"||d.mode!=="day")){
   const validation=validateBusinessPeriods(periods);if(!validation.valid)throw new AppError("VALIDATION",validation.error!);
   if(periods.some(p=>!(industry==="spa"?[15,30]:[30,60,90,120]).includes(p.slotInterval)))throw new AppError("VALIDATION","預約單位不符合門市模組");
  }
  if(d.mode==="copy"&&d.weeks>52||d.mode==="template"&&d.weeks<1)throw new AppError("VALIDATION","套用週數超出範圍");
  if(d.mode==="dates"&&(!d.targetDates.length||d.targetDates.includes(d.date)||d.targetDates.some(date=>date<toLocalDateStr())))throw new AppError("VALIDATION","請選擇未來的目標日期，且不可包含來源日");
  if(d.mode==="slots"&&(!d.changes.length||new Set(d.changes.map(c=>c.startTime)).size!==d.changes.length))throw new AppError("VALIDATION","時段資料不正確或重複");
  const key=`service-hours-receipt:${storeId}:${receipt.requestKey}`;
  const work=async(tx:Tx)=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`business-hours:${storeId}`},0))`;
   if(industry==="spa")await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`},0))`;
   const [logged]=await tx.$queryRaw<Array<{actorUserId:string;afterJson:{count:number;skipped:Array<{date:string;reason:string}>;operationId:string|null;date:string}}>>`SELECT "actorUserId","afterJson" FROM "AuditLog" WHERE id=${key} AND "targetId"=${storeId}`;
   const state=await readServiceHoursState(tx,storeId);
   if(logged){if(logged.actorUserId!==user.id||logged.afterJson.date!==d.date)throw new AppError("CONFLICT","儲存請求不一致，請重新開啟設定");return {...serviceHoursReceipt(state,d.date),...logged.afterJson};}
   if(serviceHoursRevision(state)!==receipt.expectedRevision)throw new AppError("CONFLICT","營業資料已更新，請重新開啟核對；本次修改尚未儲存");
   const next:ServiceHoursState={hours:[...state.hours],specials:[...state.specials],overrides:[...state.overrides]};
   const dow=d.mode==="weekly"?d.dayOfWeek??new Date(d.date+"T00:00:00Z").getUTCDay():new Date(d.date+"T00:00:00Z").getUTCDay(),sourceOverrides=state.overrides.filter(o=>serviceDate(o)===d.date);
   let dates=[d.date],count=0,skipped:Array<{date:string;reason:string}>=[],operationId:string|null=null;
   if(d.mode==="dates"){
    const targets=[...new Set(d.targetDates)].sort();
    skipped=d.conflictMode==="skip"?targets.flatMap(date=>{const reasons=[state.specials.some(s=>serviceDate(s)===date)?"已有整日特殊設定":"",state.overrides.some(o=>serviceDate(o)===date)?"已有單一時段調整":""].filter(Boolean);return reasons.length?[{date,reason:reasons.join("、")}]:[];}):[];
    dates=[d.date,...targets.filter(date=>!skipped.some(s=>s.date===date))];count=dates.length-1;operationId=`service-hours-copy:${storeId}:${receipt.requestKey}`;
   }else if(d.mode==="template"||d.mode==="copy"&&d.status!=="open"){dates=Array.from({length:d.weeks+1},(_,n)=>addTaiwanDuration(d.date,n*7,"DAY"));count=d.weeks;}
   if(["weekly","permanent","template"].includes(d.mode))next.hours=[...next.hours.filter(h=>h.dayOfWeek!==dow),{dayOfWeek:dow,isOpen:open,openTime:open?periods[0]?.openTime??null:null,closeTime:open?periods.at(-1)?.closeTime??null:null,slotInterval:periods[0]?.slotInterval??60,defaultCapacity:periods[0]?.defaultCapacity??6,segments:open?periods:[]}];
   let touchSpecials=d.mode!=="weekly"&&d.mode!=="slots",touchOverrides=d.mode==="slots"||d.mode==="dates"||d.mode==="template"||d.status!=="open"&&!["permanent","weekly"].includes(d.mode);
   if(d.mode==="undo"){
    const [audit]=await tx.$queryRaw<Array<{beforeJson:unknown;afterJson:{expectedRevision:string}}>>`SELECT "beforeJson","afterJson" FROM "AuditLog" WHERE id=${d.operationId??""} AND "targetType"='BusinessHours' AND "targetId"=${storeId} AND action='COPY_SERVICE_HOURS_TO_DATES'`;
    if(!audit)throw new AppError("NOT_FOUND","找不到本店套用紀錄");const before=restoreSchema.parse(audit.beforeJson);dates=before.dates;
    const subset={...state,hours:[],specials:state.specials.filter(s=>dates.includes(serviceDate(s))),overrides:state.overrides.filter(o=>dates.includes(serviceDate(o)))};
    if(serviceHoursRevision(subset)!==audit.afterJson.expectedRevision)throw new AppError("CONFLICT","套用日期已被再次修改，無法直接復原");
    next.specials=[...next.specials.filter(s=>!dates.includes(serviceDate(s))),...before.specialDays.map(s=>({...s,date:new Date(s.date+"T00:00:00Z")}))];next.overrides=[...next.overrides.filter(s=>!dates.includes(serviceDate(s))),...before.slotOverrides.map(s=>({...s,date:new Date(s.date+"T00:00:00Z")}))];touchSpecials=true;touchOverrides=true;count=dates.length;
   }else if(d.mode==="slots"){
    const rule=serviceDayRule(state,d.date);if(rule.closed&&d.changes.some(c=>c.action!=="disable"))throw new AppError("VALIDATION","此日為全天休息，請先設定當日開放時段");
    for(const c of d.changes){next.overrides=next.overrides.filter(o=>serviceDate(o)!==d.date||o.startTime!==c.startTime);if(c.action!=="reset")next.overrides.push({date:new Date(d.date+"T00:00:00Z"),startTime:c.startTime,type:c.action==="disable"?"disabled":c.action==="capacity"?"capacity_change":"enabled",capacity:c.capacity??null,reason:c.reason??null});}count=d.changes.length;
   }else if(touchSpecials){
    next.specials=next.specials.filter(s=>!dates.includes(serviceDate(s))||d.mode==="template"&&s.type!=="custom");
    if(!["permanent","template"].includes(d.mode)&&(d.status!=="open"||d.mode==="dates"))next.specials.push(...dates.map(date=>({id:crypto.randomUUID(),date:new Date(date+"T00:00:00Z"),type:open?"custom":d.status,reason:d.reason||null,openTime:open?periods[0]?.openTime??null:null,closeTime:open?periods.at(-1)?.closeTime??null:null,slotInterval:open?periods[0]?.slotInterval??60:null,defaultCapacity:open?periods[0]?.defaultCapacity??6:null,segments:open?periods:[]})));
   }
   if(touchOverrides&&!['slots','undo'].includes(d.mode)){
    const overrideDates=d.mode==="template"?dates.slice(1):dates;next.overrides=next.overrides.filter(o=>!overrideDates.includes(serviceDate(o)));
    if(d.mode==="dates"||d.mode==="template")for(const date of overrideDates)if(d.mode==="template"||date===d.date||d.includeSlotOverrides)next.overrides.push(...sourceOverrides.map(o=>({...o,date:new Date(date+"T00:00:00Z")})));
   }
   const bookings=industry==="spa"?await tx.$queryRaw<Array<{bookingDate:Date;startTime:string;endTime:string;people:number}>>`SELECT "bookingDate","startTime","endTime",people FROM "SpaBooking" WHERE "storeId"=${storeId} AND status IN ('PENDING','CONFIRMED') AND "bookingDate">=${new Date(toLocalDateStr()+"T00:00:00Z")}`:await tx.$queryRaw<Array<{bookingDate:Date;startTime:string;endTime?:string;people:number}>>`SELECT "bookingDate","slotTime" AS "startTime",people FROM "Booking" WHERE "storeId"=${storeId} AND "bookingStatus" IN ('PENDING','CONFIRMED') AND "bookingDate">=${new Date(toLocalDateStr()+"T00:00:00Z")}`;
   const grouped=new Map<string,number>();
   for(const b of bookings){const date=serviceDate({date:b.bookingDate});if(!dates.includes(date)&&!(["weekly","permanent","template"].includes(d.mode)&&b.bookingDate.getUTCDay()===dow))continue;
    const rule=serviceDayRule(next,date),overrides=next.overrides.filter(o=>serviceDate(o)===date),slots=applySlotOverrides(rule,overrides),slot=slots.find(s=>s.startTime===b.startTime);
    const fits=industry==="spa"?!rule.closed&&rule.periods.some(p=>b.startTime>=p.openTime&&b.endTime!<=p.closeTime)&&!slots.some(s=>{const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));const interval=rule.periods.find(p=>s.startTime>=p.openTime&&s.startTime<p.closeTime)?.slotInterval??rule.slotInterval;return !s.isEnabled&&s.startTime<b.endTime!&&minutes(s.startTime)+interval>minutes(b.startTime);}):!!slot?.isEnabled;
    if(!fits)throw new AppError("VALIDATION",`${date} ${b.startTime} 已有預約，請先調整預約；本批尚未儲存`);
    if(industry==="steamfoot"){const key=date+" "+b.startTime,n=(grouped.get(key)??0)+b.people;grouped.set(key,n);if(n>slot!.capacity)throw new AppError("VALIDATION",`${key} 已預約 ${n} 人，名額不足；本批尚未儲存`);}
   }
   if(["weekly","permanent","template"].includes(d.mode)){const h=next.hours.find(h=>h.dayOfWeek===dow)!;await tx.$executeRaw`INSERT INTO "BusinessHours" (id,"storeId","dayOfWeek","isOpen","openTime","closeTime","slotInterval","defaultCapacity",segments,"updatedAt") VALUES (${crypto.randomUUID()},${storeId},${dow},${h.isOpen},${h.openTime},${h.closeTime},${h.slotInterval},${h.defaultCapacity},${JSON.stringify(h.segments)}::jsonb,now()) ON CONFLICT ("storeId","dayOfWeek") DO UPDATE SET "isOpen"=EXCLUDED."isOpen","openTime"=EXCLUDED."openTime","closeTime"=EXCLUDED."closeTime","slotInterval"=EXCLUDED."slotInterval","defaultCapacity"=EXCLUDED."defaultCapacity",segments=EXCLUDED.segments,"updatedAt"=now()`;}
   if(touchSpecials){await tx.$executeRaw`DELETE FROM "SpecialBusinessDay" WHERE "storeId"=${storeId} AND date=ANY(${dates}::date[])`;const rows=next.specials.filter(s=>dates.includes(serviceDate(s))).map(s=>({...s,date:serviceDate(s)}));if(rows.length)await tx.$executeRaw`INSERT INTO "SpecialBusinessDay" (id,"storeId",date,type,reason,"openTime","closeTime","slotInterval","defaultCapacity",segments,"updatedAt") SELECT x.id,${storeId},x.date,x.type,x.reason,x."openTime",x."closeTime",x."slotInterval",x."defaultCapacity",x.segments,now() FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(id text,date date,type text,reason text,"openTime" text,"closeTime" text,"slotInterval" int,"defaultCapacity" int,segments jsonb)`;}
   if(touchOverrides){await tx.$executeRaw`DELETE FROM "SlotOverride" WHERE "storeId"=${storeId} AND date=ANY(${dates}::date[])`;const rows=next.overrides.filter(s=>dates.includes(serviceDate(s))).map(s=>({...s,id:crypto.randomUUID(),date:serviceDate(s)}));if(rows.length)await tx.$executeRaw`INSERT INTO "SlotOverride" (id,"storeId",date,"startTime",type,capacity,reason,"updatedAt") SELECT x.id,${storeId},x.date,x."startTime",x.type,x.capacity,x.reason,now() FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(id text,date date,"startTime" text,type text,capacity int,reason text)`;}
   const confirmed=await readServiceHoursState(tx,storeId);
   if(operationId){const before={dates,...serial(state,dates)},after={expectedRevision:serviceHoursRevision({...confirmed,hours:[],specials:confirmed.specials.filter(s=>dates.includes(serviceDate(s))),overrides:confirmed.overrides.filter(o=>dates.includes(serviceDate(o)))})};await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${operationId},${user.id},'BusinessHours',${storeId},'COPY_SERVICE_HOURS_TO_DATES',${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,now())`;}
   const metadata={date:d.date,count,skipped,operationId};await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"afterJson","createdAt") VALUES (${key},${user.id},'BusinessHours',${storeId},'SETTINGS_SAVE_CONFIRMED',${JSON.stringify(metadata)}::jsonb,now())`;
   return {...serviceHoursReceipt(confirmed,d.date),...metadata};
  };
  const data=industry==="spa"?await spaPrisma.$transaction(work,{timeout:20000}):await prisma.$transaction(work,{timeout:20000});let syncWarning=false;try{revalidateBusinessHoursInRoute();}catch{syncWarning=true;}return {success:true as const,storeId,data,syncWarning};
 }catch(error){return {...handleActionError(error),uncertain:settingsSaveUncertain(error)};}
}
