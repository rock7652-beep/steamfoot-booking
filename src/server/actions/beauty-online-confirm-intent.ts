'use server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { beautyPrisma } from '@/lib/beauty-db';
import { AppError,handleActionError } from '@/lib/errors';
import { FEATURES } from '@/lib/feature-flags';
import { requireStoreFeature } from '@/lib/feature-gate';
import { getManagerCustomerWhere } from '@/lib/manager-visibility';
import { requireSession } from '@/lib/session';
import { planInput } from '@/lib/beauty/contracts';
import { beautyManager,beautyTransaction,type BeautyActor } from '@/server/beauty/access';
import type { Tx } from '@/server/beauty/booking';
import { beautyPlanPurchaseIntentsEnabled } from '@/server/beauty/plan-checkout-input';
import { acknowledgeBeautyPlanIntent,beautyPlanIntentFingerprint,cancelBeautyPlanIntent,commitBeautyPlanIntent,prepareBeautyPlanIntent,readBeautyPlanIntent,type BeautyPlanIntentView } from '@/server/beauty/purchase-intent';
import { confirmOnlineBeautyOrder } from '@/server/beauty/online-confirm';

const id=z.string().min(1).max(100), base=z.object({expectedStoreId:id,orderId:id});
const withKey=base.extend({requestKey:z.string().uuid()});
type Order={id:string;customerId:string;status:string;cardId:string|null;snapshot:unknown};
type Summary={orderId:string;customerName:string;planName:string;amount:number|null;canCommit:boolean;orderStatus:string};
type View=BeautyPlanIntentView & Summary;
async function result<T>(fn:()=>Promise<T>){try{return {success:true as const,data:await fn()};}catch(e){return handleActionError(e);}}
async function auth(expectedStoreId:string,write:boolean){
  if(process.env.BEAUTY_PLAN_PURCHASE_INTENTS_ENABLED!=='1')throw new AppError('FORBIDDEN','購買核對功能尚未開放');
  const [a,finance,viewer,u]=await Promise.all([beautyManager('wallet.create',write),beautyManager('transaction.create',write),beautyManager('customer.read'),requireSession()]);
  if(a.storeId!==expectedStoreId||finance.storeId!==a.storeId||viewer.storeId!==a.storeId||a.userId!==u.id||finance.userId!==a.userId||viewer.userId!==a.userId)throw new AppError('FORBIDDEN','目前門市或身分不一致，請重新開啟');
  if(!beautyPlanPurchaseIntentsEnabled(a.storeId))throw new AppError('FORBIDDEN','購買核對功能尚未開放');
  await Promise.all([requireStoreFeature(a.storeId,FEATURES.PLAN_MANAGEMENT),requireStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT)]);
  return {a,u};
}
async function customerVisible(ctx:Awaited<ReturnType<typeof auth>>,customerId:string){
  return prisma.customer.findFirst({where:{...getManagerCustomerWhere(ctx.u.role,ctx.u.staffId,ctx.a.storeId),storeId:ctx.a.storeId,id:customerId,mergedIntoCustomerId:null},select:{id:true,name:true}});
}
async function visibleOrder(ctx:Awaited<ReturnType<typeof auth>>,orderId:string){
  const order=await beautyPrisma.beautyPurchase.findFirst({where:{id:orderId,storeId:ctx.a.storeId},select:{id:true,customerId:true}});
  if(!order)throw new AppError('NOT_FOUND','找不到可核對的訂單');
  const customer=await customerVisible(ctx,order.customerId);
  if(!customer)throw new AppError('NOT_FOUND','找不到可核對的訂單');
  return {customerId:order.customerId,customerName:customer.name};
}
async function lockedOrder(tx:Tx,a:BeautyActor,orderId:string,customerId:string):Promise<Order>{
  const order=await tx.beautyPurchase.findFirst({where:{storeId:a.storeId,id:orderId,customerId},select:{id:true,customerId:true,status:true,cardId:true,snapshot:true}});
  if(!order)throw new AppError('NOT_FOUND','找不到可核對的訂單');
  return order;
}
function summary(order:Order,customerName:string):Summary{
  const parsed=planInput.safeParse(order.snapshot), valid=parsed.success&&!!parsed.data.id;
  return {orderId:order.id,customerName,planName:valid?parsed.data.name:'方案待核對',amount:valid?parsed.data.price:null,canCommit:!!valid&&(order.status==='PENDING'||(order.status==='CONFIRMED'&&!!order.cardId)),orderStatus:order.status};
}
function fingerprint(orderId:string,requestKey:string){return beautyPlanIntentFingerprint({kind:'beauty-online-confirm:v1',orderId,requestKey});}
async function mapping(tx:Tx,storeId:string,requestKey:string){
  const rows=await tx.$queryRaw<Array<{orderId:string}>>`SELECT "orderId" FROM "BeautyOnlineConfirmIntent" WHERE "storeId"=${storeId} AND "requestKey"=${requestKey}`;
  return rows[0]?.orderId??null;
}
async function mapped(tx:Tx,a:BeautyActor,orderId:string,customerId:string,requestKey:string){
  const linked=await mapping(tx,a.storeId,requestKey);
  if(linked!==orderId)throw new AppError('CONFLICT','此核帳請求與訂單不一致，請重新核對');
  const intent=await readBeautyPlanIntent(tx,a,{customerId,requestKey});
  if(!intent)throw new AppError('CONFLICT','核帳狀態待確認');
  return intent;
}
async function runOrder<T>(input:{expectedStoreId:string;orderId:string},write:boolean,fn:(tx:Tx,a:BeautyActor,order:Order,s:Summary)=>Promise<T>){
  const ctx=await auth(input.expectedStoreId,write), visible=await visibleOrder(ctx,input.orderId);
  return beautyTransaction(ctx.a,async tx=>{const order=await lockedOrder(tx,ctx.a,input.orderId,visible.customerId);return fn(tx,ctx.a,order,summary(order,visible.customerName));});
}
export async function prepareBeautyOnlineConfirm(input:unknown){return result(async()=>{
  const d=withKey.parse(input);
  return runOrder(d,true,async(tx,a,order,s)=>{
    const linked=await mapping(tx,a.storeId,d.requestKey);
    if(linked&&linked!==order.id)throw new AppError('CONFLICT','此核帳請求與訂單不一致');
    if(!linked&&(order.status!=='PENDING'||!s.canCommit))throw new AppError('CONFLICT','訂單狀態或方案快照待核對');
    const intent=await prepareBeautyPlanIntent(tx,a,{customerId:order.customerId,requestKey:d.requestKey,fingerprint:fingerprint(order.id,d.requestKey)});
    if(!linked){
      // A tombstone or another entry point must never be claimed as this order.
      if(intent.status!=='PREPARED')throw new AppError('CONFLICT','此核帳請求已使用，請重新核對');
      await tx.$executeRaw`INSERT INTO "BeautyOnlineConfirmIntent" ("storeId","requestKey","orderId") VALUES (${a.storeId},${d.requestKey},${order.id})`;
    }
    return {...intent,...s};
  });
});}
export async function readBeautyOnlineConfirm(input:unknown){return result(async()=>{
  const d=base.extend({requestKey:z.string().uuid().optional()}).parse(input);
  return runOrder(d,false,async(tx,a,order,s)=>{
    const rows=d.requestKey
      ? await tx.$queryRaw<Array<{requestKey:string}>>`SELECT "requestKey" FROM "BeautyOnlineConfirmIntent" WHERE "storeId"=${a.storeId} AND "orderId"=${order.id} AND "requestKey"=${d.requestKey}`
      : await tx.$queryRaw<Array<{requestKey:string}>>`SELECT m."requestKey" FROM "BeautyOnlineConfirmIntent" m JOIN "BeautyPurchaseIntent" i USING ("storeId","requestKey") WHERE m."storeId"=${a.storeId} AND m."orderId"=${order.id} AND i.status IN ('PREPARED','COMMITTED')`;
    if(!rows.length)return null;
    if(rows.length!==1)throw new AppError('CONFLICT','訂單有多筆核對狀態，請聯絡管理員');
    return {...await mapped(tx,a,order.id,order.customerId,rows[0].requestKey),...s};
  });
});}
export async function cancelBeautyOnlineConfirm(input:unknown){return result(async()=>{
  const d=withKey.parse(input);
  return runOrder(d,true,async(tx,a,order,s)=>{
    const linked=await mapping(tx,a.storeId,d.requestKey);
    if(linked&&linked!==order.id)throw new AppError('CONFLICT','此核帳請求與訂單不一致');
    if(!linked&&await readBeautyPlanIntent(tx,a,{customerId:order.customerId,requestKey:d.requestKey}))throw new AppError('CONFLICT','此核帳請求已使用，請重新核對');
    const intent=await cancelBeautyPlanIntent(tx,a,{customerId:order.customerId,requestKey:d.requestKey});
    if(!linked)await tx.$executeRaw`INSERT INTO "BeautyOnlineConfirmIntent" ("storeId","requestKey","orderId") VALUES (${a.storeId},${d.requestKey},${order.id})`;
    return {...intent,...s};
  });
});}
export async function commitBeautyOnlineConfirm(input:unknown){return result(async()=>{
  const d=withKey.parse(input);
  return runOrder(d,true,async(tx,a,order,s)=>{
    const existing=await mapped(tx,a,order.id,order.customerId,d.requestKey);
    if(!s.canCommit)throw new AppError('CONFLICT','訂單狀態或方案快照待核對');
    const receipt=await commitBeautyPlanIntent(tx,a,{customerId:order.customerId,requestKey:d.requestKey,fingerprint:fingerprint(order.id,d.requestKey)},()=>confirmOnlineBeautyOrder(tx,a,{id:order.id,requestKey:d.requestKey}));
    return {status:existing.status==='ACKNOWLEDGED'?'ACKNOWLEDGED' as const:'COMMITTED' as const,requestKey:d.requestKey,purchaseId:receipt.cardId,...s};
  });
});}
export async function acknowledgeBeautyOnlineConfirm(input:unknown){return result(async()=>{
  const d=withKey.parse(input);
  return runOrder(d,true,async(tx,a,order,s)=>{
    const existing=await mapped(tx,a,order.id,order.customerId,d.requestKey);
    if(!existing.purchaseId||order.status!=='CONFIRMED'||order.cardId!==existing.purchaseId)throw new AppError('CONFLICT','核帳訂單與方案不一致，請重新核對');
    const [card,payment]=await Promise.all([
      tx.beautyCard.findFirst({where:{storeId:a.storeId,id:existing.purchaseId,customerId:order.customerId},select:{id:true}}),
      tx.beautyPayment.findFirst({where:{storeId:a.storeId,cardId:existing.purchaseId,kind:'SALE'},select:{id:true}}),
    ]);
    if(!card||!payment)throw new AppError('CONFLICT','購買紀錄尚未完整，請聯絡管理員核對');
    return {...await acknowledgeBeautyPlanIntent(tx,a,{customerId:order.customerId,requestKey:d.requestKey,purchaseId:existing.purchaseId}),...s};
  });
});}
export async function listBeautyOnlineConfirm(input:unknown){return result(async()=>{
  const {expectedStoreId}=z.object({expectedStoreId:id}).parse(input),ctx=await auth(expectedStoreId,false);
  const {rows,orders}=await beautyTransaction(ctx.a,async tx=>{
    const rows=await tx.$queryRaw<Array<{orderId:string;requestKey:string;customerId:string;status:'PREPARED'|'COMMITTED';purchaseId:string|null}>>`SELECT m."orderId",m."requestKey",i."customerId",i.status,i."cardId" AS "purchaseId" FROM "BeautyOnlineConfirmIntent" m JOIN "BeautyPurchaseIntent" i USING ("storeId","requestKey") WHERE m."storeId"=${ctx.a.storeId} AND i.status IN ('PREPARED','COMMITTED') ORDER BY i."createdAt"`;
    const orders=await tx.beautyPurchase.findMany({where:{storeId:ctx.a.storeId,id:{in:rows.map(r=>r.orderId)}},select:{id:true,customerId:true,status:true,cardId:true,snapshot:true}});
    return {rows,orders};
  });
  const customers=await prisma.customer.findMany({where:{...getManagerCustomerWhere(ctx.u.role,ctx.u.staffId,ctx.a.storeId),storeId:ctx.a.storeId,mergedIntoCustomerId:null,id:{in:[...new Set(rows.map(r=>r.customerId))]}},select:{id:true,name:true}});
  const visible=new Map(customers.map(c=>[c.id,c.name]));
  const byId=new Map(orders.map(o=>[o.id,o]));
  return rows.flatMap(r=>{const o=byId.get(r.orderId),name=visible.get(r.customerId);if(!o||o.customerId!==r.customerId||!name)return [];return [{status:r.status,requestKey:r.requestKey,purchaseId:r.purchaseId,...summary(o,name)} satisfies View];});
});}
