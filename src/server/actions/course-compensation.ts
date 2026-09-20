"use server";
import {z} from "zod";
import {courseManager,courseTransaction} from "@/server/services/course-access";
import {coursePrisma} from "@/lib/course-db";
import {compensationRules,type CompensationRule} from "@/lib/course-compensation";
import {handleActionError,AppError} from "@/lib/errors";
import {revalidatePath} from "next/cache";
const scope=z.object({templateId:z.string().min(1).max(180),staffId:z.string().max(180).default("")});
async function actor(staffId:string){const a=await courseManager(staffId?"staff.manage":"booking.update");if(staffId&&a.user.role!=="OWNER")throw new AppError("FORBIDDEN","僅店長可設定老師報酬");return a;}
export async function readCourseCompensation(input:unknown){try{
 const d=scope.parse(input),{storeId}=await actor(d.staffId);
 const rows=await coursePrisma.$queryRaw<Array<{staffId:string;rules:CompensationRule[];revision:number}>>`SELECT "staffId",rules,revision FROM "CourseCompensation" WHERE "storeId"=${storeId} AND "templateId"=${d.templateId} AND ("staffId"='' OR "staffId"=${d.staffId})`;
 return {success:true as const,defaults:rows.find(r=>!r.staffId)?.rules??[],rules:rows.find(r=>r.staffId===d.staffId)?.rules??[],revision:rows.find(r=>r.staffId===d.staffId)?.revision??0};
}catch(e){const failure=handleActionError(e);return {success:false as const,error:!failure.success?failure.error:"操作失敗"};}}
export async function saveCourseCompensation(input:unknown){try{
 const d=scope.extend({rules:compensationRules,revision:z.number().int().min(0)}).parse(input),{storeId}=await actor(d.staffId);
 await courseTransaction(storeId,async tx=>{
  const template=await tx.courseTemplate.findFirst({where:{storeId,id:d.templateId},select:{id:true}});if(!template)throw new AppError("FORBIDDEN","找不到本店課程");
  const rows=await tx.$queryRaw<Array<{staffId:string;rules:CompensationRule[];revision:number}>>`SELECT "staffId",rules,revision FROM "CourseCompensation" WHERE "storeId"=${storeId} AND "templateId"=${d.templateId} FOR UPDATE`;
  if((rows.find(r=>r.staffId===d.staffId)?.revision??0)!==d.revision)throw new AppError("CONFLICT","設定已更新，請重新開啟核對");
  if(d.staffId){
   const staff=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Staff" WHERE id=${d.staffId} AND "storeId"=${storeId} AND "courseCoachEnabled"=true AND ${d.templateId}=ANY("courseQualifiedTemplateIds")`;
   if(!staff.length)throw new AppError("FORBIDDEN","請先儲存這位老師的授課資格");
   if(d.rules.length!==1)throw new AppError("VALIDATION","老師每個授課項目請選一種計酬方式");
   const defaults=rows.find(r=>!r.staffId)?.rules??[];if(!defaults.some(r=>r.mode===d.rules[0].mode))throw new AppError("VALIDATION","課程尚未開放此計酬方式");
  }else if(rows.some(r=>r.staffId&&r.rules.some(rule=>!d.rules.some(v=>v.mode===rule.mode))))throw new AppError("CONFLICT","有老師正在使用要移除的計酬方式，請先調整老師設定");
  await tx.$executeRaw`INSERT INTO "CourseCompensation" ("storeId","templateId","staffId",rules,revision) VALUES (${storeId},${d.templateId},${d.staffId},${JSON.stringify(d.rules)}::jsonb,1) ON CONFLICT ("storeId","templateId","staffId") DO UPDATE SET rules=EXCLUDED.rules,revision="CourseCompensation".revision+1,"updatedAt"=NOW()`;
 });revalidatePath("/dashboard","layout");return {success:true as const};
}catch(e){const failure=handleActionError(e);return {success:false as const,error:!failure.success?failure.error:"操作失敗"};}}
