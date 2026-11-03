import 'server-only';
import {z} from 'zod';
import {AppError} from '@/lib/errors';
import {dayRange,parseTaipeiDateTime,toLocalDateStr,addTaiwanDuration} from '@/lib/date-utils';
import {audit,command,type BeautyActor} from './access';
import type {Tx} from './booking';
export const beautyCardManagementInput=z.object({expectedStoreId:z.string().min(1),requestKey:z.string().uuid(),cardId:z.string().min(1),operation:z.enum(['close','expiry']),expectedRemaining:z.number().int().nonnegative(),expectedExpiresAt:z.string().datetime(),reason:z.string().trim().min(1,'請填寫調整原因').max(500),expiresDate:z.string().optional()});
export async function manageBeautyCard(tx:Tx,a:BeautyActor,d:z.infer<typeof beautyCardManagementInput>){
 return command(tx,a,d.requestKey,{command:'card-management',...d},async()=>{
  if(d.expectedStoreId!==a.storeId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');
  const card=await tx.beautyCard.findFirst({where:{id:d.cardId,storeId:a.storeId}});
  if(!card)throw new AppError('NOT_FOUND','找不到本店方案');
  if(card.closedAt||card.remaining!==d.expectedRemaining||card.expiresAt.toISOString()!==d.expectedExpiresAt)throw new AppError('CONFLICT','方案額度或期限已更新，請重新開啟核對');
  const before={remaining:card.remaining,expiresAt:card.expiresAt.toISOString(),closedAt:null};
  if(d.operation==='close'){
   if(await tx.beautyAppointment.count({where:{storeId:a.storeId,cardId:card.id,status:'RESERVED'}}))throw new AppError('BUSINESS_RULE','仍有預約占用，請先取消或改用其他方案再註銷');
   const closedAt=new Date();
   await tx.beautyCard.update({where:{id:card.id},data:{remaining:0,closedAt}});
   if(card.remaining)await tx.beautyLedger.create({data:{storeId:a.storeId,cardId:card.id,kind:'CLOSE',delta:-card.remaining,actorUserId:a.userId}});
   await audit(tx,a,'CLOSE_CARD',JSON.stringify({cardId:card.id,before,after:{remaining:0,expiresAt:before.expiresAt,closedAt:closedAt.toISOString()},reason:d.reason}));
   return {id:card.id,remaining:0,expiresAt:before.expiresAt,closed:true};
  }
  const date=d.expiresDate??'';
  if(!parseTaipeiDateTime(date,'00:00')||date<toLocalDateStr(card.createdAt)||date>addTaiwanDuration(toLocalDateStr(),3650,'DAY'))throw new AppError('VALIDATION','請選擇建立日之後、未來十年內的有效日期');
  const expiresAt=dayRange(date).end;
  if(await tx.beautyAppointment.count({where:{storeId:a.storeId,cardId:card.id,status:'RESERVED',endsAt:{gt:expiresAt}}}))throw new AppError('BUSINESS_RULE','新期限早於既有預約，請先調整相關預約');
  if(expiresAt.getTime()===card.expiresAt.getTime())return {id:card.id,remaining:card.remaining,expiresAt:before.expiresAt,closed:false};
  await tx.beautyCard.update({where:{id:card.id},data:{expiresAt}});
  await audit(tx,a,'CARD_EXPIRY',JSON.stringify({cardId:card.id,before,after:{...before,expiresAt:expiresAt.toISOString()},reason:d.reason}));
  return {id:card.id,remaining:card.remaining,expiresAt:expiresAt.toISOString(),closed:false};
 });
}
