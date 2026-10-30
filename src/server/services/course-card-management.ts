import 'server-only';
import type {Prisma} from '../../../generated/course-client';
import {AppError} from '@/lib/errors';
import {dayRange,parseTaipeiDateTime,toLocalDateStr,addTaiwanDuration} from '@/lib/date-utils';
import type {PlanManagementInput} from '@/lib/plan-management';
import {planManagementCommand,type PlanManagementActor} from './plan-management-command';

/** The caller holds lockCourseStore. Closing preserves purchases and all entries. */
export async function manageCourseCard(tx:Prisma.TransactionClient,a:PlanManagementActor,d:PlanManagementInput){
 return planManagementCommand(tx,a,d,'CoursePointCard','COURSE',async()=>{
  const card=await tx.coursePointCard.findFirst({where:{id:d.cardId,storeId:a.storeId}});
  if(!card)throw new AppError('NOT_FOUND','找不到本店方案');
  if(card.closedAt||card.remaining!==d.expectedRemaining||(card.expiresAt?.toISOString()??null)!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案額度或期限已更新，請重新開啟核對');
  if(card.musicOpeningStateRequired||['music-leave-makeup:','no-show-makeup:','yjy-pilot-'].some(prefix=>card.requestKey.startsWith(prefix)))throw new AppError('BUSINESS_RULE','來源方案或補課權益請由原專用流程核對，不能改寫');
  const before={remaining:card.remaining,expiresAt:card.expiresAt?.toISOString()??null,closedAt:null,musicValidityDays:card.musicValidityDays,musicActivatedAt:card.musicActivatedAt?.toISOString()??null};
  if(d.operation==='close'){
   if(await tx.courseBooking.count({where:{storeId:a.storeId,cardId:card.id,status:'RESERVED'}}))throw new AppError('BUSINESS_RULE','仍有預約占用，請先取消或改用其他方案再註銷');
   await tx.coursePointCard.update({where:{id:card.id},data:{remaining:0,closedAt:new Date()}});
   if(card.remaining)await tx.coursePointEntry.create({data:{storeId:a.storeId,cardId:card.id,kind:'VOID',points:card.remaining,actorUserId:a.userId}});
   return {before,result:{id:card.id,remaining:0,expiresAt:before.expiresAt,closed:true}};
  }
  const date=d.expiresDate??'';
  if(!parseTaipeiDateTime(date,'00:00')||date<toLocalDateStr()||date<toLocalDateStr(card.createdAt)||date>addTaiwanDuration(toLocalDateStr(),3650,'DAY'))throw new AppError('VALIDATION','請選擇不早於今天或建立日、且在未來十年內的有效日期');
  const expiresAt=dayRange(date).end;
  if(await tx.courseBooking.count({where:{storeId:a.storeId,cardId:card.id,status:'RESERVED',session:{endsAt:{gt:expiresAt}}}}))throw new AppError('BUSINESS_RULE','新期限早於既有預約，請先調整相關預約');
  // Manual finite expiry becomes authoritative; future first-attendance/restore
  // must not silently overwrite the manager's reviewed date.
  await tx.coursePointCard.update({where:{id:card.id},data:{expiresAt,musicValidityDays:null}});
  return {before,result:{id:card.id,remaining:card.remaining,expiresAt:expiresAt.toISOString(),closed:false}};
 });
}
