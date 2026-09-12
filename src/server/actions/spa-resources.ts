"use server";

import { parseTaiwanDateToDbDate } from "@/lib/date-utils";
import { dateShiftExceptions, effectiveShifts, previousWeekDates } from "@/lib/spa-roster";
import { validSpaDate, staffAvailable } from "@/lib/spa-scheduling";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { requirePermission, type PermissionCode } from "@/lib/permissions";
import { requireSpaStore } from "@/lib/industry-module-server";
import { getStoreContext } from "@/lib/store-context";
import { AppError, handleActionError } from "@/lib/errors";

export async function spaResourceStore(permission: PermissionCode) {
  const user = await requirePermission(permission);
  const context = await getStoreContext();
  if (!context) throw new AppError("FORBIDDEN", "請從店家後台開啟設定");
  if (user.role !== "ADMIN" && !await prisma.staff.findFirst({where:{userId:user.id,storeId:context.storeId,status:"ACTIVE"},select:{id:true}})) throw new AppError("FORBIDDEN", "無權管理這家店");
  await requireSpaStore(context.storeId);
  return context.storeId;
}

const locationSchema = z.object({id:z.string().optional(),name:z.string().trim().min(1,"請填位置名稱").max(60),isActive:z.boolean(),treatmentIds:z.array(z.string()).max(200)});
export async function saveSpaLocation(input: z.infer<typeof locationSchema>) {
  try {
    const storeId = await spaResourceStore("business_hours.manage");
    const data = locationSchema.parse(input);
    await spaPrisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
      const ids = [...new Set(data.treatmentIds)];
      if (await tx.spaTreatment.count({where:{storeId,id:{in:ids}}}) !== ids.length) throw new AppError("VALIDATION","療程不屬於本店");
      if(data.id && !await tx.spaServiceLocation.findFirst({where:{id:data.id,storeId}})) throw new AppError("NOT_FOUND","找不到服務位置");
      const location = data.id ? await tx.spaServiceLocation.update({where:{id_storeId:{id:data.id,storeId}},data:{name:data.name,isActive:data.isActive}}) : await tx.spaServiceLocation.create({data:{storeId,name:data.name,isActive:data.isActive}});
      await tx.spaTreatmentServiceLocation.deleteMany({where:{storeId,serviceLocationId:location.id}});
      await tx.spaTreatmentServiceLocation.createMany({data:ids.map(treatmentId=>({storeId,treatmentId,serviceLocationId:location.id}))});
    });
    revalidatePath("/dashboard/spa-resources"); revalidatePath("/dashboard/spa-schedule");
    return {success:true as const};
  } catch(error) { return handleActionError(error); }
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const staffSchema=z.object({staffId:z.string().min(1),skillIds:z.array(z.string()).max(200),shifts:z.array(z.object({dayOfWeek:z.number().int().min(0).max(6),startTime:time,endTime:time}).refine(d=>d.endTime>d.startTime,"結束時間必須晚於開始時間")).max(7).refine(rows=>new Set(rows.map(r=>r.dayOfWeek)).size===rows.length,"服務日不可重複")});
export async function saveSpaStaffSchedule(input:z.infer<typeof staffSchema>){
  try{
    const storeId=await spaResourceStore("duty.manage");const d=staffSchema.parse(input);
    if(!await prisma.staff.findFirst({where:{id:d.staffId,storeId,status:"ACTIVE"}}))throw new AppError("FORBIDDEN","找不到本店有效人員");
    await spaPrisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
      const ids=[...new Set(d.skillIds)];
      if(await tx.spaSkill.count({where:{storeId,id:{in:ids},isActive:true}})!==ids.length)throw new AppError("VALIDATION","專業項目不屬於本店");
      await tx.spaStaffSkill.deleteMany({where:{storeId,staffId:d.staffId}});
      await tx.spaStaffSkill.createMany({data:ids.map(skillId=>({storeId,staffId:d.staffId,skillId}))});
      await tx.spaStaffAvailability.deleteMany({where:{storeId,staffId:d.staffId}});
      await tx.spaStaffAvailability.createMany({data:d.shifts.map(shift=>({storeId,staffId:d.staffId,...shift,isActive:true}))});
    });revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/spa-schedule");return{success:true as const};
  }catch(error){return handleActionError(error);}
}

