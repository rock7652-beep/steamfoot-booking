import 'server-only';
import { AppError } from '@/lib/errors';
import { planInput } from '@/lib/beauty/contracts';
import { command, type BeautyActor } from './access';
import type { Tx } from './booking';
import { issueCard } from './commerce';

/** Called under the store lock. The original order snapshot, issue, payment,
 * correction history and order transition stay in one database transaction. */
export async function confirmOnlineBeautyOrder(tx:Tx,a:BeautyActor,d:{requestKey:string;id:string}) {
  return command(tx,a,d.requestKey,d,async()=>{
    const order=await tx.beautyPurchase.findFirst({where:{storeId:a.storeId,id:d.id}});
    if(!order)throw new AppError('NOT_FOUND','找不到訂單');
    if(order.status==='CONFIRMED'){
      if(!order.cardId)throw new AppError('CONFLICT','訂單發卡紀錄不完整，請聯絡管理員核對');
      return {cardId:order.cardId};
    }
    if(order.status!=='PENDING')throw new AppError('CONFLICT','訂單狀態已變更');
    const snapshot=planInput.parse(order.snapshot);
    if(!snapshot.id)throw new AppError('VALIDATION','購入快照待核對');
    const receipt=await issueCard(tx,a,{
      requestKey:d.requestKey+':issue',planId:order.planId,customerId:order.customerId,
      memberIds:[order.customerId],paid:snapshot.price,method:'BANK_TRANSFER',
    },{
      ...snapshot,id:snapshot.id,storeId:a.storeId,
      storeCost:order.snapshot&&typeof order.snapshot==='object'&&!Array.isArray(order.snapshot)&&'storeCost' in order.snapshot&&typeof order.snapshot.storeCost==='number'?order.snapshot.storeCost:null,
      chargeRuleSnapshot:order.snapshot&&typeof order.snapshot==='object'&&!Array.isArray(order.snapshot)&&'chargeRuleSnapshot' in order.snapshot?order.snapshot.chargeRuleSnapshot:null,
    });
    await tx.beautyPurchase.update({where:{id:order.id},data:{cardId:receipt.cardId,status:'CONFIRMED'}});
    const corrected=await tx.beautyTransactionRevision.findFirst({where:{storeId:a.storeId,transactionId:order.id},orderBy:{revision:'desc'}});
    if(corrected){
      const payment=await tx.beautyPayment.findFirstOrThrow({where:{storeId:a.storeId,cardId:receipt.cardId,kind:'SALE'}});
      await tx.beautyTransactionRevision.create({data:{storeId:a.storeId,transactionId:payment.id,revision:1,note:corrected.note,revenueStaffId:corrected.revenueStaffId,actorUserId:a.userId!}});
    }
    return receipt;
  });
}
