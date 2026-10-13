"use server";
import { z } from "zod";
import { courseManager } from "@/server/services/course-access";
import { getCourseCards } from "@/server/queries/course-members";
import { handleActionError, AppError } from "@/lib/errors";
import {coursePrisma} from "@/lib/course-db";
import {courseTrialPrice} from "@/lib/course-trial-price";
import { normalizePhone } from "@/lib/normalize";
import { prisma } from "@/lib/db";
import { getTrialSettings } from "@/lib/shop-config";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { getStoreLimitsByStoreId } from "@/lib/feature-gate";
import { revalidatePath } from "next/cache";

export async function loadCourseScheduleEnrollmentOptions(templateId:string) {
  try {
    z.string().min(1).max(100).parse(templateId);
    const {storeId,user}=await courseManager("booking.create");
    await courseManager("customer.read");
    const customers=await prisma.customer.findMany({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true},orderBy:[{name:"asc"},{id:"asc"}],take:2000});
    const trialSettings=await getTrialSettings(storeId);
    const template=await coursePrisma.courseTemplate.findFirst({where:{id:templateId,storeId},select:{musicTrialMode:true,musicPricePerLesson:true,category:true}});
    let canTrial=false;try{await courseManager("trial.create");canTrial=true;}catch{}
    const visibleIds=new Set(customers.map(person=>person.id));
    const cards=await getCourseCards(storeId,undefined,{where:{closedAt:null,expiresAt:{gte:new Date()},termSessionIds:{isEmpty:true},OR:[{templateIds:{isEmpty:true}},{templateIds:{has:templateId}}]},skip:0,take:500,entries:false});
    return {success:true as const,customers,trialSettings:{enabled:canTrial&&trialSettings.trialEnabled,price:courseTrialPrice(undefined,trialSettings,template??undefined)},cards:cards.map(card=>({id:card.id,name:card.name,unit:card.unit,available:card.available,expiresAt:card.expiresAt,members:card.members.filter(member=>!!member.id&&visibleIds.has(member.id))}))};
  }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?"學員讀取失敗":failure.error};}
}


/** Load plans that can be paid for inline while scheduling, with the same store and permission checks as checkout. */
export async function loadCourseSchedulePurchaseOptions(templateId:string,customerId:string) {
  try {
    z.string().min(1).max(100).parse(templateId);
    z.string().min(1).max(100).parse(customerId);
    const {storeId,user}=await courseManager("wallet.create");
    await courseManager("transaction.create");
    await courseManager("customer.read");
    const visible=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),id:customerId,storeId,mergedIntoCustomerId:null},select:{id:true}});
    if(!visible)throw new AppError("NOT_FOUND","找不到可操作的本店學員");
    const {checkPermission}=await import("@/lib/permissions");
    const [plans,canDiscount]=await Promise.all([
      coursePrisma.coursePointPlan.findMany({where:{storeId,isActive:true,unit:"SESSION",OR:[{templateIds:{isEmpty:true}},{templateIds:{has:templateId}}]},select:{id:true,name:true,points:true,price:true,storeCost:true,validDays:true,musicTerms:true,musicTermSizes:true,musicBonusLessons:true},orderBy:[{points:"asc"},{name:"asc"}]}),
      checkPermission(user.role,user.staffId,"transaction.discount"),
    ]);
    return {success:true as const,data:{plans,canDiscount}};
  }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?"讀取可購買方案失敗":failure.error};}
}

/** Inline enrollment reuses the same store customer and never overwrites a duplicate phone. */
export async function createScheduleCustomer(input:unknown) {
  try {
    const {storeId,user}=await courseManager("customer.create");
    await courseManager("customer.read");
    const data=z.object({name:z.string().trim().min(1).max(80),phone:z.string().trim().min(5).max(30)}).parse(input);
    data.phone=normalizePhone(data.phone);
    if(!/^09\d{8}$/.test(data.phone))throw new AppError("VALIDATION","手機請填 09 開頭共 10 碼");
    const limits=await getStoreLimitsByStoreId(storeId);
    const customer=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      const existing=await tx.customer.findFirst({where:{storeId,phone:data.phone,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true}});
      if(existing){
        if(!await tx.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),id:existing.id,storeId},select:{id:true}}))throw new AppError("FORBIDDEN","此電話已有顧客，請由有權限人員核對");
        return {...existing,existing:true};
      }
      if(limits.maxCustomers!==null&&await tx.customer.count({where:{storeId,mergedIntoCustomerId:null}})>=limits.maxCustomers)throw new AppError("FORBIDDEN","已達顧客額度上限");
      const created=await tx.customer.create({data:{storeId,...data},select:{id:true,name:true,phone:true}});
      await tx.auditLog.create({data:{actorUserId:user.id,storeId,module:"COURSE",summary:"排課新增學員",targetType:"Customer",targetId:created.id,action:"CREATE_CUSTOMER",afterJson:{storeId,...created}}});
      return {...created,existing:false};
    });
    revalidatePath("/dashboard/customers");
    return {success:true as const,customer};
  }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?"新增失敗":failure.error};}
}
