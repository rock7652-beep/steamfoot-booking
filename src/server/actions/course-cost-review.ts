'use server';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {courseManager,courseTransaction} from '@/server/services/course-access';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {checkPermission} from '@/lib/permissions';
import {courseChargeSettings} from '@/lib/course-charge-settings';
import {courseCostReviewerRole,courseFeeCostVersion} from '@/lib/course-cost-review';
import {AppError,handleActionError} from '@/lib/errors';
/** Records the manager's check only; it never edits a fee, card, receipt or settlement. */
export async function confirmCourseFeeCosts(input:unknown){try{
 const data=z.object({id:z.string().min(1).max(100),expectedVersion:z.string().min(1).max(10000)}).parse(input);
 const {storeId,user}=await courseManager('plans.edit');
 if(!courseCostReviewerRole(user.role)||!(await Promise.all((['report.read','transaction.read'] as const).map(p=>checkPermission(user.role,user.staffId,p)))).every(Boolean))throw new AppError('FORBIDDEN','僅有成本與報表權限的店長可核對');
 if(!await hasStoreFeature(storeId,FEATURES.BASIC_REPORTS))throw new AppError('FORBIDDEN','成本報表尚未開通');
 const result=await courseTransaction(storeId,async tx=>{
  const plan=await tx.coursePointPlan.findFirst({where:{id:data.id,storeId}});
  if(!plan)throw new AppError('NOT_FOUND','找不到本店收費方式');
  const charge=courseChargeSettings.safeParse(plan.chargeSettings);
  if(plan.chargeSettings!==null&&!charge.success)throw new AppError('VALIDATION','請先修正收費格式再核對成本');
  if(charge.success&&charge.data.kind==='single'&&charge.data.trialPrice!==null&&charge.data.trialStoreCost==null)throw new AppError('VALIDATION','體驗成本尚未設定，請先到收費方式補齊');
  const version=courseFeeCostVersion(plan);
  if(version!==data.expectedVersion)throw new AppError('CONFLICT','收費設定已變更，請重新整理後核對');
  const id='cost-reviewed:'+createHash('sha256').update(JSON.stringify([storeId,plan.id,version])).digest('hex');
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId","targetType","targetId",action,"afterJson","createdAt") VALUES (${id},${user.id},${storeId},'CoursePointPlan',${plan.id},'CONFIRM_COSTS',${JSON.stringify({version})}::jsonb,NOW()) ON CONFLICT(id) DO NOTHING`;
  return {id:plan.id,version};
 });
 return {success:true as const,...result};
}catch(error){const result=handleActionError(error);return {success:false as const,error:result.success?'核對未完成':result.error};}}
