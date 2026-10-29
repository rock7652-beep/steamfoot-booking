import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { BeautyActor } from './access';
import type { Tx } from './booking';

/** These functions must run inside beautyTransaction, which locks the store row.
 * They deliberately do not provide authorization: callers must separately verify
 * transaction/wallet permissions and the customer belongs to the actor's scope. */
export type BeautyPlanIntentState = 'PREPARED' | 'COMMITTED' | 'ACKNOWLEDGED' | 'CANCELLED';
type Intent = { requestKey: string; customerId: string; status: BeautyPlanIntentState; fingerprint: string | null; cardId: string | null };
export type BeautyPlanIntentView = { status: BeautyPlanIntentState; requestKey: string; purchaseId: string | null };
function view(row: Intent): BeautyPlanIntentView { return {status:row.status,requestKey:row.requestKey,purchaseId:row.cardId}; }

/** Only the HMAC is persisted; transfer digits and other checkout fields remain
 * in the actual authorized request. Schema validation must run before hashing. */
export function beautyPlanIntentFingerprint(input: unknown): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new AppError('FORBIDDEN','購買安全機制尚未設定，請聯絡管理員');
  return createHmac('sha256',secret).update('beauty-plan-intent:v1\0').update(JSON.stringify(input)).digest('hex');
}
function sameFingerprint(left:string|null,right:string): boolean {
  if (!left || !/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));
}
async function byKey(tx:Tx,storeId:string,requestKey:string): Promise<Intent|null> {
  const rows=await tx.$queryRaw<Intent[]>`SELECT "requestKey","customerId",status,fingerprint,"cardId" FROM "BeautyPurchaseIntent" WHERE "storeId"=${storeId} AND "requestKey"=${requestKey}`;
  return rows[0]??null;
}

export async function prepareBeautyPlanIntent(tx:Tx,a:BeautyActor,input:{requestKey:string;customerId:string;fingerprint:string}):Promise<BeautyPlanIntentView> {
  const old=await byKey(tx,a.storeId,input.requestKey);
  if(old){
    if(old.customerId!==input.customerId) throw new AppError('CONFLICT','購買請求與顧客不一致');
    if(old.status==='CANCELLED') return view(old);
    if(!sameFingerprint(old.fingerprint,input.fingerprint)) throw new AppError('CONFLICT','購買資料已變更，請先核對原請求');
    return view(old);
  }
  const pending=await tx.$queryRaw<Array<{requestKey:string}>>`SELECT "requestKey" FROM "BeautyPurchaseIntent" WHERE "storeId"=${a.storeId} AND "customerId"=${input.customerId} AND status IN ('PREPARED','COMMITTED') LIMIT 1`;
  if(pending.length) throw new AppError('CONFLICT','該顧客有未確認的購買，請先核對');
  const rows=await tx.$queryRaw<Intent[]>`INSERT INTO "BeautyPurchaseIntent" ("storeId","customerId","requestKey",status,fingerprint,"actorUserId","createdAt","updatedAt") VALUES (${a.storeId},${input.customerId},${input.requestKey},'PREPARED',${input.fingerprint},${a.userId},now(),now()) RETURNING "requestKey","customerId",status,fingerprint,"cardId"`;
  return view(rows[0]);
}

/** Caller holds the store lock. A competing key receives a durable cancellation
 * barrier before it is told about the unresolved original purchase. */
export async function prepareBeautyPlanIntentAtomic(tx:Tx,a:BeautyActor,input:{requestKey:string;customerId:string;fingerprint:string}):Promise<{kind:'prepared'|'existing';intent:BeautyPlanIntentView}> {
  const prior=await byKey(tx,a.storeId,input.requestKey);
  if(prior)return {kind:'prepared',intent:await prepareBeautyPlanIntent(tx,a,input)};
  const existing=await readBeautyPlanIntent(tx,a,{customerId:input.customerId});
  if(existing){
    const barrier=await cancelBeautyPlanIntent(tx,a,{customerId:input.customerId,requestKey:input.requestKey});
    if(barrier.status!=='CANCELLED')throw new AppError('CONFLICT','購買識別碼狀態已變更，請先核對');
    return {kind:'existing',intent:existing};
  }
  return {kind:'prepared',intent:await prepareBeautyPlanIntent(tx,a,input)};
}

/** An absent request must also be cancelled durably: a delayed prepare using the
 * same key must never recreate it after the operator has cancelled. */