const dateRosterSchema=z.object({staffId:z.string().min(1),date:z.string().refine(validSpaDate,"日期不正確"),shifts:z.array(z.object({startTime:time,endTime:z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/)}).refine(s=>s.startTime<s.endTime,"結束時間必須晚於開始時間")).max(12).refine(rows=>{const sorted=[...rows].sort((a,b)=>a.startTime.localeCompare(b.startTime));return sorted.every((s,i)=>i===0||sorted[i-1].endTime<=s.startTime);},"班別不可重疊")});
const rosterBatchSchema=z.object({staffId:z.string().min(1),days:z.array(dateRosterSchema.omit({staffId:true})).min(1).max(31).refine(rows=>new Set(rows.map(r=>r.date)).size===rows.length,"日期不可重複")});
export async function saveSpaDateRoster(input:z.infer<typeof dateRosterSchema>){
 return saveSpaRosterBatch({staffId:input.staffId,days:[{date:input.date,shifts:input.shifts}]});
}
export async function saveSpaRosterBatch(input:z.infer<typeof rosterBatchSchema>){
 try{
  const storeId=await spaResourceStore("duty.manage");const data=rosterBatchSchema.parse(input);
  if(!await prisma.staff.findFirst({where:{id:data.staffId,storeId,status:"ACTIVE"}}))throw new AppError("FORBIDDEN","找不到本店有效人員");
  const days=data.days.map(day=>({...day,dbDate:parseTaiwanDateToDbDate(day.date),exceptions:dateShiftExceptions(day.shifts)}));
  await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   // Validate every target before replacing any date; a conflict preserves the entire batch.
   const bookings=await tx.spaBooking.findMany({where:{storeId,serviceStaffId:data.staffId,bookingDate:{in:days.map(d=>d.dbDate)},status:{in:["PENDING","CONFIRMED"]}},select:{bookingDate:true,startTime:true,endTime:true}});
   for(const day of days){
    if(bookings.some(b=>b.bookingDate.getTime()===day.dbDate.getTime()&&!staffAvailable(b.startTime,b.endTime,null,day.exceptions)))throw new AppError("VALIDATION",`${day.date} 的班別未涵蓋既有預約，整批尚未儲存`);
   }
   await tx.spaStaffAvailabilityException.deleteMany({where:{storeId,staffId:data.staffId,date:{in:days.map(d=>d.dbDate)}}});
   await tx.spaStaffAvailabilityException.createMany({data:days.flatMap(day=>day.exceptions.map(e=>({...e,storeId,staffId:data.staffId,date:day.dbDate,reason:"月曆排班"})))});
  });revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/spa-schedule");return{success:true as const};
 }catch(error){return handleActionError(error);}
}
export async function previewSpaPreviousWeek(input:{staffId:string;date:string}){
 try{
  const storeId=await spaResourceStore("duty.manage");const d=z.object({staffId:z.string().min(1),date:z.string().refine(validSpaDate)}).parse(input);
  if(!await prisma.staff.findFirst({where:{id:d.staffId,storeId,status:"ACTIVE"}}))throw new AppError("FORBIDDEN","找不到本店有效人員");
  const dates=previousWeekDates(d.date);
  const [regular,exceptions]=await Promise.all([spaPrisma.spaStaffAvailability.findMany({where:{storeId,staffId:d.staffId}}),spaPrisma.spaStaffAvailabilityException.findMany({where:{storeId,staffId:d.staffId,date:{in:dates.map(day=>parseTaiwanDateToDbDate(day.source))}}})]);
  return {success:true as const,days:dates.map(day=>({date:day.target,shifts:effectiveShifts(regular.find(r=>r.dayOfWeek===parseTaiwanDateToDbDate(day.source).getUTCDay())??null,exceptions.filter(e=>e.date.getTime()===parseTaiwanDateToDbDate(day.source).getTime()))}))};
 }catch(error){const r=handleActionError(error);return{success:false as const,error:r.success?"讀取失敗":r.error};}
}
const skillSchema=z.object({id:z.string().optional(),name:z.string().trim().min(1,"請填專業項目名稱").max(60),remove:z.boolean().optional()});
export async function saveSpaSkill(input:z.infer<typeof skillSchema>){
 try{
  const storeId=await spaResourceStore("wallet.create");const d=skillSchema.parse(input);
  await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   if(d.id&&!await tx.spaSkill.findFirst({where:{id:d.id,storeId}}))throw new AppError("NOT_FOUND","找不到專業項目");
   if(d.remove){
    if(!d.id)throw new AppError("VALIDATION","請選擇專業項目");
    if(await tx.spaTreatmentSkill.count({where:{storeId,skillId:d.id}}))throw new AppError("VALIDATION","仍有療程使用此項目，請先調整療程的專業需求再移除");
    await tx.spaStaffSkill.deleteMany({where:{storeId,skillId:d.id}});
    await tx.spaSkill.delete({where:{id_storeId:{id:d.id,storeId}}});
   }else if(d.id){await tx.spaSkill.update({where:{id_storeId:{id:d.id,storeId}},data:{name:d.name}});}
   else{await tx.spaSkill.create({data:{storeId,name:d.name}});}
  });revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/plans");return{success:true as const};
 }catch(error){return handleActionError(error);}
}
export async function saveSpaPersonSkills(input:{staffId:string;skillIds:string[]}){
 try{
  const storeId=await spaResourceStore("duty.manage");const d=z.object({staffId:z.string().min(1),skillIds:z.array(z.string()).max(200)}).parse(input);
  if(!await prisma.staff.findFirst({where:{id:d.staffId,storeId,status:"ACTIVE"}}))throw new AppError("FORBIDDEN","找不到本店有效人員");
  await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   const ids=[...new Set(d.skillIds)];
   if(await tx.spaSkill.count({where:{storeId,id:{in:ids},isActive:true}})!==ids.length)throw new AppError("VALIDATION","專業項目不屬於本店");
   await tx.spaStaffSkill.deleteMany({where:{storeId,staffId:d.staffId}});
   await tx.spaStaffSkill.createMany({data:ids.map(skillId=>({storeId,staffId:d.staffId,skillId}))});
  });revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/spa-schedule");return{success:true as const};
 }catch(error){return handleActionError(error);}
}
export async function saveSpaTreatmentSkills(input:{treatmentId:string;skillIds:string[]}){
 try{
  const storeId=await spaResourceStore("wallet.create");const d=z.object({treatmentId:z.string().min(1),skillIds:z.array(z.string()).max(200)}).parse(input);
  await spaPrisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   if(!await tx.spaTreatment.findFirst({where:{storeId,id:d.treatmentId}}))throw new AppError("FORBIDDEN","找不到本店療程");
   const ids=[...new Set(d.skillIds)];
   if(await tx.spaSkill.count({where:{storeId,id:{in:ids},isActive:true}})!==ids.length)throw new AppError("VALIDATION","專業項目不屬於本店");
   await tx.spaTreatmentSkill.deleteMany({where:{storeId,treatmentId:d.treatmentId}});
   await tx.spaTreatmentSkill.createMany({data:ids.map(skillId=>({storeId,treatmentId:d.treatmentId,skillId}))});
  });revalidatePath("/dashboard/plans");revalidatePath("/dashboard/spa-schedule");return{success:true as const};
 }catch(error){return handleActionError(error);}
}
