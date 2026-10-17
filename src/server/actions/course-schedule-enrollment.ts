"use server";
import {musicTeachingSubjectId} from "@/lib/music-teaching-item";
import {readTeachingTrialPrice} from "@/server/services/music-teaching-item";
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
    z.string().max(100).parse(templateId);
    const {storeId,user}=await courseManager("booking.create");
    await courseManager("customer.read");
    const customers=await prisma.customer.findMany({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,mergedIntoCustomerId:null},select:{id:true,name:true,phone:true},orderBy:[{name:"asc"},{id:"asc"}],take:2000});
    const trialSettings=await getTrialSettings(storeId);
    const subjectId=musicTeachingSubjectId(templateId)??(templateId?(await coursePrisma.courseTemplate.findFirst({where:{storeId,id:templateId},select:{musicSubjectId:true}}))?.musicSubjectId:null);
    const template=templateId&&(!musicTeachingSubjectId(templateId)||templateId.startsWith("teaching-trial:")) ? await readTeachingTrialPrice(coursePrisma,storeId,templateId) : null;
    const relatedIds=subjectId?(await coursePrisma.courseTemplate.findMany({where:{storeId,musicSubjectId:subjectId,musicTrialMode:templateId.startsWith("teaching-trial:")?{in:["FREE","PAID"]}:null},select:{id:true}})).map(row=>row.id):[templateId];
    let canTrial=false;try{await courseManager("trial.create");canTrial=true;}catch{}
    const visibleIds=new Set(customers.map(person=>person.id));
    // Keep ineligible cards visible so the picker can explain why, within the same customer permissions.
    const cards:Awaited<ReturnType<typeof getCourseCards>>=[];
    if(templateId&&visibleIds.size)for(let skip=0;;skip+=500){
      const batch=await getCourseCards(storeId,undefined,{where:{closedAt:null,members:{some:{customerId:{in:[...visibleIds]}}}},skip,take:500,entries:false});
      cards.push(...batch);if(batch.length<500)break;
    }
    const visibleCards=cards.filter(card=>card.members.some(member=>!!member.id&&visibleIds.has(member.id)));
    const starts=visibleCards.length?await coursePrisma.coursePointCard.findMany({where:{storeId,id:{in:visibleCards.map(card=>card.id)}},select:{id:true,musicJoinSessionId:true}}):[];
    const joinIds=[...new Set(starts.flatMap(card=>card.musicJoinSessionId?[card.musicJoinSessionId]:[]))];
    const joins=joinIds.length?await coursePrisma.courseSession.findMany({where:{storeId,id:{in:joinIds}},select:{id:true,startsAt:true}}):[];
    const startByCard=new Map(starts.map(card=>[card.id,{startRequired:!!card.musicJoinSessionId,startsAt:joins.find(join=>join.id===card.musicJoinSessionId)?.startsAt.toISOString()??null}]));
    return {success:true as const,customers,trialSettings:{enabled:canTrial&&trialSettings.trialEnabled,price:courseTrialPrice(undefined,trialSettings,template??undefined)},cards:visibleCards.map(card=>({...startByCard.get(card.id),id:card.id,name:card.name,unit:card.unit,available:card.available,remaining:card.remaining,held:card.held,expired:card.expired,unavailableReason:card.openingIssue,subjectMatches:!card.templateIds.length||card.templateIds.includes(templateId)||card.templateIds.some(id=>relatedIds.includes(id)),expiresAt:card.expiresAt,members:card.members.filter(member=>!!member.id&&visibleIds.has(member.id))}))};
  }catch(error){const failure=handleActionError(error);return {success:false as const,error:failure.success?"學員讀取失敗":failure.error};}
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