export async function cancelBeautyPlanIntent(tx:Tx,a:BeautyActor,input:{requestKey:string;customerId:string}):Promise<BeautyPlanIntentView> {
  const old=await byKey(tx,a.storeId,input.requestKey);
  if(old){
    if(old.customerId!==input.customerId) throw new AppError('CONFLICT','購買請求與顧客不一致');
    if(old.status!=='PREPARED') return view(old);
    const rows=await tx.$queryRaw<Intent[]>`UPDATE "BeautyPurchaseIntent" SET status='CANCELLED',"updatedAt"=now() WHERE "storeId"=${a.storeId} AND "requestKey"=${input.requestKey} AND status='PREPARED' RETURNING "requestKey","customerId",status,fingerprint,"cardId"`;
    if(rows.length!==1) throw new AppError('CONFLICT','購買狀態已變更，請重新核對');
    return view(rows[0]);
  }
  const rows=await tx.$queryRaw<Intent[]>`INSERT INTO "BeautyPurchaseIntent" ("storeId","customerId","requestKey",status,"actorUserId","createdAt","updatedAt") VALUES (${a.storeId},${input.customerId},${input.requestKey},'CANCELLED',${a.userId},now(),now()) RETURNING "requestKey","customerId",status,fingerprint,"cardId"`;
  return view(rows[0]);
}

export async function readBeautyPlanIntent(tx:Tx,a:BeautyActor,input:{requestKey?:string;customerId:string}):Promise<BeautyPlanIntentView|null> {
  const rows=input.requestKey
    ? await tx.$queryRaw<Intent[]>`SELECT "requestKey","customerId",status,fingerprint,"cardId" FROM "BeautyPurchaseIntent" WHERE "storeId"=${a.storeId} AND "customerId"=${input.customerId} AND "requestKey"=${input.requestKey}`
    : await tx.$queryRaw<Intent[]>`SELECT "requestKey","customerId",status,fingerprint,"cardId" FROM "BeautyPurchaseIntent" WHERE "storeId"=${a.storeId} AND "customerId"=${input.customerId} AND status IN ('PREPARED','COMMITTED')`;
  return rows[0]?view(rows[0]):null;
}

/** Only an authorized explicit acknowledgement releases a completed intent.
 * Callers must first confirm the stored sale/card is the one being reviewed. */
export async function acknowledgeBeautyPlanIntent(tx:Tx,a:BeautyActor,input:{requestKey:string;customerId:string;purchaseId:string}):Promise<BeautyPlanIntentView> {
  const row=await byKey(tx,a.storeId,input.requestKey);
  if(!row || row.customerId!==input.customerId || !row.cardId || row.cardId!==input.purchaseId) throw new AppError('CONFLICT','購買紀錄不一致，請重新核對');
  if(row.status==='ACKNOWLEDGED') return view(row);
  if(row.status!=='COMMITTED') throw new AppError('CONFLICT','購買結果尚未確認');
  const rows=await tx.$queryRaw<Intent[]>`UPDATE "BeautyPurchaseIntent" SET status='ACKNOWLEDGED',"updatedAt"=now() WHERE "storeId"=${a.storeId} AND "requestKey"=${input.requestKey} AND status='COMMITTED' RETURNING "requestKey","customerId",status,fingerprint,"cardId"`;
  if(rows.length!==1) throw new AppError('CONFLICT','購買狀態已變更，請重新核對');
  return view(rows[0]);
}

/** Atomic with issueCard and the revenue transaction. Replays return the
 * original card rather than calling issueCard a second time. */
export async function commitBeautyPlanIntent(tx:Tx,a:BeautyActor,input:{requestKey:string;customerId:string;fingerprint:string},work:()=>Promise<{cardId:string}>):Promise<{cardId:string}> {
  const row=await byKey(tx,a.storeId,input.requestKey);
  if(!row || row.customerId!==input.customerId) throw new AppError('CONFLICT','購買狀態尚未確認，請重新開啟核對');
  if(row.status==='CANCELLED') throw new AppError('CONFLICT','此購買已安全取消，不能再送出');
  if(!sameFingerprint(row.fingerprint,input.fingerprint)) throw new AppError('CONFLICT','購買資料已變更，請先核對原請求');
  if(row.status==='COMMITTED'||row.status==='ACKNOWLEDGED'){
    if(!row.cardId) throw new AppError('CONFLICT','購買結果待核對，請聯絡管理員');
    return {cardId:row.cardId};
  }
  const result=await work();
  const count=await tx.$executeRaw`UPDATE "BeautyPurchaseIntent" SET status='COMMITTED',"cardId"=${result.cardId},"updatedAt"=now() WHERE "storeId"=${a.storeId} AND "requestKey"=${input.requestKey} AND status='PREPARED'`;
  if(count!==1) throw new AppError('CONFLICT','購買狀態已變更，請重新核對');
  return result;
}
