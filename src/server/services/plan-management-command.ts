import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {AppError} from '@/lib/errors';
import type {PlanManagementInput,PlanManagementReceipt} from '@/lib/plan-management';
import {currentAuditActor} from '@/lib/audit-db-context';

type Tx=Pick<Prisma.TransactionClient,'$queryRaw'|'$executeRaw'>;
export type PlanManagementActor={storeId:string;userId:string;name?:string;role?:string};
/** Caller authorizes ownership and holds the module's transaction locks.
 * The immutable audit is also the durable receipt, including after a lost reply. */
export async function planManagementCommand(tx:Tx,a:PlanManagementActor,d:PlanManagementInput,
 targetType:'CoursePointCard'|'CustomerPlanWallet',module:'COURSE'|'STEAM',
 work:()=>Promise<{before:Prisma.InputJsonObject;result:PlanManagementReceipt}>){
 if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
 const id='plan-management:'+createHash('sha256').update(JSON.stringify([module,a.storeId,d.requestKey])).digest('hex');
 const fingerprint=createHash('sha256').update(JSON.stringify([targetType,a.userId,d])).digest('hex');
 const previous=await tx.$queryRaw<Array<{afterJson:{fingerprint:string;result:PlanManagementReceipt}}>>`SELECT "afterJson" FROM "AuditLog" WHERE id=${id} AND "storeId"=${a.storeId}`;
 if(previous.length){
  if(previous[0].afterJson?.fingerprint!==fingerprint)throw new AppError('CONFLICT','此操作識別碼已使用，請重新核對');
  return previous[0].afterJson.result;
 }
 const {before,result}=await work();
 const context=currentAuditActor(),verified=context?.id===a.userId?context:null;
 const after={fingerprint,result,reason:d.reason};
 await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","actorRoleSnapshot","loginRecordId","storeId",module,source,"targetType","targetId",action,summary,"beforeJson","afterJson","createdAt")
 VALUES (${id},${a.userId},${verified?.name??a.name??null},${verified?.role??a.role??null},${verified?.loginRecordId??null},${a.storeId},CASE WHEN ${module}='COURSE' THEN CASE WHEN EXISTS (SELECT 1 FROM "StoreFeatureEntitlement" WHERE "storeId"=${a.storeId} AND "featureKey"='business.music' AND status::text='ENABLED') THEN 'MUSIC' ELSE 'FITNESS' END ELSE ${module} END,'MANUAL',${targetType},${d.cardId},${d.operation==='close'?'CLOSE_CARD':'CARD_EXPIRY'},${d.operation==='close'?'註銷方案剩餘額度，保留原收款與歷史':'調整方案期限，保留原堂數與收款'},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,NOW())`;
 return result;
}
