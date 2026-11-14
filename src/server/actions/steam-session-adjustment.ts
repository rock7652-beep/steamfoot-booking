'use server';
import {Prisma} from '@prisma/client';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/db';
import {requirePermission,requireWritablePermission} from '@/lib/permissions';
import {resolveWriteStoreId} from '@/lib/store';
import {requireSteamfootStore} from '@/lib/industry-module-server';
import {getManagerCustomerWhere} from '@/lib/manager-visibility';
import {AppError,handleActionError} from '@/lib/errors';
import {sessionAdjustmentInput,type SessionAdjustmentResult} from '@/lib/plan-session-adjustment';
import {adjustSteamSessions,steamSessionAdjustmentRecords} from '@/server/services/steam-session-adjustment';
import {settingsSaveUncertain} from '@/server/services/settings-save-error';

export async function saveSteamSessionAdjustment(input:unknown):Promise<SessionAdjustmentResult>{
 let committed=false;
 try{
  const d=sessionAdjustmentInput.parse(input),user=await requireWritablePermission('wallet.adjust');
  await requirePermission('customer.read');await requirePermission('wallet.read');
  const storeId=await resolveWriteStoreId(user);if(storeId!==d.expectedStoreId)throw new AppError('CONFLICT','門市已切換，請重新開啟方案');await requireSteamfootStore(storeId);
  const result=await prisma.$transaction(async tx=>{
   const stores=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='STEAMFOOT' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
   if(stores.length!==1)throw new AppError('FORBIDDEN','店家已停用或模組已變更');
   const customer=await tx.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),id:d.customerId,storeId,mergedIntoCustomerId:null,user:{isNot:{status:'SUSPENDED'}}},select:{id:true,name:true}});
   if(!customer)throw new AppError('FORBIDDEN','僅能調整有權管理之顧客的方案');
   return adjustSteamSessions(tx,{storeId,userId:user.id,name:user.name??'管理人員',role:user.role,staffId:user.staffId??null},d,customer.name);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});committed=true;
  let syncWarning=false;try{for(const path of ['/dashboard/customers',`/dashboard/customers/${d.customerId}`,'/my-plans','/book','/liff/wallets'])revalidatePath(path);}catch{syncWarning=true;}
  return {success:true,data:result,syncWarning};
 }catch(error){const r=handleActionError(error);const rolledBack=error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2034';return {success:false,error:rolledBack?'方案正在更新，本次調整未完成，請重新讀取後再操作':r.success?'調整尚未確認':r.error,uncertain:committed||!rolledBack&&settingsSaveUncertain(error)};}
}

export async function readSteamPlanOperations(customerId:string,walletId:string){
 try{
  const user=await requirePermission('customer.read');await requirePermission('wallet.read');
  const {resolveStoreViewContextFromCookie,storeIdForViewContext,userForViewContext}=await import('@/lib/store-view-context-server');
  const {getActiveStoreForRead}=await import('@/lib/store');
  const context=await resolveStoreViewContextFromCookie(user),storeId=storeIdForViewContext(await getActiveStoreForRead(user),context),actor=userForViewContext(user,context);
  await requireSteamfootStore(storeId);
  const customer=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(actor.role,actor.staffId,storeId),id:customerId,storeId,mergedIntoCustomerId:null,user:{isNot:{status:'SUSPENDED'}}},select:{id:true,name:true}});
  if(!customer)throw new AppError('FORBIDDEN','找不到本店可查閱的顧客');
  const data=await prisma.$transaction(async tx=>{
   const wallet=await tx.customerPlanWallet.findFirst({where:{id:walletId,customerId,storeId}});if(!wallet)throw new AppError('NOT_FOUND','方案不存在');
   const [sessions,records]=await Promise.all([tx.walletSession.findMany({where:{walletId},orderBy:{sessionNo:'asc'},select:{id:true,sessionNo:true,status:true,bookingId:true,reservedAt:true,completedAt:true,voidedAt:true,updatedAt:true,voidReason:true}}),steamSessionAdjustmentRecords(tx,storeId,walletId,customerId,customer.name)]);
   return {wallet:{id:wallet.id,remaining:wallet.remainingSessions,held:sessions.filter(s=>s.status==='RESERVED').length,expiresAt:wallet.expiryDate?.toISOString()??null,closed:wallet.status==='CANCELLED',active:wallet.status==='ACTIVE',startDate:wallet.startDate.toISOString()},records,sessions:sessions.map(s=>({...s,reservedAt:s.reservedAt?.toISOString()??null,completedAt:s.completedAt?.toISOString()??null,voidedAt:s.voidedAt?.toISOString()??null,updatedAt:s.updatedAt.toISOString()}))};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});return {success:true as const,data};
 }catch(error){const r=handleActionError(error);return {success:false as const,error:r.success?'讀取失敗':r.error};}
}
