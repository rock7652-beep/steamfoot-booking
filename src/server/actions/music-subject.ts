"use server";
import { musicDataSeparationEnabled } from "@/server/services/music-data-scope";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { AppError, handleActionError } from "@/lib/errors";

export async function saveMusicSubject(input: unknown) {
  try {
    const data = z.object({id:z.string().optional(),expectedUpdatedAt:z.string().datetime().optional(),name:z.string().trim().min(1).max(80),category:z.string().trim().max(40).default(""),description:z.string().trim().max(5000).default(""),isActive:z.boolean(),classType:z.enum(["PRIVATE","SELF_ORGANIZED","GROUP"]).optional(),durationMinutes:z.union([z.literal(30),z.literal(60),z.literal(90),z.literal(120)]).optional(),capacity:z.number().int().min(1).max(500).optional()}).parse(input);
    const {storeId}=await courseManager(data.id?"booking.update":"booking.create");
    if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"}}))throw new AppError("FORBIDDEN","此功能僅適用音樂教室");
    const {id,expectedUpdatedAt,classType,durationMinutes,capacity,...values}=data;
    await courseTransaction(storeId,async tx=>{
      let subjectId=id;
      if(id){
        const result=await tx.musicSubject.updateMany({where:{id,storeId,...(expectedUpdatedAt?{updatedAt:new Date(expectedUpdatedAt)}:{})},data:values});
        if(!result.count)throw new AppError("CONFLICT","課程資料已有更新，請重新開啟後再編輯");
      } else subjectId=(await tx.musicSubject.create({data:{storeId,...values}})).id;
      if(musicDataSeparationEnabled(storeId)&&classType&&durationMinutes&&capacity){
        if(classType==="PRIVATE"&&capacity!==1)throw new AppError("VALIDATION","個別課人數上限為 1 人");
        const versions=await tx.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId},select:{id:true,classType:true}});
        if(versions.some(t=>t.classType!==classType))throw new AppError("VALIDATION","此項目已有其他授課型態，請另建項目以保留歷史紀錄");
        if(versions.length)await tx.courseTemplate.updateMany({where:{storeId,musicSubjectId:subjectId},data:{durationMinutes,capacity}});
        else await tx.courseTemplate.create({data:{storeId,musicSubjectId:subjectId,name:values.name+" · 排課",classType,durationMinutes,capacity,pointCost:1,category:values.category,description:values.description,musicScheduleMode:"FIXED"}});
      }
    });
    revalidatePath("/dashboard/courses");
    return {success:true as const};
  }catch(error){return handleActionError(error);}
}
