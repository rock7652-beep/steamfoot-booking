'use server';
import {revalidatePath} from 'next/cache';
import {courseManager,courseTransaction} from '@/server/services/course-access';
import {adjustCourseSessions} from '@/server/services/course-session-adjustment';
import {sessionAdjustmentInput,type SessionAdjustmentResult} from '@/lib/plan-session-adjustment';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {prisma} from '@/lib/db';
import {AppError,handleActionError} from '@/lib/errors';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';

export async function saveCourseSessionAdjustment(input:unknown):Promise<SessionAdjustmentResult>{
  let committed=false;
  try{
    const d=sessionAdjustmentInput.parse(input),{user,storeId}=await courseManager('wallet.adjust');
    if(storeId!==d.expectedStoreId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
    await courseManager('customer.read');await courseManager('wallet.read');
    await requireStoreFeature(storeId,FEATURES.PLAN_MANAGEMENT);await requireStoreFeature(storeId,FEATURES.CUSTOMER_MANAGEMENT);
    const result=await courseTransaction(storeId,async tx=>{
      const members=await tx.courseCardMember.findMany({where:{storeId,cardId:d.cardId},select:{customerId:true}});
      if(!members.length||!members.some(m=>m.customerId===d.customerId))throw new AppError('FORBIDDEN','方案學員關聯不完整，請先核對');
      const people=await prisma.customer.findMany({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,id:{in:members.map(m=>m.customerId)},mergedIntoCustomerId:null},select:{id:true,name:true}});
      if(people.length!==members.length)throw new AppError('FORBIDDEN','僅能調整有權管理之學員的方案');
      return adjustCourseSessions(tx,{storeId,userId:user.id,name:user.name??undefined,role:user.role},d,people.find(p=>p.id===d.customerId)!.name);
    });committed=true;
    let syncWarning=false;try{revalidatePath('/dashboard/courses');revalidatePath('/courses');revalidatePath('/book');}catch{syncWarning=true;}
    return {success:true,data:result,syncWarning};
  }catch(error){const r=handleActionError(error);return {success:false,error:r.success?'調整結果尚未確認':r.error,uncertain:committed||settingsSaveUncertain(error)};}
}
