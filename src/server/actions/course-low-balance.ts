"use server";
import { coursePrisma } from "@/lib/course-db";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { requireStoreFeature } from "@/lib/feature-gate";
import { requireWritablePermission } from "@/lib/permissions";
import { FEATURES } from "@/lib/feature-flags";
import { courseLowBalanceSchema } from "@/lib/course-low-balance";
import { AppError, handleActionError } from "@/lib/errors";
import { revalidatePath } from "next/cache";

export async function getCourseLowBalanceSettings() {
  const {storeId}=await courseManager("business_hours.manage");
  await requireStoreFeature(storeId,FEATURES.LINE_REMINDER);
  return coursePrisma.coursePointPlan.findMany({where:{storeId},select:{id:true,name:true,unit:true,isActive:true,lowBalanceEnabled:true,lowBalanceThreshold:true},orderBy:[{isActive:"desc"},{name:"asc"}]});
}
export async function saveCourseLowBalanceSetting(input:unknown) {
  try {
    await requireWritablePermission("business_hours.manage");
    const {storeId}=await courseManager("business_hours.manage"),data=courseLowBalanceSchema.parse(input);
    await requireStoreFeature(storeId,FEATURES.LINE_REMINDER);
    await courseTransaction(storeId,async tx=>{
      const saved=await tx.coursePointPlan.updateMany({where:{id:data.planId,storeId},data:{lowBalanceEnabled:data.enabled,lowBalanceThreshold:data.threshold}});
      if(!saved.count) throw new AppError("NOT_FOUND","找不到本店方案");
    });
    revalidatePath("/dashboard/courses/reminders");
    return {success:true as const};
  } catch(error) {return handleActionError(error);}
}
