"use server";

import {courseDayHoursValues,courseDayHoursReceipt} from "@/lib/course-day-hours-save";
import {readCourseHoursState,courseHoursRevision,intendedCourseHours,courseDayDetail,courseHoursReceiptData} from "@/server/services/course-hours-save-receipt";
import {weeklyReceipt,weeklyRevision} from "@/lib/course-weekly-hours-save";
import {parseBusinessPeriods} from "@/lib/business-periods";
import {settingsSaveUncertain} from "@/server/services/settings-save-error";
import {CACHE_TAGS} from "@/lib/cache-tags";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManager, courseManagerRead, courseTransaction } from "@/server/services/course-access";
import { handleActionError, AppError } from "@/lib/errors";
import { revalidateBusinessHours, revalidateSpecialDays } from "@/lib/revalidation";
import { revalidateTag,revalidatePath } from "next/cache";
import { assertCourseDutyCoverage } from "@/server/services/course-duty";
import { resolvedCourseHours, assertCourseSessionsFitHours } from "@/server/services/course-business-hours";
import { toLocalDateStr, addTaiwanDuration } from "@/lib/date-utils";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "日期無效");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const periodSchema = z.object({ openTime: time, closeTime: time, slotInterval: z.number().optional(), defaultCapacity: z.number().optional() });
const schema=courseDayHoursValues.extend({receipt:courseDayHoursReceipt.optional()});
async function rows(storeId:string) {
  const [hours,specials] = await Promise.all([prisma.businessHours.findMany({where:{storeId}}),prisma.specialBusinessDay.findMany({where:{storeId}})]);
  return {hours,specials};
}
async function courseStartInterval(storeId:string) {
  const music=await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{id:true}});
  return music ? 30 : 60;
}
export async function getCourseMonthSpecialDays(year:number, month:number) {
  const {storeId}=await courseManagerRead("business_hours.view");
  const {specials}=await rows(storeId);
  const prefix=`${year}-${String(month).padStart(2,"0")}`;
  return specials.filter(s=>s.date.toISOString().startsWith(prefix)).map(s=>({...s,date:s.date.toISOString().slice(0,10)}));
}
export async function getCourseMonthScheduleSummary(year:number,month:number) {
  z.number().int().min(2000).max(2100).parse(year); z.number().int().min(1).max(12).parse(month);
  const {storeId}=await courseManagerRead("business_hours.view");
  const {hours,specials}=await rows(storeId);
  const result:Record<string,{status:"open"|"closed"|"training"|"custom";openTime:string|null;closeTime:string|null;slotCount:number;overrideCount:number}>={};
  for(let n=1;n<=new Date(Date.UTC(year,month,0)).getUTCDate();n++) {
    const date=`${year}-${String(month).padStart(2,"0")}-${String(n).padStart(2,"0")}`;
    result[date]={...resolvedCourseHours(date,hours,specials),slotCount:0,overrideCount:0};
  }
  return result;
}
export async function getCourseDayHours(date:string) {
  dateSchema.parse(date); const {storeId}=await courseManagerRead("business_hours.view");
  const {hours,specials}=await rows(storeId);
  return courseDayDetail({hours,specials},date,await courseStartInterval(storeId));
}
export async function saveCourseDayHours(input:unknown) {
  try {
    const {storeId}=await courseManager("business_hours.manage"); const d=schema.parse(input);
    if(d.receipt&&d.receipt.expectedStoreId!==storeId)throw new AppError("CONFLICT","門市已切換，請重新開啟營業設定");
    const open=d.status==="open"||d.status==="custom";
    const periods=[...d.periods].sort((a,b)=>a.openTime.localeCompare(b.openTime));
    if(open && (d.status==="custom"||d.mode==="permanent"||d.mode==="template"||d.mode==="weekly")) {
      if(!periods.length||periods.some((p,i)=>p.openTime>=p.closeTime||(i>0&&periods[i-1].closeTime>p.openTime))) throw new AppError("VALIDATION","請設定不重疊的完整營業時間");
    }
    const interval=await courseStartInterval(storeId);
    const json=JSON.stringify(periods.map(p=>({...p,slotInterval:interval,defaultCapacity:6})));
    const first=open?periods[0]?.openTime??null:null, last=open?periods.at(-1)?.closeTime??null:null;
    const affected=new Set<string>();
    const weeklyMode=["weekly","permanent","template"].includes(d.mode);
    const weekday=weeklyMode?new Date(d.date+"T00:00:00Z").getUTCDay():null;
    const saved=await courseTransaction(storeId,async tx=>{
      if(d.receipt){
        const state=await readCourseHoursState(tx,storeId),current=courseHoursRevision(state);
        if(current===courseHoursRevision(intendedCourseHours(state,d,interval)))return courseHoursReceiptData(state,d.date,interval);
        if(current!==d.receipt.expectedRevision)throw new AppError("CONFLICT","營業或特殊日期已有更新，輸入已保留。請核對後再編輯。");
      }
      if(d.mode==="permanent"||d.mode==="template"||d.mode==="weekly") {
        const dow=new Date(d.date+"T00:00:00Z").getUTCDay();
        await tx.$executeRaw`INSERT INTO "BusinessHours" (id,"storeId","dayOfWeek","isOpen","openTime","closeTime",segments,"slotInterval","defaultCapacity","createdAt","updatedAt") VALUES (${randomUUID()},${storeId},${dow},${open},${first},${last},${json}::jsonb,${interval},6,NOW(),NOW()) ON CONFLICT ("storeId","dayOfWeek") DO UPDATE SET "isOpen"=EXCLUDED."isOpen","openTime"=EXCLUDED."openTime","closeTime"=EXCLUDED."closeTime",segments=EXCLUDED.segments,"slotInterval"=EXCLUDED."slotInterval","updatedAt"=NOW()`;
      }
      const count=d.mode==="copy"||d.mode==="template"?d.weeks:0;
      for(let week=0;d.mode!=="weekly" && week<=count;week++) {
        const dateStr=addTaiwanDuration(d.date,week*7,"DAY"); affected.add(dateStr);
        const date=new Date(dateStr+"T00:00:00Z");
        if(d.mode==="permanent"||d.mode==="template"||d.status==="open") {
          await tx.$executeRaw`DELETE FROM "SpecialBusinessDay" WHERE "storeId"=${storeId} AND date=${date}::date`;
        } else {
          await tx.$executeRaw`INSERT INTO "SpecialBusinessDay" (id,"storeId",date,type,reason,"openTime","closeTime",segments,"slotInterval","createdAt","updatedAt") VALUES (${randomUUID()},${storeId},${date}::date,${d.status},${d.reason||null},${first},${last},${json}::jsonb,${interval},NOW(),NOW()) ON CONFLICT ("storeId",date) DO UPDATE SET type=EXCLUDED.type,reason=EXCLUDED.reason,"openTime"=EXCLUDED."openTime","closeTime"=EXCLUDED."closeTime",segments=EXCLUDED.segments,"slotInterval"=EXCLUDED."slotInterval","updatedAt"=NOW()`;
        }
      }
      const sessions=await tx.courseSession.findMany({where:{storeId,cancelledAt:null,startsAt:{gte:new Date()}},select:{startsAt:true,endsAt:true}});
      await assertCourseSessionsFitHours(tx,storeId,sessions.filter(s=>{const date=toLocalDateStr(s.startsAt);return affected.has(date)||(weekday!==null&&new Date(date+"T00:00:00Z").getUTCDay()===weekday);}));
      await assertCourseDutyCoverage(tx,storeId);
      if(d.receipt)return courseHoursReceiptData(await readCourseHoursState(tx,storeId),d.date,interval);
    });
    let syncWarning=false;
    try{
      if(d.receipt){revalidateTag(CACHE_TAGS.businessHours,{expire:0});revalidateTag(CACHE_TAGS.specialDays,{expire:0});revalidatePath("/dashboard/settings/hours");revalidatePath("/dashboard/duty");}
      else {revalidateBusinessHours();revalidateSpecialDays();}
      revalidatePath("/dashboard/courses");revalidatePath("/dashboard/courses/hours");revalidatePath("/book");
    }catch(error){if(!d.receipt)throw error;syncWarning=true;}
    if(d.receipt)return {success:true as const,storeId,data:saved!,syncWarning};
    return {success:true as const};
  } catch(error) { return {...handleActionError(error),uncertain:settingsSaveUncertain(error)}; }
}

