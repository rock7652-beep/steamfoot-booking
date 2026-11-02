import 'server-only';
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {resolveEffectiveEntitlement} from '@/lib/effective-entitlement';
import {courseSubjectAddOnGroups,moduleAddOnGroups,resolveSharedGoods,addOnTotals,sharedGoodsSnapshots,type AddOnGroup} from '@/lib/add-ons';
import type {CustomerBookingGoodsInput} from '@/lib/customer-booking-goods';
import {AppError} from '@/lib/errors';
import {lockSharedGoodsSubject} from './shared-goods-subject';
import {initializeBookingParticipants} from './booking-participants';
export type BookingGoodsTx=Pick<Prisma.TransactionClient,'$queryRaw'|'$executeRaw'>;
export async function customerGoodsCatalog(tx:BookingGoodsTx,storeId:string,sessionId?:string):Promise<{module:'STEAMFOOT'|'FITNESS'|'MUSIC';revision:number;groups:AddOnGroup[]}|null>{
 const [store]=await tx.$queryRaw<{industryModule:string}[]>`SELECT "industryModule"::text AS "industryModule" FROM "Store" WHERE id=${storeId} AND "operatingStatus"::text IN ('ACTIVE','TRIAL')`;
 if(!store||!['STEAMFOOT','COURSE'].includes(store.industryModule))return null;
 const grants=await tx.$queryRaw<{featureKey:string;status:string;startsAt:Date|null;expiresAt:Date|null}[]>`SELECT "featureKey",status,"startsAt","expiresAt" FROM "StoreFeatureEntitlement" WHERE "storeId"=${storeId} AND "featureKey" IN ('add_ons','business.music','business.fitness')`;
 const enabled=(key:string)=>resolveEffectiveEntitlement(false,grants.find(g=>g.featureKey===key) as Parameters<typeof resolveEffectiveEntitlement>[1]).enabled;
 if(!enabled('add_ons'))return null;
 const moduleName:'STEAMFOOT'|'MUSIC'|'FITNESS'|null=store.industryModule==='STEAMFOOT'?'STEAMFOOT':enabled('business.music')?'MUSIC':enabled('business.fitness')?'FITNESS':null;
 if(!moduleName||moduleName==='STEAMFOOT'&&(process.env.STEAMFOOT_ADD_ONS_ENABLED!=='1'||process.env.BOOKING_PARTICIPANTS_ENABLED!=='true')||moduleName!=='STEAMFOOT'&&process.env.COURSE_ADD_ONS_ENABLED!=='1')return null;
 let subjectId:string|null=null;
 if(moduleName!=='STEAMFOOT'){
  if(!sessionId)return null;
  const [subject]=await tx.$queryRaw<{id:string}[]>`SELECT a.id FROM "CourseSession" s JOIN "CourseTemplate" t ON t.id=s."templateId" AND t."storeId"=s."storeId" JOIN "MusicSubject" a ON a.id=t."musicSubjectId" AND a."storeId"=s."storeId" WHERE s.id=${sessionId} AND s."storeId"=${storeId} AND s."cancelledAt" IS NULL AND s."releasedAt" IS NULL AND s."teacherAttendance" NOT IN ('LEAVE','NO_SHOW') AND t."isActive"=true AND t.visibility='PUBLIC' AND a."isActive"=true`;
  if(!subject)return null;subjectId=subject.id;
 }
 const [catalog]=await tx.$queryRaw<{revision:number;enabled:boolean;groups:Prisma.JsonValue}[]>`SELECT revision,groups FROM "ServiceAddOnCatalog" WHERE "storeId"=${storeId} AND module=${moduleName}`;
 if(!catalog)return null;
 const applicable=moduleName==='STEAMFOOT'?moduleAddOnGroups(moduleName,catalog.groups):courseSubjectAddOnGroups(moduleName,catalog.groups,subjectId);
 const groups=applicable.filter(g=>g.kind==='SHARED_GOODS').map(g=>({...g,options:g.options.filter(o=>o.active)})).filter(g=>g.options.length);
 return groups.length?{module:moduleName,revision:catalog.revision,groups} as const:null;
}
/** Caller already owns the new booking and holds Store in its booking transaction. */
export async function persistCustomerBookingGoods(tx:BookingGoodsTx,storeId:string,bookingId:string,participantId:string|undefined,input:CustomerBookingGoodsInput|undefined){
 if(!input?.selections.length)return;
 const catalog=await customerGoodsCatalog(tx,storeId,participantId?bookingId:undefined);
 if(!catalog)throw new AppError('CONFLICT','商品已停止選購，請取消商品選購後再試');
 if(catalog.revision!==input.revision)throw new AppError('CONFLICT','商品內容或價格已更新，請重新確認選購');
 let items;try{items=resolveSharedGoods(catalog.groups,input.selections);}catch(e){throw new AppError('VALIDATION',e instanceof Error?e.message:'請核對商品數量');}
 let anchor=participantId;
 if(catalog.module==='STEAMFOOT'){
  const slots=await initializeBookingParticipants(tx as Prisma.TransactionClient,{storeId,bookingId});anchor=slots[0]?.id;
 }
 if(!anchor)throw new AppError('CONFLICT','缺少預約歸屬');
 const owner=await lockSharedGoodsSubject(tx as Prisma.TransactionClient,storeId,catalog.module,bookingId,anchor);
 const [old]=await tx.$queryRaw<{items:Prisma.JsonValue}[]>`SELECT items FROM "ServiceAddOnOrder" WHERE "storeId"=${storeId} AND module=${catalog.module} AND "bookingId"=${bookingId} AND "reservationKey"=${owner.reservationKey!} AND ownership='RESERVATION'`;
 if(old){const canonical=(v:{id:string;quantity:number}[])=>JSON.stringify(v.map(i=>[i.id,i.quantity]).sort());if(canonical(sharedGoodsSnapshots.parse(old.items))!==canonical(items))throw new AppError('CONFLICT','原預約商品已成立，請勿重送不同選購');return;}
 await tx.$executeRaw`INSERT INTO "ServiceAddOnOrder"(id,"storeId",module,"bookingId","participantId",ownership,"reservationKey",items,total,revision,"updatedAt") VALUES(${randomUUID()},${storeId},${catalog.module},${bookingId},NULL,'RESERVATION',${owner.reservationKey!},${JSON.stringify(items)}::jsonb,${addOnTotals(items).price},1,NOW())`;
}
