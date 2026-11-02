import 'server-only';
import {sharedGoodsAvailable} from './shared-goods-availability';
import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/db';
import {requireCourseStore} from '@/lib/industry-module-server';
import {AppError} from '@/lib/errors';
import {isMusicCourseStoreFromEntitlements} from './course-business-profile';
import type {AddOnSubject} from './service-add-ons';
import {checkPermission,requirePermission} from '@/lib/permissions';
import {readMusicFinanceScope} from './music-finance-access';

export type CourseAddOnCapabilities={storeId:string;module:'FITNESS'|'MUSIC';canEdit:boolean;canCollect:boolean;canRefund:boolean;sharedGoods?:boolean};
export async function requireCourseAddOnMembership(user:Awaited<ReturnType<typeof requirePermission>>,storeId:string){
 if(user.role==='ADMIN')return;
 const staff=await prisma.staff.findFirst({where:{id:user.staffId??'',storeId,userId:user.id,status:'ACTIVE',user:{status:'ACTIVE'}},select:{id:true}});
 if(!staff)throw new AppError('FORBIDDEN','本店工作權限已停用');
}
export async function readCourseAddOnCapabilities(user:Awaited<ReturnType<typeof requirePermission>>,storeId:string,bookingId?:string,subjectId?:string|null):Promise<CourseAddOnCapabilities|null>{
 if(process.env.COURSE_ADD_ONS_ENABLED!=='1')return null;
 if(!await checkPermission(user.role,user.staffId,'transaction.read'))return null;
 let addOnModule:'FITNESS'|'MUSIC';
 try{addOnModule=await requireCourseAddOnModule(storeId);}catch(error){if(error instanceof AppError&&error.code==='FORBIDDEN')return null;throw error;}
 if(addOnModule==='MUSIC'&&await readMusicFinanceScope(user,storeId)!==null)return null;
 const [canEdit,canCollect,canRefund]=await Promise.all((['booking.update','transaction.create','transaction.refund'] as const).map(p=>checkPermission(user.role,user.staffId,p)));
 return {storeId,module:addOnModule,canEdit,canCollect,canRefund,sharedGoods:await sharedGoodsAvailable(storeId,addOnModule,bookingId,subjectId)};
}

export async function readCourseAddOnSessionFields(user:Awaited<ReturnType<typeof requirePermission>>,storeId:string,bookingId?:string,subjectId?:string|null):Promise<{addOns?:CourseAddOnCapabilities|null}>{
 if(process.env.COURSE_ADD_ONS_ENABLED!=='1')return {};
 return {addOns:await readCourseAddOnCapabilities(user,storeId,bookingId,subjectId)};
}

/** Resolve from server entitlements; never accept a module supplied by the browser. */
export async function requireCourseAddOnModule(storeId:string):Promise<'FITNESS'|'MUSIC'>{
 await requireCourseStore(storeId);
 const addOnModule=await isMusicCourseStoreFromEntitlements(prisma,storeId)?'MUSIC':'FITNESS';
 const feature=await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:addOnModule==='MUSIC'?'business.music':'business.fitness',status:'ENABLED'},select:{storeId:true,startsAt:true,expiresAt:true}});
 const now=new Date();
 if(!feature||feature.startsAt&&feature.startsAt>now||feature.expiresAt&&feature.expiresAt<=now)throw new AppError('FORBIDDEN','本店尚未開通此模組');
 return addOnModule;
}

/** Same store-first lock order as course mutations. No seats, cards or tuition are changed. */
export async function lockCourseAddOnSubject(tx:Prisma.TransactionClient,storeId:string,sessionId:string,bookingId:string):Promise<AddOnSubject>{
 await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
 const [person]=await tx.$queryRaw<AddOnSubject[]>`SELECT b.id,CASE WHEN subject."isActive" THEN subject.id ELSE NULL END AS "serviceId",b."sessionId" AS "bookingId",b."customerId",b.status,
 CASE WHEN s."cancelledAt" IS NOT NULL OR s."teacherAttendance" IN ('LEAVE','NO_SHOW') THEN 'CANCELLED' ELSE 'ACTIVE' END AS "bookingStatus"
 FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
 LEFT JOIN "CourseTemplate" t ON t.id=s."templateId" AND t."storeId"=s."storeId"
 LEFT JOIN "MusicSubject" subject ON subject.id=t."musicSubjectId" AND subject."storeId"=s."storeId"
 WHERE b.id=${bookingId} AND b."storeId"=${storeId} AND b."sessionId"=${sessionId} FOR UPDATE OF b`;
 if(!person)throw new AppError('NOT_FOUND','學員預約不存在或不屬於本店課程');
 return person;
}
