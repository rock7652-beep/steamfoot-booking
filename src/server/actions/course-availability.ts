"use server";

import {createHash} from "node:crypto";
import {courseAvailabilitySaveInput} from "@/lib/course-staff-availability-save";
import {settingsSaveUncertain} from "@/server/services/settings-save-error";
import type {Prisma} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {toLocalDateStr} from "@/lib/date-utils";
import { normalizeAvailabilityPeriods } from "@/lib/course-availability";
import { assertExistingTeacherAvailability, listOutsideTeacherAvailability } from "@/server/services/course-availability";
import { handleCourseActionError } from "@/server/services/course-resources";
import { courseManager, courseManagerRead } from "@/server/services/course-access";

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
    const retainedSessions=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
    if(data.inheritStoreHours) {
      await tx.$executeRaw`DELETE FROM "CourseStaffAvailability" WHERE "storeId"=${storeId} AND "staffId"=${data.staffId}`;
    } else {
      const seen=new Set<number>();
      const normalized=data.days.map(day=>{
        if(seen.has(day.dayOfWeek)) throw new AppError("VALIDATION","同一星期不可重複設定");
        seen.add(day.dayOfWeek);
        return {...day,periods:validatePeriods(day.periods)};
      });

        await tx.$executeRaw`DELETE FROM "CourseStaffAvailability" WHERE "storeId"=${storeId} AND "staffId"=${data.staffId}`;
        for(const day of Array.from({length:7},(_,dayOfWeek)=>normalized.find(day=>day.dayOfWeek===dayOfWeek)??{dayOfWeek,periods:[]})) {
          const json=JSON.stringify(day.periods);
          await tx.$executeRaw`
            INSERT INTO "CourseStaffAvailability" (id,"storeId","staffId","dayOfWeek",segments,"createdAt","updatedAt")
            VALUES (${randomUUID()},${storeId},${data.staffId},${day.dayOfWeek},${json}::jsonb,NOW(),NOW())`;
        }
    }
    return listOutsideTeacherAvailability(tx,storeId,data.staffId);
    });
    revalidatePath("/dashboard/teachers");
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard/staff");
    return {success:true as const,retainedSessions};
  } catch(error) { return handleCourseActionError(error); }
}

export async function saveCourseStaffAvailabilityException(input:unknown) {
  try {
    const {storeId}=await courseManager("staff.manage");
    const data=exceptionSchema.parse(input);
    await assertStaff(storeId,data.staffId);
    const date=new Date(data.date+"T00:00:00Z");
    await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
    if(data.type==="INHERIT") {
      await tx.$executeRaw`DELETE FROM "CourseStaffAvailabilityException" WHERE "storeId"=${storeId} AND "staffId"=${data.staffId} AND date=${date}::date`;
    } else {
      const periods=data.type==="CUSTOM"?validatePeriods(data.periods):[];
      if(data.type==="CUSTOM"&&!periods.length) throw new AppError("VALIDATION","臨時加開請至少設定一段可授課時間");
      const json=data.type==="CUSTOM"?JSON.stringify(periods):null;
      await tx.$executeRaw`
        INSERT INTO "CourseStaffAvailabilityException" (id,"storeId","staffId",date,type,segments,reason,"createdAt","updatedAt")
        VALUES (${randomUUID()},${storeId},${data.staffId},${date}::date,${data.type},${json}::jsonb,${data.reason||null},NOW(),NOW())
        ON CONFLICT ("storeId","staffId",date)
        DO UPDATE SET type=EXCLUDED.type,segments=EXCLUDED.segments,reason=EXCLUDED.reason,"updatedAt"=NOW()`;
    }
    if(data.type!=="INHERIT")await assertExistingTeacherAvailability(tx,storeId,data.staffId,data.date);
    });
    revalidatePath("/dashboard/teachers");
    revalidatePath("/dashboard/courses");
    revalidatePath("/dashboard/staff");
    return {success:true as const};
  } catch(error) { return handleCourseActionError(error); }
}

