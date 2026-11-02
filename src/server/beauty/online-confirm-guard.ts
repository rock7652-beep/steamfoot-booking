import 'server-only';
import { AppError } from '@/lib/errors';
import { beautyPlanPurchaseIntentsEnabled } from './plan-checkout-input';
import {acknowledgeBeautyPlanIntent} from './purchase-intent';
import type {BeautyActor} from './access';
import type { Tx } from './booking';

/** Must be called under beautyTransaction's store lock before correcting or
 * refunding a receipt. Keeps a pending confirmation recoverable until a manager
 * explicitly acknowledges or cancels it. */
export async function assertOnlineConfirmationSettled(tx:Tx,storeId:string,input:{orderId?:string;cardId?:string|null}){
  if(!beautyPlanPurchaseIntentsEnabled(storeId))return;
  const orderId=input.orderId??null,cardId=input.cardId??null;
  if(!orderId&&!cardId)return;
  const rows=await tx.$queryRaw<Array<{requestKey:string}>>`
    SELECT i."requestKey" FROM "BeautyPurchaseIntent" i
    LEFT JOIN "BeautyOnlineConfirmIntent" m USING ("storeId","requestKey")
    WHERE i."storeId"=${storeId} AND i.status IN ('PREPARED','COMMITTED')
      AND ((${orderId}::text IS NOT NULL AND m."orderId"=${orderId}) OR
           (${cardId}::text IS NOT NULL AND i.status='COMMITTED' AND i."cardId"=${cardId}))
    LIMIT 1`;
  if(rows.length)throw new AppError('CONFLICT','此方案購買有尚未完成的核帳確認，請先核對購買結果');
}

/** Caller already verified the exact unused card and its unique sale under the
 * store lock. Review of that sale is sufficient to finish its completed marker;
 * unresolved purchases remain blocked and no financial mutation is issued here. */
export async function settleCompletedPlanForVoid(tx:Tx,a:BeautyActor,input:{cardId:string;customerId:string}){
 if(!beautyPlanPurchaseIntentsEnabled(a.storeId))return;
 const rows=await tx.$queryRaw<Array<{requestKey:string;customerId:string;status:string}>>`SELECT "requestKey","customerId",status FROM "BeautyPurchaseIntent" WHERE "storeId"=${a.storeId} AND "cardId"=${input.cardId} AND status IN ('PREPARED','COMMITTED')`;
 for(const row of rows){
  if(row.status!=='COMMITTED'||row.customerId!==input.customerId)throw new AppError('CONFLICT','原購買資料仍待核對，尚未作廢，請聯絡管理員協助');
 }
 for(const row of rows)await acknowledgeBeautyPlanIntent(tx,a,{requestKey:row.requestKey,customerId:input.customerId,purchaseId:input.cardId});
 await assertOnlineConfirmationSettled(tx,a.storeId,{cardId:input.cardId});
}
