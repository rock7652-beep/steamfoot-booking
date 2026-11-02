'use server';
import {z} from 'zod';
import {addonsPrisma as prisma} from '@/lib/addons-db';
import {requirePermission,requireWritablePermission,type PermissionCode} from '@/lib/permissions';
import {getActiveStoreForRead,resolveWriteStoreId} from '@/lib/store';
import {requireSteamfootStore} from '@/lib/industry-module-server';
import {requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {AppError,handleActionError} from '@/lib/errors';
import {revalidatePath} from 'next/cache';
import {moduleAddOnGroups,addOnCatalogError} from '@/lib/add-ons';
import {paymentMethodValues} from '@/lib/payment-splits';
import {lockAddOnSubject,readAddOnOrder,saveSteamfootAddOnOrder,postSteamfootAddOnReceipt,addOnCommand} from '@/server/services/steamfoot-add-ons';
import {requireAddOnManagement,requireAddOnSelection} from '@/server/services/add-on-access';
import {recordOperationAudit} from '@/server/services/operation-audit';
const key=z.string().min(1).max(128),subject=z.object({storeId:key,bookingId:key,participantId:key});
async function context(permission:PermissionCode,write=false){
 if(process.env.STEAMFOOT_ADD_ONS_ENABLED!=='1'||process.env.BOOKING_PARTICIPANTS_ENABLED!=='true')throw new AppError('BUSINESS_RULE','附加項目尚未開放');
 const user=write?await requireWritablePermission(permission):await requirePermission(permission);
 const storeId=write?await resolveWriteStoreId(user):await getActiveStoreForRead(user);
 if(!storeId)throw new AppError('FORBIDDEN','請選擇店家');await requireSteamfootStore(storeId);await requireStoreFeature(storeId,FEATURES.BASIC_BOOKING);
 return {storeId,userId:user.id,staffId:user.staffId??null,user};
}
export async function readSteamfootAddOnCatalog(){try{const a=await context('add_ons.manage');await requireStoreFeature(a.storeId,FEATURES.ADD_ONS);const c=await prisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId:a.storeId,module:'STEAMFOOT'}}});return {success:true as const,data:{storeId:a.storeId,revision:c?.revision??0,enabled:c?.enabled??false,groups:moduleAddOnGroups('STEAMFOOT',c?.groups??[])}};}catch(e){return handleActionError(e);}}
export async function saveSteamfootAddOnCatalog(input:unknown){try{
 const a=await context('add_ons.manage',true);await requireStoreFeature(a.storeId,FEATURES.ADD_ONS);
 const d=z.object({storeId:key,revision:z.number().int().nonnegative(),enabled:z.boolean().optional(),requestKey:z.string().uuid(),groups:z.unknown()}).parse(input);if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
 let groups;try{groups=moduleAddOnGroups('STEAMFOOT',d.groups);}catch(error){throw new AppError('VALIDATION',addOnCatalogError(error));}
 const data=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${a.storeId} FOR UPDATE`;await requireAddOnManagement(tx,a.storeId);
 return addOnCommand(tx,a,d.requestKey,d,async()=>{
  const current=await tx.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId:a.storeId,module:'STEAMFOOT'}}});if((current?.revision??0)!==d.revision)throw new AppError('CONFLICT','設定已更新，請重新開啟');
  const images=groups.flatMap(g=>g.options.flatMap(o=>o.imageId?[o.imageId]:[]));if(images.length&&(await tx.serviceAddOnImage.count({where:{storeId:a.storeId,module:'STEAMFOOT',id:{in:[...new Set(images)]}}}))!==new Set(images).size)throw new AppError('FORBIDDEN','圖片不屬於本店');
  const saved=await tx.serviceAddOnCatalog.upsert({where:{storeId_module:{storeId:a.storeId,module:'STEAMFOOT'}},create:{storeId:a.storeId,module:'STEAMFOOT',groups,enabled:d.enabled??false,revision:1},update:{groups,...(d.enabled===undefined?{}:{enabled:d.enabled}),revision:{increment:1}}});
  await recordOperationAudit({actor:a.user,actorUserId:a.userId,storeId:a.storeId,module:'STEAM',targetType:'ServiceAddOnCatalog',targetId:a.storeId,action:'SAVE_ADD_ON_CATALOG',summary:'儲存附加項目',before:{groups:current?.groups??[],enabled:current?.enabled??false},after:{groups,enabled:saved.enabled}},tx);
  return {revision:saved.revision};
 });});revalidatePath('/dashboard/add-ons');revalidatePath('/dashboard/settings/add-ons');return {success:true as const,data};
}catch(e){return handleActionError(e);}}
export async function readSteamfootParticipantAddOns(input:unknown){try{const a=await context('booking.read');await requirePermission('transaction.read');const d=subject.parse(input);if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');const data=await prisma.$transaction(async tx=>readAddOnOrder(tx,a,await lockAddOnSubject(tx,a.storeId,d.bookingId,d.participantId)));const canSelect=await (await import('@/lib/feature-gate')).hasStoreFeature(a.storeId,FEATURES.ADD_ONS)&&!!(await prisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId:a.storeId,module:'STEAMFOOT'}}}))?.enabled;return {success:true as const,data:{...data,groups:canSelect?data.groups:[],canSelect}};}catch(e){return handleActionError(e);}}
export async function mutateSteamfootParticipantAddOns(input:unknown){try{
 const d=subject.extend({requestKey:z.string().uuid(),operation:z.enum(['SAVE','COLLECT','REFUND']),revision:z.number().int().nonnegative(),catalogRevision:z.number().int().nonnegative().optional(),ids:z.array(key).max(100).optional(),amount:z.number().int().positive().max(10000000).optional(),method:z.enum(paymentMethodValues).optional(),originalId:key.optional()}).parse(input);
 const permission=d.operation==='SAVE'?'booking.update':d.operation==='REFUND'?'transaction.refund':'transaction.create';const a=await context(permission,true);await requirePermission('booking.read');await requirePermission('transaction.read');
 if(d.operation!=='SAVE')await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
 if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
 const data=await prisma.$transaction(async tx=>{if(d.operation==='SAVE')await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${a.storeId} FOR UPDATE`;const person=await lockAddOnSubject(tx,a.storeId,d.bookingId,d.participantId);return addOnCommand(tx,a,d.requestKey,d,async()=>{
 let result;
 if(d.operation==='SAVE'){await requireAddOnSelection(tx,a.storeId,'STEAMFOOT');if(d.catalogRevision===undefined||!d.ids)throw new AppError('VALIDATION','缺少品項設定');result=await saveSteamfootAddOnOrder(tx,a,person,{revision:d.revision,catalogRevision:d.catalogRevision,ids:d.ids});}
 else {if(d.amount===undefined||!d.method||d.operation==='REFUND'&&!d.originalId||d.operation==='COLLECT'&&d.originalId)throw new AppError('VALIDATION','請核對收退款資料');result=await postSteamfootAddOnReceipt(tx,a,person,{revision:d.revision,amount:d.amount,method:d.method,originalId:d.operation==='REFUND'?d.originalId:undefined});}
 await recordOperationAudit({actor:a.user,actorUserId:a.userId,storeId:a.storeId,module:'STEAM',targetType:'ServiceAddOnOrder',targetId:person.id,action:'ADD_ON_'+d.operation,summary:'附加項目'+({SAVE:'修改',COLLECT:'收款',REFUND:'退款'}[d.operation]),after:result},tx);return result;
 });});
 revalidatePath('/dashboard/bookings');revalidatePath('/dashboard/cashbook');revalidatePath('/dashboard/revenue');return {success:true as const,data};
}catch(e){return handleActionError(e);}}
