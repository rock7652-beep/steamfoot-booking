"use server";
import { z } from "zod";
import { courseManager } from "@/server/services/course-access";
import { getCourseCards } from "@/server/queries/course-members";
import { handleActionError } from "@/lib/errors";

export async function loadCourseScheduleEnrollmentOptions(templateId:string) {
  try {
    z.string().min(1).max(100).parse(templateId);
    const {storeId}=await courseManager("booking.create");
    const cards=await getCourseCards(storeId,undefined,{where:{closedAt:null,expiresAt:{gte:new Date()},termSessionIds:{isEmpty:true},OR:[{templateIds:{isEmpty:true}},{templateIds:{has:templateId}}]},skip:0,take:500,entries:false});
    return {success:true as const,cards:cards.map(card=>({id:card.id,name:card.name,unit:card.unit,available:card.available,expiresAt:card.expiresAt,members:card.members}))};
  }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?"學員讀取失敗":failure.error};}
}