async function readAvailability(tx:Pick<Prisma.TransactionClient,"$queryRaw">,storeId:string,staffId:string){
 const [weekly,exceptions]=await Promise.all([
  tx.$queryRaw<{dayOfWeek:number;segments:unknown}[]>`SELECT "dayOfWeek",segments FROM "CourseStaffAvailability" WHERE "storeId"=${storeId} AND "staffId"=${staffId} ORDER BY "dayOfWeek"`,
  tx.$queryRaw<{date:Date;type:string;segments:unknown;reason:string|null}[]>`SELECT date,type,segments,reason FROM "CourseStaffAvailabilityException" WHERE "storeId"=${storeId} AND "staffId"=${staffId} ORDER BY date`,
 ]);
 const data={inheritStoreHours:weekly.length===0,weekly:weekly.map(row=>({dayOfWeek:row.dayOfWeek,periods:normalizeAvailabilityPeriods(row.segments)})),exceptions:exceptions.map(row=>({date:row.date.toISOString().slice(0,10),type:row.type,periods:normalizeAvailabilityPeriods(row.segments),reason:row.reason??""}))};
 const revision=createHash("sha256").update(JSON.stringify(data)).digest("hex");
 return {...data,exceptions:data.exceptions.filter(row=>row.date>=toLocalDateStr()).slice(0,20),revision};
}
export async function getCourseStaffAvailability(staffId:string){
 const {storeId}=await courseManagerRead("staff.view");await assertStaff(storeId,staffId);
 return prisma.$transaction(async tx=>({...await readAvailability(tx,storeId,staffId),storeId}),{isolationLevel:"RepeatableRead"});
}
export async function saveCourseAvailabilityConfirmed(input:unknown){
 try{
  const {user,storeId}=await courseManager("staff.manage"),{kind,values,...receipt}=courseAvailabilitySaveInput.parse(input);
  if(receipt.expectedStoreId!==storeId)throw new AppError("CONFLICT","門市已切換，請重新開啟設定");
  const weekly=kind==="weekly"?weeklySchema.parse(values):null,exception=kind==="exception"?exceptionSchema.parse(values):null,staffId=(weekly??exception)!.staffId;
  await assertStaff(storeId,staffId);
  if(exception&&new Date(exception.date+"T00:00:00Z").toISOString().slice(0,10)!==exception.date)throw new AppError("VALIDATION","日期格式不正確");
  const key=`course-availability-receipt:${storeId}:${receipt.requestKey}`;
  const data=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
   const currentStaff=await tx.staff.findFirst({where:{id:staffId,storeId,status:"ACTIVE"},select:{courseCoachEnabled:true}});if(!currentStaff?.courseCoachEnabled)throw new AppError("VALIDATION","找不到本店可授課老師");
   const committed=await tx.auditLog.findUnique({where:{id:key}});
   if(committed){if(committed.actorUserId!==user.id||committed.targetId!==staffId||z.object({kind:z.string()}).safeParse(committed.afterJson).data?.kind!==kind)throw new AppError("CONFLICT","儲存請求不一致，請重新開啟設定");return {...await readAvailability(tx,storeId,staffId),retainedSessions:await listOutsideTeacherAvailability(tx,storeId,staffId)};}
   const before=await readAvailability(tx,storeId,staffId);if(before.revision!==receipt.expectedRevision)throw new AppError("CONFLICT","可授課時間已更新，請重新開啟核對；本次修改尚未儲存");
   if(weekly){
    const seen=new Set<number>();const normalized=weekly.days.map(day=>{if(seen.has(day.dayOfWeek))throw new AppError("VALIDATION","同一星期不可重複設定");seen.add(day.dayOfWeek);return {...day,periods:validatePeriods(day.periods)};});
    await tx.$executeRaw`DELETE FROM "CourseStaffAvailability" WHERE "storeId"=${storeId} AND "staffId"=${staffId}`;
    if(!weekly.inheritStoreHours){const rows=Array.from({length:7},(_,dayOfWeek)=>({id:randomUUID(),dayOfWeek,segments:normalized.find(day=>day.dayOfWeek===dayOfWeek)?.periods??[]}));await tx.$executeRaw`INSERT INTO "CourseStaffAvailability" (id,"storeId","staffId","dayOfWeek",segments,"createdAt","updatedAt") SELECT x.id,${storeId},${staffId},x."dayOfWeek",x.segments,now(),now() FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(id text,"dayOfWeek" int,segments jsonb)`;}
   }else if(exception){
    const date=new Date(exception.date+"T00:00:00Z");
    if(exception.type==="INHERIT")await tx.$executeRaw`DELETE FROM "CourseStaffAvailabilityException" WHERE "storeId"=${storeId} AND "staffId"=${staffId} AND date=${date}::date`;
    else{const periods=exception.type==="CUSTOM"?validatePeriods(exception.periods):[];if(exception.type==="CUSTOM"&&!periods.length)throw new AppError("VALIDATION","臨時加開請至少設定一段可授課時間");await tx.$executeRaw`INSERT INTO "CourseStaffAvailabilityException" (id,"storeId","staffId",date,type,segments,reason,"createdAt","updatedAt") VALUES (${randomUUID()},${storeId},${staffId},${date}::date,${exception.type},${JSON.stringify(periods)}::jsonb,${exception.reason||null},now(),now()) ON CONFLICT ("storeId","staffId",date) DO UPDATE SET type=EXCLUDED.type,segments=EXCLUDED.segments,reason=EXCLUDED.reason,"updatedAt"=now()`;await assertExistingTeacherAvailability(tx,storeId,staffId,exception.date);}
   }
   const retainedSessions=await listOutsideTeacherAvailability(tx,storeId,staffId),saved=await readAvailability(tx,storeId,staffId);
   await tx.auditLog.create({data:{id:key,actorUserId:user.id,targetType:"Staff",targetId:staffId,action:"SETTINGS_SAVE_CONFIRMED",afterJson:{storeId,kind}}});return {...saved,retainedSessions};
  },{timeout:20000});
  let syncWarning=false;try{revalidatePath("/dashboard/teachers");revalidatePath("/dashboard/coaches");revalidatePath("/dashboard/courses");revalidatePath("/dashboard/staff");}catch{syncWarning=true;}return {success:true as const,storeId,data,syncWarning};
 }catch(error){return {...handleCourseActionError(error),uncertain:settingsSaveUncertain(error)};}
}
