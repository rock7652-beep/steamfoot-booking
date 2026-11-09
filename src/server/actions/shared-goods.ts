'use server';
import {z} from 'zod';
import {addonsPrisma as prisma} from '@/lib/addons-db';
import {requirePermission,requireWritablePermission,type PermissionCode} from '@/lib/permissions';
import {getActiveStoreForRead,resolveWriteStoreId} from '@/lib/store';
import {getStoreIndustryModule,requireSteamfootStore} from '@/lib/industry-module-server';
import {requireCourseAddOnModule,requireCourseAddOnMembership} from '@/server/services/course-add-ons';
import {requireMusicFinance} from '@/server/services/music-finance-access';
import {hasStoreFeature,requireStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {paymentMethodValues} from '@/lib/payment-splits';
import {sharedGoodsSelection} from '@/lib/add-ons';
import {AppError,handleActionError} from '@/lib/errors';
import {requireAddOnSelection} from '@/server/services/add-on-access';
import {lockSharedGoodsSubject} from '@/server/services/shared-goods-subject';
import {readAddOnOrder,saveAddOnOrder,postAddOnReceipt,addOnCommand} from '@/server/services/service-add-ons';
import {recordOperationAudit} from '@/server/services/operation-audit';
import {addOnAuditEvidence} from '@/server/services/service-add-ons';
import {auditListDescription} from '@/lib/audit-presentation';
import {revalidatePath} from 'next/cache';
const key=z.string().min(1).max(128),subject=z.object({storeId:key,bookingId:key,participantId:key});
async function context(permission:PermissionCode,write=false){
 const user=write?await requireWritablePermission(permission):await requirePermission(permission);
 const storeId=write?await resolveWriteStoreId(user):await getActiveStoreForRead(user);if(!storeId)throw new AppError('FORBIDDEN','請選擇門市');
 const industry=await getStoreIndustryModule(storeId);let addOnModule:'STEAMFOOT'|'FITNESS'|'MUSIC';
 if(industry==='course'){if(process.env.COURSE_ADD_ONS_ENABLED!=='1')throw new AppError('FORBIDDEN','附加項目尚未開放');addOnModule=await requireCourseAddOnModule(storeId);await requireCourseAddOnMembership(user,storeId);if(addOnModule==='MUSIC')await requireMusicFinance(user,storeId,permission);}
 else{if(industry!=='steamfoot'||process.env.STEAMFOOT_ADD_ONS_ENABLED!=='1'||process.env.BOOKING_PARTICIPANTS_ENABLED!=='true')throw new AppError('FORBIDDEN','此模組共同商品尚未開放');await requireSteamfootStore(storeId);addOnModule='STEAMFOOT';}
 await requireStoreFeature(storeId,FEATURES.BASIC_BOOKING);return {storeId,module:addOnModule,userId:user.id,staffId:user.staffId??null,user};
}
export async function readSharedGoods(input:unknown){try{
 const a=await context('booking.read');await requirePermission('transaction.read');if(a.module==='MUSIC')await requireMusicFinance(a.user,a.storeId,'transaction.read');
 const d=subject.parse(input);if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');
 const data=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${a.storeId} FOR UPDATE`;return readAddOnOrder(tx,a,await lockSharedGoodsSubject(tx,a.storeId,a.module,d.bookingId,d.participantId));});
 const c=await prisma.serviceAddOnCatalog.findUnique({where:{storeId_module:{storeId:a.storeId,module:a.module}},select:{storeId:true}}),canSelect=!!c&&await hasStoreFeature(a.storeId,FEATURES.ADD_ONS);
 return {success:true as const,data:{...data,groups:canSelect?data.groups:[],canSelect}};
}catch(e){return handleActionError(e);}}
export async function mutateSharedGoods(input:unknown){try{
 const d=subject.extend({operation:z.enum(['SAVE','COLLECT','REFUND']),requestKey:z.string().uuid(),revision:z.number().int().nonnegative(),catalogRevision:z.number().int().nonnegative().optional(),selections:sharedGoodsSelection.optional(),amount:z.number().int().positive().max(10000000).optional(),method:z.enum(paymentMethodValues).optional(),originalId:key.optional()}).parse(input);
 const permission=d.operation==='SAVE'?'booking.update':d.operation==='COLLECT'?'transaction.create':'transaction.refund';const a=await context(permission,true);await requirePermission('booking.read');await requirePermission('transaction.read');if(a.module==='MUSIC')await requireMusicFinance(a.user,a.storeId,'transaction.read');
 if(d.storeId!==a.storeId)throw new AppError('FORBIDDEN','門市已切換');if(d.operation!=='SAVE')await requireStoreFeature(a.storeId,FEATURES.TRANSACTION_MANAGEMENT);
 const data=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${a.storeId} FOR UPDATE`;const person=await lockSharedGoodsSubject(tx,a.storeId,a.module,d.bookingId,d.participantId);
 return addOnCommand(tx,a,d.requestKey,{ownership:'RESERVATION',...d},async()=>{
  let result;
  if(d.operation==='SAVE'){await requireAddOnSelection(tx,a.storeId,a.module);if(d.catalogRevision===undefined||!d.selections)throw new AppError('VALIDATION','缺少商品設定');result=await saveAddOnOrder(tx,a,person,{revision:d.revision,catalogRevision:d.catalogRevision,ids:[],selections:d.selections});}
  else{if(!d.amount||!d.method||d.operation==='REFUND'&&!d.originalId||d.operation==='COLLECT'&&d.originalId)throw new AppError('VALIDATION','請核對收退款資料');result=await postAddOnReceipt(tx,a,person,{revision:d.revision,amount:d.amount,method:d.method,originalId:d.originalId});}
  const evidence=await addOnAuditEvidence(tx,a,person,result,d.method);
 await recordOperationAudit({actor:a.user,actorUserId:a.userId,storeId:a.storeId,module:a.module==='STEAMFOOT'?'STEAM':a.module,targetType:'ServiceAddOnOrder',targetId:person.reservationKey!,action:'SHARED_GOODS_'+d.operation,summary:auditListDescription({targetType:'ServiceAddOnOrder',action:'SHARED_GOODS_'+d.operation,afterJson:evidence}),after:evidence},tx);return result;
 });});revalidatePath('/dashboard/bookings');revalidatePath('/dashboard/courses');revalidatePath('/dashboard/revenue');revalidatePath('/dashboard/cashbook');return {success:true as const,data};
}catch(e){return handleActionError(e);}}
