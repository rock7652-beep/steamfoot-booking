"use server";

import {noticeWindow} from "@/lib/store-notice-lifecycle";
import { z } from "zod";
import { coursePrisma } from "@/lib/course-db";
import { checkPermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { courseManager, courseManagerRead, courseTransaction } from "@/server/services/course-access";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import { courseDisplayName } from "@/lib/course-template-presentation";
import type {StoreNoticeItem,StoreNoticeLoadResult} from "@/lib/store-notices";
import {noticeReadStep,withNoticeDiagnostics} from '@/server/services/notice-read-timing';

const id = z.string().min(1).max(100);
type NoticeRow = { id:string; eventType:string; handledAt:Date|null; handledByName:string|null; revision:number; createdAt:Date };

type CombinedRow = {id:string;kind:StoreNoticeItem["kind"];subjectKey:string;customerName:string;courseName:string;coachName:string;previousCoachName:string|null;startsAt:Date;previousStartsAt:Date|null;affectedCount:number;details:unknown;handledAt:Date|null;handledByName:string|null;revision:number;createdAt:Date;updatedAt:Date;publishedAt?:Date};
/** One ordered list and one count across both sources; store scope is checked before SQL. */
export async function loadCombinedCourseStoreNotices(input:unknown):Promise<StoreNoticeLoadResult> {
 return withNoticeDiagnostics(()=>readCombinedCourseStoreNotices(input));
}
async function readCombinedCourseStoreNotices(input:unknown):Promise<StoreNoticeLoadResult> {
 try {
  const d=z.object({storeId:id,handled:z.boolean(),summaryOnly:z.boolean().default(false),offset:z.number().int().min(0).max(100000).default(0)}).parse(input);const window=noticeWindow(d.handled);
  const {storeId,user,isChildStoreView}=await noticeReadStep('access',()=>courseManagerRead("booking.read",{timing:{measure:noticeReadStep}}));
  if(storeId!==d.storeId)throw new AppError("CONFLICT","門市已切換");
  const counts=await noticeReadStep('count_query',()=>coursePrisma.$queryRaw<Array<{count:number;latest:Date|null}>>`SELECT count(*)::int AS count,max("publishedAt") AS latest FROM (SELECT "publishedAt" FROM public."CourseStoreNotice" WHERE "storeId"=${storeId} AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now} UNION ALL SELECT "publishedAt" FROM public."DigitalManagerNotice" WHERE "storeId"=${storeId} AND "eventType" IN ('TRANSFER_PENDING_CONFIRMATION','DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}) AS pending`);
  const count=counts[0]?.count??0,latestAt=counts[0]?.latest?.toISOString()??null;
  if(d.summaryOnly)return {success:true,storeId,enabled:true,items:[],count,latestAt,canHandle:false,more:false};
  const [rows,canHandle,canTransactions,canCustomers]=await Promise.all([
   coursePrisma.$queryRaw<CombinedRow[]>`SELECT * FROM (
 (
    SELECT id,kind,"subjectKey","customerName","courseName","coachName","previousCoachName","startsAt","previousStartsAt","affectedCount",details,"readAt" AS "handledAt","readByName" AS "handledByName",revision,"createdAt","updatedAt","publishedAt" FROM public."CourseStoreNotice" WHERE "storeId"=${storeId} AND "publishedAt">${window.after} AND "publishedAt"<=${window.through} ORDER BY "publishedAt" DESC,id DESC LIMIT ${d.offset+51}
    ) UNION ALL (
    SELECT 'digital:'||id AS id,CASE "eventType" WHEN 'TRANSFER_PENDING_CONFIRMATION' THEN 'PAYMENT' WHEN 'DIGITAL_BUTLER_LEAD_CREATED' THEN 'LEAD' WHEN 'INCOMPLETE_SERVICE_REMINDER' THEN 'REMINDER' WHEN 'DAILY_ACTION_DIGEST' THEN 'DIGEST' ELSE 'SUPPORT' END AS kind,''::text AS "subjectKey",CASE "eventType" WHEN 'TRANSFER_PENDING_CONFIRMATION' THEN '方案付款' WHEN 'DIGITAL_BUTLER_LEAD_CREATED' THEN '顧客詢問' WHEN 'INCOMPLETE_SERVICE_REMINDER' THEN '課程出席' WHEN 'DAILY_ACTION_DIGEST' THEN '門市' ELSE '真人客服' END AS "customerName",''::text AS "courseName",''::text AS "coachName",NULL::text AS "previousCoachName","createdAt" AS "startsAt",NULL::timestamptz AS "previousStartsAt",1 AS "affectedCount",'{}'::jsonb AS details,"readAt" AS "handledAt","readByName" AS "handledByName",revision,"createdAt","updatedAt","publishedAt" FROM public."DigitalManagerNotice" WHERE "storeId"=${storeId} AND "eventType" IN ('TRANSFER_PENDING_CONFIRMATION','DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') AND "publishedAt">${window.after} AND "publishedAt"<=${window.through} ORDER BY "publishedAt" DESC,id DESC LIMIT ${d.offset+51}
   )
 ) AS notices ORDER BY "publishedAt" DESC,id DESC OFFSET ${d.offset} LIMIT 51`,
   isChildStoreView?Promise.resolve(false):checkPermission(user.role,user.staffId,"booking.update"),
   isChildStoreView?Promise.resolve(false):checkPermission(user.role,user.staffId,"transaction.read"),
   isChildStoreView?Promise.resolve(false):checkPermission(user.role,user.staffId,"customer.read"),
  ]);
  return {success:true,storeId,enabled:true,count,latestAt,canHandle,more:rows.length>50,items:rows.slice(0,50).map(r=>({...r,courseName:r.id.startsWith('digital:')?r.courseName:courseDisplayName(r.courseName),customerName:r.subjectKey.startsWith("session:")?courseDisplayName(r.customerName):r.customerName,canViewCourse:r.kind==='PAYMENT'?canTransactions:r.kind==='LEAD'||r.kind==='SUPPORT'?canCustomers:r.kind==='REMINDER'||r.kind==='DIGEST'?!isChildStoreView:!isChildStoreView&&/^(session|booking):.+/.test(r.subjectKey),startsAt:r.startsAt.toISOString(),previousStartsAt:r.previousStartsAt?.toISOString()??null,handledAt:r.handledAt?.toISOString()??null,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString(),publishedAt:(r.publishedAt??r.createdAt).toISOString()}))};
 }catch(e){const r=handleActionError(e);return {success:false,error:r.success?"通知讀取失敗":r.error};}
}

/** Only generic event labels are returned; financial details remain behind their own permissions. */
export async function loadCourseDigitalManagerNotices(input: unknown) {
  try {
    const d=z.object({storeId:id,handled:z.boolean(),offset:z.number().int().min(0).max(100000).default(0)}).parse(input);const window=noticeWindow(d.handled);
    const {storeId,user,isChildStoreView}=await courseManagerRead("booking.read");
    if(storeId!==d.storeId)throw new AppError("CONFLICT","門市已切換");
    const [rows,counts,canHandle]=await Promise.all([
      coursePrisma.$queryRaw<NoticeRow[]>`SELECT id,"eventType","readAt" AS "handledAt","readByName" AS "handledByName",revision,"createdAt" FROM public."DigitalManagerNotice" WHERE "storeId"=${storeId} AND "publishedAt">${window.after} AND "publishedAt"<=${window.through} ORDER BY "publishedAt" DESC,id DESC OFFSET ${d.offset} LIMIT 51`,
      coursePrisma.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM public."DigitalManagerNotice" WHERE "storeId"=${storeId} AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}`,
      isChildStoreView?Promise.resolve(false):checkPermission(user.role,user.staffId,"booking.update"),
    ]);
    return {success:true as const,storeId,enabled:true,count:counts[0]?.count??0,canHandle,more:rows.length>50,items:rows.slice(0,50).map(n=>({...n,createdAt:n.createdAt.toISOString(),handledAt:n.handledAt?.toISOString()??null}))};
  } catch(e) { const r=handleActionError(e);return {success:false as const,error:r.success?"通知讀取失敗":r.error}; }
}

export async function markCourseDigitalManagerNotice(input:unknown) {
  try {
    const d=z.object({storeId:id,id,handled:z.boolean(),revision:z.number().int().nonnegative()}).parse(input);const window=noticeWindow(d.handled);
    const {storeId,user}=await courseManager("booking.update");
    if(storeId!==d.storeId)throw new AppError("CONFLICT","門市已切換");
    const data=await courseTransaction(storeId,async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;revision:number;handledAt:Date|null;handledByName:string|null}>>`UPDATE public."DigitalManagerNotice" SET "readAt"=${d.handled?new Date():null},"readById"=${d.handled?user.id:null},"readByName"=${d.handled?user.name??"門市人員":null},revision=revision+1,"updatedAt"=now() WHERE id=${d.id} AND "storeId"=${storeId} AND revision=${d.revision} AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now} RETURNING id,revision,"readAt" AS "handledAt","readByName" AS "handledByName"`;
      const saved=rows[0];if(!saved)throw new AppError("CONFLICT","通知已更新，請重新確認");
      await enqueueOperationAudit({actorUserId:user.id,actorNameSnapshot:user.name,storeId,module:"COURSE",targetType:"DigitalManagerNotice",targetId:saved.id,action:d.handled?"HANDLE_NOTICE":"REOPEN_NOTICE",summary:d.handled?"標記門市訊息已讀":"恢復門市訊息未讀"},tx);
      return {...saved,handledAt:saved.handledAt?.toISOString()??null};
    });
    return {success:true as const,storeId,data};
  } catch(e) { const r=handleActionError(e);return {success:false as const,error:r.success?"通知更新失敗":r.error}; }
}

/** Marks all pages in this store together; leaves bookings and delivery settings intact. */
export async function markAllCourseStoreNotices(input:unknown) {
 try {
 const d=z.object({storeId:id}).parse(input);const window=noticeWindow(false);
 const {storeId,user}=await courseManager("booking.update");if(storeId!==d.storeId)throw new AppError("CONFLICT","門市已切換");
 const count=await courseTransaction(d.storeId,async tx=>{
 const rows0=await tx.$executeRaw`UPDATE public."CourseStoreNotice" SET "readAt"=now(),"readById"=${user.id},"readByName"=${user.name??"門市人員"},revision=revision+1,"updatedAt"=now() WHERE "storeId"=${d.storeId} AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}`;
 const rows1=await tx.$executeRaw`UPDATE public."DigitalManagerNotice" SET "readAt"=now(),"readById"=${user.id},"readByName"=${user.name??"門市人員"},revision=revision+1,"updatedAt"=now() WHERE "storeId"=${d.storeId} AND "eventType" IN ('TRANSFER_PENDING_CONFIRMATION','DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}`;
 await enqueueOperationAudit({actorUserId:user.id,actorNameSnapshot:user.name,storeId:d.storeId,module:"COURSE",targetType:"CourseStoreNotice",targetId:d.storeId,action:"HANDLE_ALL_NOTICES",summary:"全部標為已讀"},tx);
 return rows0+rows1;
 });
 return {success:true as const,storeId:d.storeId,count};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
}
