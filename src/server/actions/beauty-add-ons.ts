'use server';
import {requireBeautyAddOnSelection} from '@/server/services/add-on-access';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {beautyManager,beautyTransaction,command,audit} from '@/server/beauty/access';
import {beautyPrisma} from '@/lib/beauty-db';
import {key} from '@/lib/beauty/contracts';
import {resolveAddOns,addOnSnapshots,addOnTotals,bookingAddOnGroups} from '@/lib/beauty/add-ons';
import {findAllocation,assertCustomerAvailable} from '@/server/beauty/booking';
import {serviceCharges} from '@/server/beauty/service-charges';
import {AppError,handleActionError} from '@/lib/errors';
import {toLocalDateStr} from '@/lib/date-utils';
export async function readBeautyAddOns(input:unknown){
 try{
  const a=await beautyManager('booking.update'),d=z.object({id:key,storeId:key}).parse(input);
  if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
  await requireBeautyAddOnSelection(a.storeId);
  const item=await beautyPrisma.beautyAppointment.findFirst({where:{id:d.id,storeId:a.storeId}});
  if(!item||item.status!=='RESERVED')throw new AppError('CONFLICT','僅待服務預約可修改附加項目');
  const service=await beautyPrisma.beautyService.findFirstOrThrow({where:{id:item.serviceId,storeId:a.storeId}});
  return {success:true as const,data:{id:item.id,revision:item.revision,serviceName:item.serviceName,groups:bookingAddOnGroups(service.addOnGroups,addOnSnapshots.parse(item.addOnItems)),items:addOnSnapshots.parse(item.addOnItems)}};
 }catch(e){return handleActionError(e);}
}
export async function updateBeautyAddOns(input:unknown){
 try{
  const a=await beautyManager('booking.update',true),d=z.object({id:key,storeId:key,revision:z.number().int().nonnegative(),requestKey:z.string().uuid(),ids:z.array(key).max(100)}).parse(input);
  if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
  await requireBeautyAddOnSelection(a.storeId);
  const saved=await beautyTransaction(a,tx=>command(tx,a,d.requestKey,d,async()=>{
   await requireBeautyAddOnSelection(a.storeId,tx);
   const item=await tx.beautyAppointment.findFirst({where:{storeId:a.storeId,id:d.id},include:{group:true}});
   if(!item||item.revision!==d.revision||item.status!=='RESERVED')throw new AppError('CONFLICT','預約已更新，請重新開啟');
   const service=await tx.beautyService.findFirstOrThrow({where:{storeId:a.storeId,id:item.serviceId}});
   const old=addOnSnapshots.parse(item.addOnItems);
   let next;try{next=resolveAddOns(bookingAddOnGroups(service.addOnGroups,old),d.ids).map(o=>old.find(previous=>previous.id===o.id)??o);}catch(e){throw new AppError('VALIDATION',e instanceof Error?e.message:'請核對附加項目');}
   const oldTotal=addOnTotals(old),total=addOnTotals(next),baseDuration=item.baseServiceDuration??item.duration-oldTotal.duration;
   const [quote]=await serviceCharges(tx,a.storeId,[item]);
   const nextPrice=(item.cardId?0:item.price)+total.price;
   if(quote.reduction>0&&nextPrice!==quote.price)throw new AppError('CONFLICT','請先在收款畫面將優惠調整為零，再修改附加項目並重新確認優惠');
   if(quote.collected>nextPrice)throw new AppError('CONFLICT','修改後金額低於已收款，請先依退款流程處理；原預約保持不變');
   const time=item.startsAt.toLocaleTimeString('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'});
   const allocation=await findAllocation(tx,a,{date:toLocalDateStr(item.startsAt),time,people:[{...item,name:item.personName,phone:item.personPhone,serviceRevision:service.revision,preference:item.preference as 'ANY'|'FEMALE'|'MALE',specifiedTechnicianId:item.technicianId,specifiedLocationId:item.locationId,notes:item.notes}]},[item.id],undefined,undefined,true,{serviceId:item.serviceId,duration:baseDuration+total.duration,buffer:item.buffer});
   const assigned=allocation.result[0];await assertCustomerAvailable(tx,a.storeId,item.customerId,item.startsAt,assigned.occupiedEndsAt,item.id);
   await tx.beautyAppointment.update({where:{id:item.id},data:{addOnItems:next,baseServiceDuration:baseDuration,duration:baseDuration+total.duration,endsAt:assigned.endsAt,occupiedEndsAt:assigned.occupiedEndsAt,revision:{increment:1}}});
   await audit(tx,a,'ADD_ON_ITEMS',JSON.stringify({before:old,after:next,commission:'PENDING_PHASE_2'}),item.id);
   return {id:item.id};
  }));
  revalidatePath('/dashboard/beauty');return {success:true as const,data:saved};
 }catch(e){return handleActionError(e);}
}
export async function readBeautyAddOnStatistics(input:unknown){
 try{
  const a=await beautyManager('report.read');
  const {requireStoreFeature}=await import('@/lib/feature-gate');const {FEATURES}=await import('@/lib/feature-flags');await requireStoreFeature(a.storeId,FEATURES.BASIC_REPORTS);
  const {dayRange}=await import('@/lib/date-utils');
  const d=z.object({storeId:key,from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(input);
  const start=dayRange(d.from).start,end=dayRange(d.to).end;
  if(d.storeId!==a.storeId||!Number.isFinite(+start)||!Number.isFinite(+end)||start>end||+end-+start>366*86400000)throw new AppError('VALIDATION','請選擇一年內的有效日期範圍');
  const rows=await beautyPrisma.beautyAppointment.findMany({where:{storeId:a.storeId,startsAt:{gte:start,lte:end}},select:{status:true,addOnItems:true}});
  const stats=new Map<string,{id:string;name:string;reserved:number;completed:number;cancelled:number;noShow:number;freeCompleted:number;completedListAmount:number}>();
  for(const row of rows)for(const item of addOnSnapshots.parse(row.addOnItems)){
   const stat=stats.get(item.id)??{id:item.id,name:item.name,reserved:0,completed:0,cancelled:0,noShow:0,freeCompleted:0,completedListAmount:0};
   if(row.status==='COMPLETED'){stat.completed++;stat.completedListAmount+=item.price;if(item.price===0)stat.freeCompleted++;}else if(row.status==='RESERVED')stat.reserved++;else if(row.status==='CANCELLED')stat.cancelled++;else if(row.status==='NO_SHOW')stat.noShow++;
   stats.set(item.id,stat);
  }
  return {success:true as const,data:[...stats.values()].sort((a,b)=>b.completed-a.completed||a.name.localeCompare(b.name,'zh-TW'))};
 }catch(e){return handleActionError(e);}
}
