"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { AppError, handleActionError } from "@/lib/errors";

export async function saveMusicSubject(input: unknown) {
  try {
    const data = z.object({id:z.string().optional(),expectedUpdatedAt:z.string().datetime().optional(),name:z.string().trim().min(1).max(80),category:z.string().trim().max(40).default(""),description:z.string().trim().max(5000).default(""),isActive:z.boolean()}).parse(input);
    const {storeId}=await courseManager(data.id?"booking.update":"booking.create");
    if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"}}))throw new AppError("FORBIDDEN","此功能僅適用音樂教室");
    const {id,expectedUpdatedAt,...values}=data;
    await courseTransaction(storeId,async tx=>{
      if(id){
        const result=await tx.musicSubject.updateMany({where:{id,storeId,...(expectedUpdatedAt?{updatedAt:new Date(expectedUpdatedAt)}:{})},data:values});
        if(!result.count)throw new AppError("CONFLICT","課程資料已有更新，請重新開啟後再編輯");
      } else await tx.musicSubject.create({data:{storeId,...values}});
    });
    revalidatePath("/dashboard/courses");
    return {success:true as const};
  }catch(error){return handleActionError(error);}
}
