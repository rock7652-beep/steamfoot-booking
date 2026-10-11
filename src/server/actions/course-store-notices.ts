"use server";
import {z} from "zod";
import {coursePrisma} from "@/lib/course-db";
import {courseManager,courseManagerRead,courseTransaction} from "@/server/services/course-access";
import {AppError,handleActionError} from "@/lib/errors";
import {checkPermission} from "@/lib/permissions";
import {enqueueOperationAudit} from "@/server/services/operation-audit-outbox";
import type {CourseNoticeItem,CourseNoticeKind} from "@/lib/course-store-notices";
const store=z.string().min(1).max(100);
export async function loadCourseStoreNotices(input:unknown) {
 try {
  const d=z.object({storeId:store,handled:z.boolean(),offset:z.number().int().min(0).max(100000).default(0)}).parse(input);
  const {storeId,user,isChildStoreView}=await courseManagerRead("booking.read");
  if(storeId!==d.storeId)throw new AppError("CONFLICT","門市已切換");
  const rule=await coursePrisma.courseBookingRule.findUnique({where:{storeId}});
  if(!rule?.backendNoticesEnabled)return {success:true as const,storeId,enabled:false,items:[] as CourseNoticeItem[],count:0,canHandle:false,more:false};
  const [rows,count,canHandle]=await Promise.all([
   coursePrisma.courseStoreNotice.findMany({where:{storeId,handledAt:d.handled?{not:null}:null},orderBy:d.handled?[{handledAt:"desc"},{id:"asc"}]:[{startsAt:"asc"},{createdAt:"asc"},{id:"asc"}],skip:d.offset,take:51}),
   coursePrisma.courseStoreNotice.count({where:{storeId,handledAt:null}}),
   isChildStoreView?Promise.resolve(false):checkPermission(user.role,user.staffId,"booking.update")]);
  const items:CourseNoticeItem[]=rows.slice(0,50).map(r=>({...r,kind:r.kind as CourseNoticeKind,startsAt:r.startsAt.toISOString(),previousStartsAt:r.previousStartsAt?.toISOString()??null,handledAt:r.handledAt?.toISOString()??null,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()}));
  return {success:true as const,storeId,enabled:true,items,count,canHandle,more:rows.length>50};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
}
export async function markCourseStoreNotice(input:unknown) {
 try {
  const d=z.object({storeId:store,id:store,handled:z.boolean(),revision:z.number().int().nonnegative()}).parse(input);
  const {storeId,user}=await courseManager("booking.update");
  if(storeId!==d.storeId)throw new AppError("CONFLICT","門市已切換");
  const saved=await courseTransaction(storeId,async tx=>{
   if(!(await tx.courseBookingRule.findUnique({where:{storeId}}))?.backendNoticesEnabled)throw new AppError("FORBIDDEN","後台異動通知已關閉");
   const n=await tx.courseStoreNotice.findFirst({where:{id:d.id,storeId}});
   if(!n)throw new AppError("NOT_FOUND","找不到通知");
   if(n.revision!==d.revision)throw new AppError("CONFLICT","通知已更新，請重新確認");
   const data={handledAt:d.handled?new Date():null,handledById:d.handled?user.id:null,handledByName:d.handled?user.name??"門市人員":null};
   const updated=await tx.courseStoreNotice.update({where:{id:n.id},data:{...data,revision:{increment:1}}});
   await enqueueOperationAudit({actorUserId:user.id,actorNameSnapshot:user.name,storeId,module:"COURSE",targetType:"CourseStoreNotice",targetId:n.id,action:d.handled?"HANDLE_NOTICE":"REOPEN_NOTICE",summary:d.handled?"標記門市通知已處理":"恢復門市通知待處理"},tx);
   return {id:n.id,revision:updated.revision,handledAt:updated.handledAt?.toISOString()??null,handledByName:updated.handledByName};
  });
  return {success:true as const,storeId,data:saved};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
}
export async function saveCourseOperationSwitch(input:unknown) {
 try {
  const d=z.object({storeId:store,key:z.enum(["selfLeaveEnabled","selfRescheduleEnabled","backendNoticesEnabled"]),enabled:z.boolean(),previous:z.boolean()}).parse(input);
  const {storeId,user}=await courseManager("business_hours.manage");
  if(storeId!==d.storeId)throw new AppError("CONFLICT","門市已切換");
  const data=await courseTransaction(storeId,async tx=>{
   const before=await tx.courseBookingRule.findUnique({where:{storeId}});
   const current=before?.[d.key]??(d.key==="backendNoticesEnabled"?false:d.key==="selfRescheduleEnabled"?before?.selfBookingEnabled??true:true);
   if(current===d.enabled)return {key:d.key,enabled:current};
   if(current!==d.previous)throw new AppError("CONFLICT","設定已更新，請重新開啟核對");
   await tx.courseBookingRule.upsert({where:{storeId},create:{storeId,[d.key]:d.enabled},update:{[d.key]:d.enabled}});
   const label={selfLeaveEnabled:"學員自行請假",selfRescheduleEnabled:"學員自行改期",backendNoticesEnabled:"後台異動通知"}[d.key];
   await enqueueOperationAudit({actorUserId:user.id,actorNameSnapshot:user.name,storeId,module:"COURSE",targetType:"CourseBookingRule",targetId:storeId,action:"UPDATE_OPERATION_SWITCH",summary:`${d.enabled?"開啟":"關閉"}${label}`,before:{[d.key]:current},after:{[d.key]:d.enabled}},tx);
   return {key:d.key,enabled:d.enabled};
  });
  return {success:true as const,storeId,data};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
}
