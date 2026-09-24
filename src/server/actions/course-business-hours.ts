"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { handleActionError, AppError } from "@/lib/errors";
import { revalidateBusinessHours, revalidateSpecialDays } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";
import { assertCourseDutyCoverage } from "@/server/services/course-duty";
import { resolvedCourseHours, assertCourseSessionsFitHours } from "@/server/services/course-business-hours";
import { toLocalDateStr, addTaiwanDuration } from "@/lib/date-utils";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "日期無效");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const periodSchema = z.object({ openTime: time, closeTime: time, slotInterval: z.number().optional(), defaultCapacity: z.number().optional() });
const schema = z.object({
  date: dateSchema, status: z.enum(["open", "closed", "training", "custom"]),
  mode: z.enum(["day", "copy", "permanent", "template", "weekly"]), weeks: z.number().int().min(0).max(104),
  reason: z.string().trim().max(300), periods: z.array(periodSchema).max(8),
});
async function rows(storeId:string) {
  const [hours,specials] = await Promise.all([prisma.businessHours.findMany({where:{storeId}}),prisma.specialBusinessDay.findMany({where:{storeId}})]);
  return {hours,specials};
}
async function courseStartInterval(storeId:string) {
  const music=await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{id:true}});
  return music ? 30 : 60;
}
export async function getCourseMonthSpecialDays(year:number, month:number) {
  const {storeId}=await courseManager("business_hours.view");
  const {specials}=await rows(storeId);
  const prefix=`${year}-${String(month).padStart(2,"0")}`;
  return specials.filter(s=>s.date.toISOString().startsWith(prefix)).map(s=>({...s,date:s.date.toISOString().slice(0,10)}));
}
export async function getCourseMonthScheduleSummary(year:number,month:number) {
  z.number().int().min(2000).max(2100).parse(year); z.number().int().min(1).max(12).parse(month);
  const {storeId}=await courseManager("business_hours.view");
  const {hours,specials}=await rows(storeId);
  const result:Record<string,{status:"open"|"closed"|"training"|"custom";openTime:string|null;closeTime:string|null;slotCount:number;overrideCount:number}>={};
  for(let n=1;n<=new Date(Date.UTC(year,month,0)).getUTCDate();n++) {
    const date=`${year}-${String(month).padStart(2,"0")}-${String(n).padStart(2,"0")}`;
    result[date]={...resolvedCourseHours(date,hours,specials),slotCount:0,overrideCount:0};
  }
  return result;
}
export async function getCourseDayHours(date:string) {
  dateSchema.parse(date); const {storeId}=await courseManager("business_hours.view");
  const {hours,specials}=await rows(storeId); const value=resolvedCourseHours(date,hours,specials);
  return {...value,specialDayId:specials.find(s=>s.date.toISOString().slice(0,10)===date)?.id??null,
    slots:[] as {startTime:string;capacity:number;templateCapacity:number;isEnabled:boolean;inRange:boolean;override:string|null;overrideReason:string|null}[],
    slotInterval:await courseStartInterval(storeId), defaultCapacity:6, weeklyDefault:hours.find(h=>h.dayOfWeek===value.dayOfWeek)??null};
}
export async function saveCourseDayHours(input:unknown) {
  try {
    const {storeId}=await courseManager("business_hours.manage"); const d=schema.parse(input);
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
    await courseTransaction(storeId,async tx=>{
      if(d.mode==="permanent"||d.mode==="template"||d.mode==="weekly") {
        const dow=new Date(d.date+"T00:00:00Z").getUTCDay();
        await tx.$executeRaw`INSERT INTO "BusinessHours" (id,"storeId","dayOfWeek","isOpen","openTime","closeTime",segments,"slotInterval","defaultCapacity","createdAt","updatedAt") VALUES (${randomUUID()},${storeId},${dow},${open},${first},${last},${json}::jsonb,${interval},6,NOW(),NOW()) ON CONFLICT ("storeId","dayOfWeek") DO UPDATE SET "isOpen"=EXCLUDED."isOpen","openTime"=EXCLUDED."openTime","closeTime"=EXCLUDED."closeTime",segments=EXCLUDED.segments,"updatedAt"=NOW()`;
      }
      const count=d.mode==="copy"||d.mode==="template"?d.weeks:0;
      for(let week=0;d.mode!=="weekly" && week<=count;week++) {
        const dateStr=addTaiwanDuration(d.date,week*7,"DAY"); affected.add(dateStr);
        const date=new Date(dateStr+"T00:00:00Z");
        if(d.mode==="permanent"||d.mode==="template"||d.status==="open") {
          await tx.$executeRaw`DELETE FROM "SpecialBusinessDay" WHERE "storeId"=${storeId} AND date=${date}::date`;
        } else {
          await tx.$executeRaw`INSERT INTO "SpecialBusinessDay" (id,"storeId",date,type,reason,"openTime","closeTime",segments,"createdAt","updatedAt") VALUES (${randomUUID()},${storeId},${date}::date,${d.status},${d.reason||null},${first},${last},${json}::jsonb,NOW(),NOW()) ON CONFLICT ("storeId",date) DO UPDATE SET type=EXCLUDED.type,reason=EXCLUDED.reason,"openTime"=EXCLUDED."openTime","closeTime"=EXCLUDED."closeTime",segments=EXCLUDED.segments,"updatedAt"=NOW()`;
        }
      }
      const sessions=await tx.courseSession.findMany({where:{storeId,cancelledAt:null,startsAt:{gte:new Date()}},select:{startsAt:true,endsAt:true}});
      await assertCourseSessionsFitHours(tx,storeId,sessions.filter(s=>{const date=toLocalDateStr(s.startsAt);return affected.has(date)||(weekday!==null&&new Date(date+"T00:00:00Z").getUTCDay()===weekday);}));
      await assertCourseDutyCoverage(tx,storeId);
    });
    revalidateBusinessHours(); revalidateSpecialDays(); revalidatePath("/dashboard/courses"); revalidatePath("/book");
    return {success:true as const};
  } catch(error) { return handleActionError(error); }
}

