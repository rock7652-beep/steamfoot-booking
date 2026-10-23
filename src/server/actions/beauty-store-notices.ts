'use server';
import {z} from 'zod';
import {beautyPrisma} from '@/lib/beauty-db';
import {beautyManager,beautyTransaction,audit} from '@/server/beauty/access';
import {getCurrentUser} from '@/lib/session';
import {hasStoreFeature} from '@/lib/feature-gate';
import {FEATURES} from '@/lib/feature-flags';
import {checkPermission} from '@/lib/permissions';
import {resolveStoreViewContextFromCookie} from '@/lib/store-view-context-server';
import {isReadOnlyStoreTarget} from '@/lib/store-read-only';
import {AppError,handleActionError} from '@/lib/errors';
import {toLocalDateStr} from '@/lib/date-utils';
import type {StoreNoticeItem,StoreNoticeLoadResult,StoreNoticeMarkResult} from '@/lib/store-notices';
const key=z.string().min(1).max(100);
const failure=(e:unknown)=>{const r=handleActionError(e);return {success:false as const,error:r.success?'操作失敗':r.error};};
async function reader(storeId:string){
 const a=await beautyManager('booking.read');if(a.storeId!==storeId)throw new AppError('FORBIDDEN','門市已切換');
 const user=await getCurrentUser();if(!user)throw new AppError('FORBIDDEN','請重新登入');
 const [view,customer,staff,edit]=await Promise.all([resolveStoreViewContextFromCookie(user),checkPermission(user.role,user.staffId,'customer.read'),checkPermission(user.role,user.staffId,'staff.view'),checkPermission(user.role,user.staffId,'booking.update')]);
 const [customerFeature,staffFeature]=await Promise.all([hasStoreFeature(a.storeId,FEATURES.CUSTOMER_MANAGEMENT),hasStoreFeature(a.storeId,FEATURES.STAFF_MANAGEMENT)]);
 return {a,customer:customer&&customerFeature,staff:staff&&staffFeature,canHandle:edit&&!view?.isViewMode&&!isReadOnlyStoreTarget(user,a.storeId)};
}
export async function loadBeautyStoreNotices(input:unknown):Promise<StoreNoticeLoadResult>{
 try{const d=z.object({storeId:key,handled:z.boolean(),summaryOnly:z.boolean().default(false),offset:z.number().int().min(0).max(100000).default(0)}).parse(input),scope=await reader(d.storeId),storeId=scope.a.storeId;
 const setting=await beautyPrisma.beautySetting.findUnique({where:{storeId},select:{backendNoticesEnabled:true}});
 if(setting?.backendNoticesEnabled===false)return {success:true,storeId,enabled:false,items:[],count:0,canHandle:false,more:false};
 const countRows=await beautyPrisma.$queryRaw<{count:number}[]>`SELECT COUNT(*)::int AS count FROM "CourseStoreNotice" WHERE "storeId"=${storeId} AND "subjectKey" LIKE 'beauty:%' AND "handledAt" IS NULL`;
 if(d.summaryOnly)return {success:true,storeId,enabled:true,items:[],count:countRows[0].count,canHandle:false,more:false};
 type Row=Omit<StoreNoticeItem,'startsAt'|'previousStartsAt'|'handledAt'|'createdAt'|'updatedAt'>&{startsAt:Date;previousStartsAt:Date|null;handledAt:Date|null;createdAt:Date;updatedAt:Date};
 const rows=await beautyPrisma.$queryRaw<Row[]>`SELECT id,kind,"customerName","courseName","coachName","previousCoachName","startsAt","previousStartsAt","affectedCount",details,"handledAt","handledByName",revision,"createdAt","updatedAt" FROM "CourseStoreNotice" WHERE "storeId"=${storeId} AND "subjectKey" LIKE 'beauty:%' AND ("handledAt" IS NOT NULL)=${d.handled} ORDER BY CASE WHEN ${d.handled} THEN "handledAt" END DESC,"startsAt","createdAt",id LIMIT 51 OFFSET ${d.offset}`;
 return {success:true,storeId,enabled:true,count:countRows[0].count,canHandle:scope.canHandle,more:rows.length>50,items:rows.slice(0,50).map(r=>({...r,customerName:scope.customer?r.customerName:'顧客',coachName:scope.staff?r.coachName:'技師',previousCoachName:scope.staff?r.previousCoachName:null,details:{},canViewCourse:scope.customer,startsAt:r.startsAt.toISOString(),previousStartsAt:r.previousStartsAt?.toISOString()??null,handledAt:r.handledAt?.toISOString()??null,handledByName:scope.staff?r.handledByName:null,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()}))};
 }catch(e){return failure(e);}
}
export async function markBeautyStoreNotice(input:unknown):Promise<StoreNoticeMarkResult>{
 try{const d=z.object({storeId:key,id:key,handled:z.boolean(),revision:z.number().int().nonnegative()}).parse(input),a=await beautyManager('booking.update',true);if(a.storeId!==d.storeId)throw new AppError('FORBIDDEN','門市已切換');
 const data=await beautyTransaction(a,async tx=>{
 if((await tx.beautySetting.findUnique({where:{storeId:a.storeId},select:{backendNoticesEnabled:true}}))?.backendNoticesEnabled===false)throw new AppError('FORBIDDEN','後台異動通知已關閉');
 const rows=await tx.$queryRaw<{id:string;revision:number;handledAt:Date|null;handledByName:string|null}[]>`UPDATE "CourseStoreNotice" SET "handledAt"=${d.handled?new Date():null},"handledById"=${d.handled?a.userId:null},"handledByName"=${d.handled?a.name??'店家人員':null},revision=revision+1,"updatedAt"=NOW() WHERE id=${d.id} AND "storeId"=${a.storeId} AND "subjectKey" LIKE 'beauty:%' AND revision=${d.revision} RETURNING id,revision,"handledAt","handledByName"`;
 if(!rows[0])throw new AppError('CONFLICT','通知已更新或不屬於本店，請重新確認');await audit(tx,a,d.handled?'HANDLE_NOTICE':'REOPEN_NOTICE',JSON.stringify({id:d.id,revision:d.revision}));return {...rows[0],handledAt:rows[0].handledAt?.toISOString()??null};
 });return {success:true,storeId:a.storeId,data};}catch(e){return failure(e);}
}
export async function loadBeautyStoreNoticeTarget(input:unknown){
 try{const d=z.object({storeId:key,id:key}).parse(input),scope=await reader(d.storeId);if(!scope.customer)throw new AppError('FORBIDDEN','沒有檢視顧客的權限');
 if((await beautyPrisma.beautySetting.findUnique({where:{storeId:d.storeId},select:{backendNoticesEnabled:true}}))?.backendNoticesEnabled===false)throw new AppError('FORBIDDEN','後台異動通知已關閉');
 const rows=await beautyPrisma.$queryRaw<{id:string;startsAt:Date}[]>`SELECT b.id,b."startsAt" FROM "CourseStoreNotice" n JOIN "BeautyAppointment" b ON n."subjectKey"='beauty:'||b.id AND b."storeId"=n."storeId" WHERE n.id=${d.id} AND n."storeId"=${scope.a.storeId}`;
 if(!rows[0])throw new AppError('NOT_FOUND','找不到本店對應的預約');return {success:true as const,storeId:scope.a.storeId,data:{id:rows[0].id,date:toLocalDateStr(rows[0].startsAt)}};
 }catch(e){return failure(e);}
}
