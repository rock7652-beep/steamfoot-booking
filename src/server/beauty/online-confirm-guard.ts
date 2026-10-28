import 'server-only';
import { AppError } from '@/lib/errors';
import { beautyPlanPurchaseIntentsEnabled } from './plan-checkout-input';
import type { Tx } from './booking';

/** Must be called under beautyTransaction's store lock before correcting or
 * refunding a receipt. Keeps a pending confirmation recoverable until a manager
 * explicitly acknowledges or cancels it. */
export async function assertOnlineConfirmationSettled(tx:Tx,storeId:string,input:{orderId?:string;cardId?:string|null}){
  if(!beautyPlanPurchaseIntentsEnabled())return;
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