/** Save all edited weekdays atomically; special dates keep their existing overrides. */
export async function saveCourseWeeklyHours(input: unknown) {
  try {
    const { storeId } = await courseManager("business_hours.manage");
    const days = z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), isOpen: z.boolean(), periods: z.array(periodSchema).max(8) })).min(1).max(7).parse(input);
    const weekdays = new Set(days.map(day => day.dayOfWeek));
    if (weekdays.size !== days.length) throw new AppError("VALIDATION", "同一星期不可重複設定");
    const normalized = days.map(day => {
      const periods = [...day.periods].sort((a, b) => a.openTime.localeCompare(b.openTime));
      if (day.isOpen && (!periods.length || periods.some((p, i) => p.openTime >= p.closeTime || (i > 0 && periods[i - 1].closeTime > p.openTime)))) throw new AppError("VALIDATION", "請設定不重疊的完整營業時間");
      return { ...day, periods };
    });
    const interval=await courseStartInterval(storeId);
    await courseTransaction(storeId, async tx => {
      for (const day of normalized) {
        const first = day.isOpen ? day.periods[0].openTime : null;
        const last = day.isOpen ? day.periods.at(-1)!.closeTime : null;
        const json = JSON.stringify(day.periods.map(p => ({ ...p, slotInterval: interval, defaultCapacity: 6 })));
        await tx.$executeRaw`INSERT INTO "BusinessHours" (id,"storeId","dayOfWeek","isOpen","openTime","closeTime",segments,"slotInterval","defaultCapacity","createdAt","updatedAt") VALUES (${randomUUID()},${storeId},${day.dayOfWeek},${day.isOpen},${first},${last},${json}::jsonb,${interval},6,NOW(),NOW()) ON CONFLICT ("storeId","dayOfWeek") DO UPDATE SET "isOpen"=EXCLUDED."isOpen","openTime"=EXCLUDED."openTime","closeTime"=EXCLUDED."closeTime",segments=EXCLUDED.segments,"updatedAt"=NOW()`;
      }
      const sessions = await tx.courseSession.findMany({ where: { storeId, cancelledAt: null, startsAt: { gte: new Date() } }, select: { startsAt: true, endsAt: true } });
      await assertCourseSessionsFitHours(tx, storeId, sessions.filter(session => weekdays.has(new Date(toLocalDateStr(session.startsAt) + "T00:00:00Z").getUTCDay())));
      await assertCourseDutyCoverage(tx, storeId);
    });
    revalidateBusinessHours(); revalidatePath("/dashboard/courses"); revalidatePath("/book");
    return { success: true as const };
  } catch (error) { return handleActionError(error); }
}
