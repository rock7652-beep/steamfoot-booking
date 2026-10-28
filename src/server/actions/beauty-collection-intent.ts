"use server";
import {z} from 'zod';
import {paymentInput} from '@/lib/beauty/contracts';
import {AppError,handleActionError} from '@/lib/errors';
import {requirePermission} from '@/lib/permissions';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {beautyManager,beautyTransaction} from '@/server/beauty/access';
import {acknowledgeBeautyCollectionIntent,beautyCollectionIntentsEnabled,cancelBeautyCollectionIntent,prepareBeautyCollectionIntent,readBeautyCollectionIntent,readPendingBeautyCollectionIntent} from '@/server/beauty/collection-intent';

const ids=z.array(z.string().min(1).max(100)).min(1).max(12).refine(v=>new Set(v).size===v.length);
const scope=z.object({expectedStoreId:z.string().min(1).max(100),ids,requestKey:z.string().uuid().optional()});
const keyed=scope.extend({requestKey:z.string().uuid()});
function assertEnabled(){if(!beautyCollectionIntentsEnabled())throw new AppError('FORBIDDEN','收款核對功能尚未啟用');}
async function actor(expectedStoreId:string,write:boolean){
 const a=await beautyManager('transaction.create',write);
 await Promise.all([requirePermission('booking.read'),requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT)]);
 if(a.storeId!==expectedStoreId||!a.userId)throw new AppError('FORBIDDEN','門市已切換，請重新開啟收款');
 return a;
}

/** Same schema and canonical input as the real collection write; raw form and
 * payment data are never returned or stored by the intent endpoints. */
export async function prepareBeautyCollectionPurchaseIntent(input:unknown){
 try{assertEnabled();const s=scope.parse(input),d=paymentInput.parse(input),a=await actor(s.expectedStoreId,true);
  if(d.quotes?.some(q=>q.discount))await requirePermission('transaction.discount');
  const data=await beautyTransaction(a,async tx=>{
   const rows=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,id:{in:d.ids}},select:{id:true,status:true,cardId:true}});
   if(rows.length!==d.ids.length||rows.some(row=>row.cardId||row.status==='CANCELLED'))throw new AppError('CONFLICT','服務已更新或不適用收款，請重新開啟');
   return prepareBeautyCollectionIntent(tx,a,d);
  });return {success:true as const,data};
 }catch(error){return handleActionError(error);}
}
export async function readBeautyCollectionPurchaseIntent(input:unknown){
 try{assertEnabled();const d=scope.parse(input),a=await actor(d.expectedStoreId,false);
  const data=await beautyTransaction(a,async tx=>{
   const selected=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,id:{in:d.ids}},select:{id:true}});
   if(selected.length!==d.ids.length)throw new AppError('FORBIDDEN','無法核對此服務收款');
   const found=d.requestKey?await readBeautyCollectionIntent(tx,a,d.requestKey):await readPendingBeautyCollectionIntent(tx,a,d.ids);
   if(!found)return null;
   // A selected appointment may belong to a larger pending batch; return the
   // complete set for explicit review. Unrelated keys reveal nothing.
   if(d.requestKey&&!found.appointmentIds.some(id=>d.ids.includes(id)))return null;
   const all=await tx.beautyAppointment.findMany({where:{storeId:a.storeId,id:{in:found.appointmentIds}},select:{id:true,personName:true,serviceName:true,startsAt:true}});
   if(all.length!==found.appointmentIds.length)throw new AppError('FORBIDDEN','無法核對此服務收款');
   return {...found,appointments:all.map(row=>({id:row.id,personName:row.personName,serviceName:row.serviceName,startsAt:row.startsAt.toISOString()}))};
  });return {success:true as const,data};
 }catch(error){return handleActionError(error);}
}
export async function cancelBeautyCollectionPurchaseIntent(input:unknown){
 try{assertEnabled();const d=keyed.parse(input),a=await actor(d.expectedStoreId,true);const data=await beautyTransaction(a,tx=>cancelBeautyCollectionIntent(tx,a,d.requestKey,d.ids));return {success:true as const,data};}
 catch(error){return handleActionError(error);}
}
export async function acknowledgeBeautyCollectionPurchaseIntent(input:unknown){
 try{assertEnabled();const d=keyed.parse(input),a=await actor(d.expectedStoreId,true);const data=await beautyTransaction(a,tx=>acknowledgeBeautyCollectionIntent(tx,a,d.requestKey,d.ids));return {success:true as const,data};}
 catch(error){return handleActionError(error);}
}
