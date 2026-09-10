"use server";

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
