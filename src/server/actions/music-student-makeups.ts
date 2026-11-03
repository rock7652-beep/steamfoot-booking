"use server";
import {z} from "zod";
import {courseManagerRead} from "@/server/services/course-access";
import {prisma} from "@/lib/db";
import {checkPermission} from "@/lib/permissions";
import {getManagerCustomerWhere} from "@/lib/manager-visibility";
import {musicCustomerWhere} from "@/server/services/music-data-scope";
import {resolveStoreViewContextFromCookie} from "@/lib/store-view-context-server";
import {getMusicLeaveWorkspace} from "@/server/queries/music-leave-workspace";
import {AppError,handleActionError} from "@/lib/errors";
/** One authorized student's records only; no store-wide pending list or financial amounts. */
export async function loadMusicStudentMakeups(customerId:string,dataScope?:"operational"|"legacy"){
 try{
  const input=z.object({customerId:z.string().min(1).max(100),dataScope:z.enum(["operational","legacy"]).optional()}).parse({customerId,dataScope});
  const {storeId,user}=await courseManagerRead("booking.read");
  const allowed=await Promise.all([checkPermission(user.role,user.staffId,"customer.read"),checkPermission(user.role,user.staffId,"wallet.read")]);
  if(allowed.some(v=>!v))return {success:true as const,data:null};
  if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}))return {success:true as const,data:null};
  const customer=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,id:input.customerId,mergedIntoCustomerId:null,AND:[musicCustomerWhere(storeId,input.dataScope)]},select:{id:true,name:true}});
  if(!customer)throw new AppError("NOT_FOUND","找不到可檢視的學員");
  const [workspace,canCreate,context]=await Promise.all([getMusicLeaveWorkspace(storeId,[customer],input.dataScope),checkPermission(user.role,user.staffId,"booking.create"),resolveStoreViewContextFromCookie(user)]);
  return {success:true as const,data:{...workspace,customerName:customer.name,canArrange:canCreate&&!context?.isViewMode}};
 }catch(error){return handleActionError(error);}
}

/** Read only the resources needed for one visible learner's original lesson. */
export async function loadMusicMakeupScheduleOptions(customerId:string,sourceId:string,dataScope?:"operational"|"legacy"){
 try{
  z.string().min(1).max(100).parse(sourceId);
  const access=await loadMusicStudentMakeups(customerId,dataScope);
  if(!access.success)return access;
  const row=access.data?.rows.find(r=>r.id===sourceId);
  if(!access.data?.canArrange||!row||row.state!=="待安排"||row.issue)throw new AppError("FORBIDDEN","請選擇可安排的待補課紀錄");
  const {storeId}=await courseManagerRead("booking.read");
  const {coursePrisma}=await import("@/lib/course-db");
  const source=await coursePrisma.courseSession.findFirst({where:{id:row.sourceSessionId,storeId},include:{template:{select:{musicSubjectId:true}}}});
  if(!source)throw new AppError("NOT_FOUND","找不到原課程");
  const {musicTeachingQualifications}=await import("@/server/services/music-teaching-item");
  const qualificationIds=await musicTeachingQualifications(coursePrisma,storeId,{id:source.templateId,musicSubjectId:source.template.musicSubjectId});
  const [rooms,teachers]=await Promise.all([
   coursePrisma.courseRoom.findMany({where:{storeId,isActive:true},select:{id:true,name:true},orderBy:{name:"asc"}}),
   prisma.staff.findMany({where:{storeId,status:"ACTIVE",courseCoachEnabled:true,courseQualificationsConfirmed:true,courseQualifiedTemplateIds:{hasSome:qualificationIds}},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
  ]);
  return {success:true as const,data:{name:source.nameSnapshot,durationMinutes:Math.round((source.endsAt.getTime()-source.startsAt.getTime())/60000),rooms,teachers}};
 }catch(error){return handleActionError(error);}
}
export async function createMusicStudentMakeupSchedule(input:unknown){
 try{
  const data=z.object({customerId:z.string().min(1).max(100),sourceId:z.string().min(1).max(100),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),roomId:z.string().min(1).max(100),coachId:z.string().min(1).max(100),requestKey:z.string().uuid(),dataScope:z.enum(["operational","legacy"]).optional()}).parse(input);
  const {courseManager,courseTransaction}=await import("@/server/services/course-access");
  const {user,storeId}=await courseManager("booking.create");
  const access=await loadMusicStudentMakeups(data.customerId,data.dataScope);
  if(!access.success)return access;
  const row=access.data?.rows.find(r=>r.id===data.sourceId);
  if(!access.data?.canArrange||!row?.cardId)throw new AppError("FORBIDDEN","找不到可安排的本店補課紀錄");
  // A read-only child-store context must never authorize a write in another store.
  const visible=await prisma.customer.findFirst({where:{...getManagerCustomerWhere(user.role,user.staffId,storeId),storeId,id:data.customerId,mergedIntoCustomerId:null,AND:[musicCustomerWhere(storeId,data.dataScope)]},select:{id:true}});
  if(!visible)throw new AppError("FORBIDDEN","請選擇有權限的本店學員");
  if(!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}))throw new AppError("FORBIDDEN","此操作僅適用音樂模組");
  const {getStoreLimitsByStoreId}=await import("@/lib/feature-gate");
  const {scheduleMusicStudentMakeup}=await import("@/server/services/music-student-makeup-schedule");
  const limits=await getStoreLimitsByStoreId(storeId);
  const result=await courseTransaction(storeId,tx=>scheduleMusicStudentMakeup(tx,{storeId,userId:user.id,name:user.name??"店長"},{...data,cardId:row.cardId!},limits.maxMonthlyBookings));
  const {revalidatePath}=await import("next/cache");
  revalidatePath("/dashboard/courses");revalidatePath("/hq/dashboard/courses");
  return {success:true as const,data:result};
 }catch(error){const {handleCourseActionError}=await import("@/server/services/course-resources");return handleCourseActionError(error);}
}
