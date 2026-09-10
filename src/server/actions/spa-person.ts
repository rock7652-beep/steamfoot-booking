"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { spaResourceStore } from "./spa-resources";
import { AppError, handleActionError } from "@/lib/errors";
import { requireStoreFeature, getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
const schema=z.object({name:z.string().trim().min(1,"請填姓名").max(100),phone:z.string().trim().max(20).optional(),colorCode:z.string().regex(/^#[0-9a-fA-F]{6}$/),requestKey:z.string().uuid()});
/** Creates a scheduling person only, never a login-capable staff account. */
export async function createSpaPerson(input:z.infer<typeof schema>){
 try{
  const user=await requirePermission("duty.manage");
  if(user.role!=="OWNER")throw new AppError("FORBIDDEN","僅店長可新增服務人員");
  const storeId=await spaResourceStore("duty.manage");const d=schema.parse(input);
  await requireStoreFeature(storeId,FEATURES.STAFF_MANAGEMENT);
  const limits=await getStoreLimitsByStoreId(storeId);
  const staffId=`spa-person:${storeId}:${d.requestKey}`;
  await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
   if(await tx.staff.findFirst({where:{id:staffId,storeId}}))return;
   const count=await tx.staff.count({where:{storeId,status:"ACTIVE"}});
   if(limits.maxStaff!==null&&count>=limits.maxStaff)throw new AppError("FORBIDDEN","已達方案可用人員數量上限");
   await tx.user.create({data:{id:`spa-person-user:${storeId}:${d.requestKey}`,name:d.name,phone:d.phone||null,role:"CUSTOMER",status:"SUSPENDED",email:null,passwordHash:null,staff:{create:{id:staffId,storeId,displayName:d.name,colorCode:d.colorCode,isOwner:false,status:"ACTIVE",spaceFeeEnabled:false}}}});
  });
  revalidatePath("/dashboard/spa-staff");revalidatePath("/dashboard/plans");revalidatePath("/dashboard/spa-schedule");
  return{success:true as const,staffId};
 }catch(e){const r=handleActionError(e);return{success:false as const,error:r.success?"新增失敗":r.error};}
}