type WeeklyDatabaseRow={dayOfWeek:number;isOpen:boolean;openTime:string|null;closeTime:string|null;segments:unknown;slotInterval:number;defaultCapacity:number};
async function readWeeklyReceipt(tx:Parameters<Parameters<typeof courseTransaction>[1]>[0],storeId:string){
  const rows=await tx.$queryRaw<WeeklyDatabaseRow[]>`SELECT "dayOfWeek","isOpen","openTime","closeTime",segments,"slotInterval","defaultCapacity" FROM "BusinessHours" WHERE "storeId"=${storeId}`;
  return ["週日","週一","週二","週三","週四","週五","週六"].map((dayName,dayOfWeek)=>{
    const row=rows.find(r=>r.dayOfWeek===dayOfWeek);
    return {dayName,dayOfWeek,persisted:!!row,isOpen:row?.isOpen??true,openTime:row?.openTime??null,closeTime:row?.closeTime??null,periods:row?parseBusinessPeriods(row.segments,row).map(({openTime,closeTime})=>({openTime,closeTime})):[]};
  });
}

/** Save all edited weekdays atomically; special dates keep their existing overrides. */
export async function saveCourseWeeklyHours(input: unknown) {
  try {
    const { storeId } = await courseManager("business_hours.manage");
    const receipt=Array.isArray(input)?undefined:z.object({receipt:weeklyReceipt}).parse(input).receipt;
    if(receipt && receipt.expectedStoreId!==storeId)throw new AppError("CONFLICT","目前門市已切換，請重新開啟營業時間設定。");
    const days = z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), isOpen: z.boolean(), periods: z.array(periodSchema).max(8) })).min(1).max(7).parse(Array.isArray(input)?input:z.object({days:z.unknown()}).parse(input).days);
    const weekdays = new Set(days.map(day => day.dayOfWeek));
    if (weekdays.size !== days.length) throw new AppError("VALIDATION", "同一星期不可重複設定");
    const normalized = days.map(day => {
      const periods = [...day.periods].sort((a, b) => a.openTime.localeCompare(b.openTime));
      if (day.isOpen && (!periods.length || periods.some((p, i) => p.openTime >= p.closeTime || (i > 0 && periods[i - 1].closeTime > p.openTime)))) throw new AppError("VALIDATION", "請設定不重疊的完整營業時間");
      return { ...day, periods };
    });
    const interval=await courseStartInterval(storeId);
    const saved=await courseTransaction(storeId, async tx => {
      const current=receipt?await readWeeklyReceipt(tx,storeId):undefined;
      if(receipt){
        if(new Set(receipt.expected.map(day=>day.dayOfWeek)).size!==receipt.expected.length)throw new AppError("VALIDATION","修訂星期不可重複");
        for(const day of normalized){
          const before=current!.find(r=>r.dayOfWeek===day.dayOfWeek)!;
          const expected=receipt.expected.find(r=>r.dayOfWeek===day.dayOfWeek);
          if(!expected)throw new AppError("VALIDATION","缺少星期修訂資料");
          const desired={...day,persisted:true};
          if(weeklyRevision(before)!==weeklyRevision(expected) && weeklyRevision(before)!==weeklyRevision(desired))throw new AppError("CONFLICT","營業時間已有更新，輸入已保留。請核對後再編輯。");
        }
        if(normalized.every(day=>weeklyRevision(current!.find(r=>r.dayOfWeek===day.dayOfWeek))===weeklyRevision({...day,persisted:true})))return current!;
      }
      for (const day of normalized) {
        const first = day.isOpen ? day.periods[0].openTime : null;
        const last = day.isOpen ? day.periods.at(-1)!.closeTime : null;
        const json = JSON.stringify(day.periods.map(p => ({ ...p, slotInterval: interval, defaultCapacity: 6 })));
        await tx.$executeRaw`INSERT INTO "BusinessHours" (id,"storeId","dayOfWeek","isOpen","openTime","closeTime",segments,"slotInterval","defaultCapacity","createdAt","updatedAt") VALUES (${randomUUID()},${storeId},${day.dayOfWeek},${day.isOpen},${first},${last},${json}::jsonb,${interval},6,NOW(),NOW()) ON CONFLICT ("storeId","dayOfWeek") DO UPDATE SET "isOpen"=EXCLUDED."isOpen","openTime"=EXCLUDED."openTime","closeTime"=EXCLUDED."closeTime",segments=EXCLUDED.segments,"slotInterval"=EXCLUDED."slotInterval","updatedAt"=NOW()`;
      }
      const sessions = await tx.courseSession.findMany({ where: { storeId, cancelledAt: null, startsAt: { gte: new Date() } }, select: { startsAt: true, endsAt: true } });
      await assertCourseSessionsFitHours(tx, storeId, sessions.filter(session => weekdays.has(new Date(toLocalDateStr(session.startsAt) + "T00:00:00Z").getUTCDay())));
      await assertCourseDutyCoverage(tx, storeId);
      if(receipt)return readWeeklyReceipt(tx,storeId);
    });
    let syncWarning=false;
    try{
      if(receipt){revalidateTag(CACHE_TAGS.businessHours,{expire:0});revalidateTag(CACHE_TAGS.specialDays,{expire:0});revalidatePath("/dashboard/settings/hours");revalidatePath("/dashboard/duty");}else revalidateBusinessHours();
      revalidatePath("/dashboard/courses");revalidatePath("/dashboard/courses/hours");revalidatePath("/book");
    }catch(error){if(!receipt)throw error;syncWarning=true;}
    if(receipt)return {success:true as const,storeId,data:saved!,syncWarning};
    return { success: true as const };
  } catch (error) { return {...handleActionError(error),uncertain:settingsSaveUncertain(error)}; }
}
