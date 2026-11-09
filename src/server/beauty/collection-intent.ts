import 'server-only';
import {beautyPurchaseIntentStoreAllowed} from './plan-checkout-input';
import {createHmac,timingSafeEqual} from 'node:crypto';
import type {z} from 'zod';
import type {paymentInput} from '@/lib/beauty/contracts';
import {AppError} from '@/lib/errors';
import type {BeautyActor} from './access';
import type {Tx} from './booking';

/** These operations require the existing beautyTransaction store-row lock.
 * Callers must check transaction.create, booking.read, the store feature and
 * visibility of every appointment before returning any result. */
export type BeautyCollectionInput=z.infer<typeof paymentInput>;
export type BeautyCollectionIntentStatus='PREPARED'|'COMMITTED'|'ACKNOWLEDGED'|'CANCELLED';
export type BeautyCollectionIntentView={status:BeautyCollectionIntentStatus;requestKey:string;appointmentIds:string[]};
type Row={status:BeautyCollectionIntentStatus;requestKey:string;fingerprint:string|null};

export function beautyCollectionIntentsEnabled(storeId?:string){return process.env.BEAUTY_COLLECTION_INTENTS_ENABLED==='1'&&beautyPurchaseIntentStoreAllowed(storeId);}
export function collectionFingerprint(input:BeautyCollectionInput):string{
 const secret=process.env.AUTH_SECRET||process.env.NEXTAUTH_SECRET;
 if(!secret)throw new AppError('FORBIDDEN','收款核對服務尚未設定，請聯絡管理員');
 return createHmac('sha256',secret).update('beauty-collection-intent:v1\0').update(JSON.stringify(input)).digest('hex');
}
function sameDigest(a:string|null,b:string){return !!a&&/^[0-9a-f]{64}$/.test(a)&&/^[0-9a-f]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
function sameIds(a:string[],b:string[]){return a.length===b.length&&[...a].sort().every((id,index)=>id===[...b].sort()[index]);}
async function byKey(tx:Tx,storeId:string,requestKey:string):Promise<{row:Row;ids:string[]}|null>{
 const rows=await tx.$queryRaw<Row[]>`SELECT "requestKey",status,fingerprint FROM "BeautyCollectionIntent" WHERE "storeId"=${storeId} AND "requestKey"=${requestKey}`;
 if(!rows.length)return null;
 const items=await tx.$queryRaw<Array<{appointmentId:string}>>`SELECT "appointmentId" FROM "BeautyCollectionIntentItem" WHERE "storeId"=${storeId} AND "requestKey"=${requestKey} ORDER BY "appointmentId"`;
 return {row:rows[0],ids:items.map(x=>x.appointmentId)};
}
function view(value:{row:Row;ids:string[]}):BeautyCollectionIntentView{return {status:value.row.status,requestKey:value.row.requestKey,appointmentIds:value.ids};}
async function verifyAppointments(tx:Tx,storeId:string,ids:string[]){
 if(ids.length<1||ids.length>12||new Set(ids).size!==ids.length)throw new AppError('VALIDATION','請核對收款服務');
 const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "BeautyAppointment" WHERE "storeId"=${storeId} AND id=ANY(${ids}::text[])`;
 if(rows.length!==ids.length)throw new AppError('FORBIDDEN','無法核對此服務收款');
}
async function insertItems(tx:Tx,storeId:string,requestKey:string,ids:string[],active:boolean){
 for(const id of [...ids].sort())await tx.$executeRaw`INSERT INTO "BeautyCollectionIntentItem" ("storeId","requestKey","appointmentId",active) VALUES (${storeId},${requestKey},${id},${active})`;
}

export async function prepareBeautyCollectionIntent(tx:Tx,a:BeautyActor,input:BeautyCollectionInput):Promise<BeautyCollectionIntentView>{
 await verifyAppointments(tx,a.storeId,input.ids);
 const digest=collectionFingerprint(input),existing=await byKey(tx,a.storeId,input.requestKey);
 if(existing){
  if(!sameIds(existing.ids,input.ids))throw new AppError('CONFLICT','收款服務與原請求不一致');
  if(existing.row.status==='CANCELLED')throw new AppError('CONFLICT','此收款請求已安全取消');
  if(!sameDigest(existing.row.fingerprint,digest))throw new AppError('CONFLICT','收款資料已變更，請先核對原請求');
  return view(existing);
 }
 const old=await tx.beautyCommand.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey:input.requestKey}},select:{requestKey:true}});
 if(old)throw new AppError('CONFLICT','此收款識別已有交易，請先核對原交易');
 const pending=await tx.$queryRaw<Array<{appointmentId:string}>>`SELECT "appointmentId" FROM "BeautyCollectionIntentItem" WHERE "storeId"=${a.storeId} AND "appointmentId"=ANY(${input.ids}::text[]) AND active LIMIT 1`;
 if(pending.length)throw new AppError('CONFLICT','部分服務已有待確認收款，請先核對或安全取消');
 await tx.$executeRaw`INSERT INTO "BeautyCollectionIntent" ("storeId","requestKey",status,fingerprint,"actorUserId") VALUES (${a.storeId},${input.requestKey},'PREPARED',${digest},${a.userId})`;
 await insertItems(tx,a.storeId,input.requestKey,input.ids,true);
 return {status:'PREPARED',requestKey:input.requestKey,appointmentIds:[...input.ids].sort()};
}

/** A missing request is cancelled with its complete appointment set, so a
 * delayed prepare carrying that key is rejected instead of starting again. */
export async function cancelBeautyCollectionIntent(tx:Tx,a:BeautyActor,requestKey:string,ids:string[]):Promise<BeautyCollectionIntentView>{
 await verifyAppointments(tx,a.storeId,ids);
 const existing=await byKey(tx,a.storeId,requestKey);
 if(existing){
  if(!sameIds(existing.ids,ids))throw new AppError('CONFLICT','請核對原收款包含的全部服務');
  if(existing.row.status!=='PREPARED')return view(existing);
  await tx.$executeRaw`UPDATE "BeautyCollectionIntent" SET status='CANCELLED',"updatedAt"=NOW() WHERE "storeId"=${a.storeId} AND "requestKey"=${requestKey} AND status='PREPARED'`;
  await tx.$executeRaw`UPDATE "BeautyCollectionIntentItem" SET active=false WHERE "storeId"=${a.storeId} AND "requestKey"=${requestKey}`;
 }else{
  const old=await tx.beautyCommand.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey}},select:{requestKey:true}});
  if(old)throw new AppError('CONFLICT','此收款識別已有交易，請先核對原交易');
  await tx.$executeRaw`INSERT INTO "BeautyCollectionIntent" ("storeId","requestKey",status,fingerprint,"actorUserId") VALUES (${a.storeId},${requestKey},'CANCELLED',NULL,${a.userId})`;
  await insertItems(tx,a.storeId,requestKey,ids,false);
 }
 return {status:'CANCELLED',requestKey,appointmentIds:[...ids].sort()};
}

export async function readBeautyCollectionIntent(tx:Tx,a:BeautyActor,requestKey:string):Promise<BeautyCollectionIntentView|null>{const row=await byKey(tx,a.storeId,requestKey);return row?view(row):null;}
export async function readPendingBeautyCollectionIntent(tx:Tx,a:BeautyActor,ids:string[]):Promise<BeautyCollectionIntentView|null>{
 await verifyAppointments(tx,a.storeId,ids);
 const found=await tx.$queryRaw<Array<{requestKey:string}>>`SELECT DISTINCT "requestKey" FROM "BeautyCollectionIntentItem" WHERE "storeId"=${a.storeId} AND "appointmentId"=ANY(${ids}::text[]) AND active LIMIT 2`;
 if(found.length>1)throw new AppError('CONFLICT','多筆服務各有待核對收款，請分別開啟核對');
 if(!found.length)return null;
 const row=await byKey(tx,a.storeId,found[0].requestKey);
 if(!row||!['PREPARED','COMMITTED'].includes(row.row.status))throw new AppError('CONFLICT','收款狀態異常，請聯絡管理員');
 return view(row);
}

export async function acknowledgeBeautyCollectionIntent(tx:Tx,a:BeautyActor,requestKey:string,ids:string[]):Promise<BeautyCollectionIntentView>{
 await verifyAppointments(tx,a.storeId,ids);
 const existing=await byKey(tx,a.storeId,requestKey);
 if(!existing||!sameIds(existing.ids,ids))throw new AppError('CONFLICT','請核對原收款包含的全部服務');
 if(existing.row.status==='ACKNOWLEDGED')return view(existing);
 if(existing.row.status!=='COMMITTED')throw new AppError('CONFLICT','收款結果尚未確認');
 const command=await tx.beautyCommand.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey}},select:{result:true}});
 const result=command?.result as {ids?:unknown}|null;
 if(!Array.isArray(result?.ids)||!result.ids.every(x=>typeof x==='string')||!sameIds(result.ids as string[],ids))throw new AppError('CONFLICT','收款紀錄不一致，請聯絡管理員');
 await tx.$executeRaw`UPDATE "BeautyCollectionIntent" SET status='ACKNOWLEDGED',"updatedAt"=NOW() WHERE "storeId"=${a.storeId} AND "requestKey"=${requestKey} AND status='COMMITTED'`;
 await tx.$executeRaw`UPDATE "BeautyCollectionIntentItem" SET active=false WHERE "storeId"=${a.storeId} AND "requestKey"=${requestKey}`;
 return {status:'ACKNOWLEDGED',requestKey,appointmentIds:[...ids].sort()};
}

/** Runs inside the same store lock and transaction as `collect`. Replays call
 * the original command again so actor and exact payload checks remain intact. */
export async function commitBeautyCollectionIntent<T>(tx:Tx,a:BeautyActor,input:BeautyCollectionInput,collect:()=>Promise<T>):Promise<T>{
 const existing=await byKey(tx,a.storeId,input.requestKey);
 if(!existing||!sameIds(existing.ids,input.ids))throw new AppError('CONFLICT','收款狀態尚未確認，請重新核對');
 if(existing.row.status==='CANCELLED')throw new AppError('CONFLICT','此收款請求已安全取消');
 if(!sameDigest(existing.row.fingerprint,collectionFingerprint(input)))throw new AppError('CONFLICT','收款資料已變更，請先核對原請求');
 const result=await collect();
 if(existing.row.status==='PREPARED'){
  const changed=await tx.$executeRaw`UPDATE "BeautyCollectionIntent" SET status='COMMITTED',"updatedAt"=NOW() WHERE "storeId"=${a.storeId} AND "requestKey"=${input.requestKey} AND status='PREPARED'`;
  if(changed!==1)throw new AppError('CONFLICT','收款狀態已變更，請重新核對');
 }
 return result;
}
