"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { normalizeAvailabilityPeriods } from "@/lib/course-availability";
import { courseManager } from "@/server/services/course-access";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const period = z.object({ openTime: time, closeTime: time });
const weeklySchema = z.object({
  staffId: z.string().min(1),
  inheritStoreHours: z.boolean(),
  days: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    periods: z.array(period).max(8),
  })).max(7),
});
const exceptionSchema = z.object({
  staffId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["INHERIT", "UNAVAILABLE", "CUSTOM"]),
  reason: z.string().trim().max(200).optional().default(""),
  periods: z.array(period).max(8).optional().default([]),
});

function validatePeriods(periods: {openTime:string;closeTime:string}[]) {
  const sorted = [...periods].sort((a,b)=>a.openTime.localeCompare(b.openTime));
  if (sorted.some((p,i)=>p.openTime>=p.closeTime || (i>0 && sorted[i-1].closeTime>p.openTime))) {
    throw new AppError("VALIDATION","可授課時段不可重疊，且結束時間需晚於開始時間");
  }
  return sorted;
}

async function assertStaff(storeId:string, staffId:string) {
  const row = await prisma.staff.findFirst({where:{id:staffId,storeId,status:"ACTIVE"},select:{id:true,courseCoachEnabled:true}});
  if(!row?.courseCoachEnabled) throw new AppError("VALIDATION","找不到本店可授課老師");
}

export async function saveCourseStaffWeeklyAvailability(input:unknown) {
  try {
    const {storeId}=await courseManager("staff.manage");
    const data=weeklySchema.parse(input);
    await assertStaff(storeId,data.staffId);
    if(data.inheritStoreHours) {
      await prisma.$executeRaw`DELETE FROM "CourseStaffAvailability" WHERE "storeId"=${storeId} AND "staffId"=${data.staffId}`;
    } else {
      const seen=new Set<number>();
      for(const day of data.days) {
        if(seen.has(day.dayOfWeek)) throw new AppError("VALIDATION","同一星期不可重複設定");
        seen.add(day.dayOfWeek);
        const periods=validatePeriods(day.periods);
        const json=JSON.stringify(periods);
        await prisma.$executeRaw`
          INSERT INTO "CourseStaffAvailability" (id,"storeId","staffId","dayOfWeek",segments,"createdAt","updatedAt")
          VALUES (${randomUUID()},${storeId},${data.staffId},${day.dayOfWeek},${json}::jsonb,NOW(),NOW())
          ON CONFLICT ("storeId","staffId","dayOfWeek")
          DO UPDATE SET segments=EXCLUDED.segments,"updatedAt"=NOW()`;
      }
      await prisma.$executeRaw`
        DELETE FROM "CourseStaffAvailability"
        WHERE "storeId"=${storeId} AND "staffId"=${data.staffId}
          AND "dayOfWeek" NOT IN (${data.days.map(d=>d.dayOfWeek).join(",") || "-1"})`;
    }
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard/staff");
    return {success:true as const};
  } catch(error) { return handleActionError(error); }
}

export async function saveCourseStaffAvailabilityException(input:unknown) {
  try {
    const {storeId}=await courseManager("staff.manage");
    const data=exceptionSchema.parse(input);
    await assertStaff(storeId,data.staffId);
    const date=new Date(data.date+"T00:00:00Z");
    if(data.type==="INHERIT") {
      await prisma.$executeRaw`DELETE FROM "CourseStaffAvailabilityException" WHERE "storeId"=${storeId} AND "staffId"=${data.staffId} AND date=${date}::date`;
    } else {
      const periods=data.type==="CUSTOM"?validatePeriods(data.periods):[];
      if(data.type==="CUSTOM"&&!periods.length) throw new AppError("VALIDATION","臨時加開請至少設定一段可授課時間");
      const json=data.type==="CUSTOM"?JSON.stringify(periods):null;
      await prisma.$executeRaw`
        INSERT INTO "CourseStaffAvailabilityException" (id,"storeId","staffId",date,type,segments,reason,"createdAt","updatedAt")
        VALUES (${randomUUID()},${storeId},${data.staffId},${date}::date,${data.type},${json}::jsonb,${data.reason||null},NOW(),NOW())
        ON CONFLICT ("storeId","staffId",date)
        DO UPDATE SET type=EXCLUDED.type,segments=EXCLUDED.segments,reason=EXCLUDED.reason,"updatedAt"=NOW()`;
    }
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard/staff");
    return {success:true as const};
  } catch(error) { return handleActionError(error); }
}

export async function getCourseStaffAvailability(staffId:string) {
  const {storeId}=await courseManager("staff.view");
  await assertStaff(storeId,staffId);
  const [weekly,exceptions]=await Promise.all([
    prisma.$queryRaw<{dayOfWeek:number;segments:unknown}[]>`
      SELECT "dayOfWeek",segments FROM "CourseStaffAvailability"
      WHERE "storeId"=${storeId} AND "staffId"=${staffId} ORDER BY "dayOfWeek"`,
    prisma.$queryRaw<{date:Date;type:string;segments:unknown;reason:string|null}[]>`
      SELECT date,type,segments,reason FROM "CourseStaffAvailabilityException"
      WHERE "storeId"=${storeId} AND "staffId"=${staffId} AND date>=CURRENT_DATE
      ORDER BY date LIMIT 20`,
  ]);
  return {
    inheritStoreHours: weekly.length===0,
    weekly: weekly.map(row=>({dayOfWeek:row.dayOfWeek,periods:normalizeAvailabilityPeriods(row.segments)})),
    exceptions: exceptions.map(row=>({date:row.date.toISOString().slice(0,10),type:row.type,periods:normalizeAvailabilityPeriods(row.segments),reason:row.reason??""})),
  };
}
