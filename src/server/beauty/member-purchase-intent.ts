import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@/lib/errors';
import type { BeautyActor } from './access';
import type { Tx } from './booking';

// All mutations must run under beautyTransaction's Store row lock.
type State = 'PREPARED' | 'COMMITTED' | 'ACKNOWLEDGED' | 'CANCELLED';
type Row = { requestKey:string; customerId:string; actorUserId:string; status:State; fingerprint:string|null; purchaseId:string|null };
export type MemberPurchaseView = { requestKey:string; status:'PREPARED'|'COMMITTED'|'CANCELLED'; purchaseId:string|null };
const view = (row:Row):MemberPurchaseView => ({requestKey:row.requestKey,status:row.status==='ACKNOWLEDGED'?'COMMITTED':row.status,purchaseId:row.purchaseId});
export function beautyMemberPurchaseIntentsEnabled() { return process.env.BEAUTY_MEMBER_PURCHASE_INTENTS_ENABLED === '1'; }
export function beautyMemberPurchaseFingerprint(input:{requestKey:string;planId:string;lastFour:string;expectedName:string;expectedPrice:number;expectedSessions:number;expectedRevision:number}):string {
  const secret=process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if(!secret) throw new AppError('FORBIDDEN','購買核對功能尚未設定，請聯絡店家');
  return createHmac('sha256',secret).update('beauty-member-purchase:v2\0').update(JSON.stringify([input.requestKey,input.planId,input.lastFour,input.expectedName,input.expectedPrice,input.expectedSessions,input.expectedRevision])).digest('hex');
}
function identity(a:BeautyActor):{customerId:string;userId:string} {
  if(!a.customerId||!a.userId) throw new AppError('FORBIDDEN','請先連結本店會員');
  return {customerId:a.customerId,userId:a.userId};
}
function same(a:string|null,b:string):boolean { return !!a&&/^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex')); }
async function byKey(tx:Tx,storeId:string,key:string):Promise<Row|null> {
  const rows=await tx.$queryRaw<Row[]>`SELECT "requestKey","customerId","actorUserId",status,fingerprint,"purchaseId" FROM "BeautyMemberPurchaseIntent" WHERE "storeId"=${storeId} AND "requestKey"=${key}`;
  return rows[0]??null;
}
function own(row:Row,a:BeautyActor){const x=identity(a);if(row.customerId!==x.customerId||row.actorUserId!==x.userId)throw new AppError('CONFLICT','購買狀態無法核對，請聯絡店家');}
export async function prepareBeautyMemberIntent(tx:Tx,a:BeautyActor,input:{requestKey:string;fingerprint:string}):Promise<MemberPurchaseView>{
  const x=identity(a),old=await byKey(tx,a.storeId,input.requestKey);
  if(old){own(old,a);if(old.status==='CANCELLED')return view(old);if(!same(old.fingerprint,input.fingerprint))throw new AppError('CONFLICT','購買內容已變更，請先核對原申請');return view(old);}
  const pending=await tx.$queryRaw<Array<{requestKey:string}>>`SELECT "requestKey" FROM "BeautyMemberPurchaseIntent" WHERE "storeId"=${a.storeId} AND "customerId"=${x.customerId} AND status IN ('PREPARED','COMMITTED') LIMIT 1`;
  if(pending.length) throw new AppError('CONFLICT','已有未確認的購買申請，請先核對；若無法查看請聯絡店家');
  const rows=await tx.$queryRaw<Row[]>`INSERT INTO "BeautyMemberPurchaseIntent" ("storeId","customerId","actorUserId","requestKey",status,fingerprint) VALUES (${a.storeId},${x.customerId},${x.userId},${input.requestKey},'PREPARED',${input.fingerprint}) RETURNING "requestKey","customerId","actorUserId",status,fingerprint,"purchaseId"`;
  return view(rows[0]);
}
export async function readBeautyMemberIntent(tx:Tx,a:BeautyActor,input:{requestKey?:string}):Promise<MemberPurchaseView|null>{
  const x=identity(a);
  const rows=input.requestKey?await tx.$queryRaw<Row[]>`SELECT "requestKey","customerId","actorUserId",status,fingerprint,"purchaseId" FROM "BeautyMemberPurchaseIntent" WHERE "storeId"=${a.storeId} AND "customerId"=${x.customerId} AND "actorUserId"=${x.userId} AND "requestKey"=${input.requestKey}`:await tx.$queryRaw<Row[]>`SELECT "requestKey","customerId","actorUserId",status,fingerprint,"purchaseId" FROM "BeautyMemberPurchaseIntent" WHERE "storeId"=${a.storeId} AND "customerId"=${x.customerId} AND "actorUserId"=${x.userId} AND status IN ('PREPARED','COMMITTED')`;
  return rows[0]?view(rows[0]):null;
}
export async function cancelBeautyMemberIntent(tx:Tx,a:BeautyActor,input:{requestKey:string}):Promise<MemberPurchaseView>{
  const x=identity(a),old=await byKey(tx,a.storeId,input.requestKey);
  if(old){own(old,a);if(old.status!=='PREPARED')return view(old);const rows=await tx.$queryRaw<Row[]>`UPDATE "BeautyMemberPurchaseIntent" SET status='CANCELLED',"updatedAt"=now() WHERE "storeId"=${a.storeId} AND "requestKey"=${input.requestKey} AND status='PREPARED' RETURNING "requestKey","customerId","actorUserId",status,fingerprint,"purchaseId"`;if(rows.length!==1)throw new AppError('CONFLICT','購買狀態已變更，請重新核對');return view(rows[0]);}
  const rows=await tx.$queryRaw<Row[]>`INSERT INTO "BeautyMemberPurchaseIntent" ("storeId","customerId","actorUserId","requestKey",status) VALUES (${a.storeId},${x.customerId},${x.userId},${input.requestKey},'CANCELLED') RETURNING "requestKey","customerId","actorUserId",status,fingerprint,"purchaseId"`;
  return view(rows[0]);
}
export async function acknowledgeBeautyMemberIntent(tx:Tx,a:BeautyActor,input:{requestKey:string;purchaseId:string}):Promise<MemberPurchaseView>{
  const row=await byKey(tx,a.storeId,input.requestKey);if(!row)throw new AppError('CONFLICT','購買狀態無法核對，請聯絡店家');own(row,a);
  if(row.purchaseId!==input.purchaseId||!row.purchaseId||!['COMMITTED','ACKNOWLEDGED'].includes(row.status))throw new AppError('CONFLICT','購買狀態無法核對，請聯絡店家');
  if(row.status==='ACKNOWLEDGED')return view(row);
  const rows=await tx.$queryRaw<Row[]>`UPDATE "BeautyMemberPurchaseIntent" SET status='ACKNOWLEDGED',"updatedAt"=now() WHERE "storeId"=${a.storeId} AND "requestKey"=${input.requestKey} AND status='COMMITTED' RETURNING "requestKey","customerId","actorUserId",status,fingerprint,"purchaseId"`;
  if(rows.length!==1)throw new AppError('CONFLICT','購買狀態已變更，請重新核對');return view(rows[0]);
}
export async function commitBeautyMemberPurchaseIntent(tx:Tx,a:BeautyActor,input:{requestKey:string;fingerprint:string},work:()=>Promise<{id:string}>):Promise<{id:string}>{
  const row=await byKey(tx,a.storeId,input.requestKey);if(!row)throw new AppError('CONFLICT','購買狀態尚未確認，請重新開啟核對');own(row,a);
  if(row.status==='CANCELLED')throw new AppError('CONFLICT','此申請已取消，不能再送出');
  if(!same(row.fingerprint,input.fingerprint))throw new AppError('CONFLICT','購買內容已變更，請先核對原申請');
  if(row.status==='COMMITTED'||row.status==='ACKNOWLEDGED'){if(!row.purchaseId)throw new AppError('CONFLICT','購買狀態無法核對，請聯絡店家');return {id:row.purchaseId};}
  const result=await work();const count=await tx.$executeRaw`UPDATE "BeautyMemberPurchaseIntent" SET status='COMMITTED',"purchaseId"=${result.id},"updatedAt"=now() WHERE "storeId"=${a.storeId} AND "requestKey"=${input.requestKey} AND status='PREPARED'`;
  if(count!==1)throw new AppError('CONFLICT','購買狀態已變更，請重新核對');return result;
}
