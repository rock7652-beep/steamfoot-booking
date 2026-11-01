"use server";
import {noticeWindow} from "@/lib/store-notice-lifecycle";
import {z} from "zod";
import {prisma} from "@/lib/db";
import {requirePermission,requireWritablePermission,checkPermission} from "@/lib/permissions";
import {getActiveStoreForRead,resolveWriteStoreId} from "@/lib/store";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {AppError,handleActionError} from "@/lib/errors";
import {recordOperationAudit} from "@/server/services/operation-audit";
import type {StoreNoticeItem,StoreNoticeLoadResult,StoreNoticeMarkResult} from "@/lib/store-notices";
import {noticeReadStep,withNoticeDiagnostics} from '@/server/services/notice-read-timing';
const id=z.string().min(1).max(100);
async function scope(storeId:string,permission:"booking.read"|"booking.update"|"business_hours.manage") {
 const user=permission==="booking.read"?await requirePermission(permission):await requireWritablePermission(permission);
 const current=permission==="booking.read"?await getActiveStoreForRead(user):await resolveWriteStoreId(user);
 if(current!==storeId)throw new AppError("CONFLICT","門市已切換，請重新整理");
 if(await getStoreIndustryModule(storeId)!=="steamfoot")throw new AppError("FORBIDDEN","此通知僅適用蒸足模組");
 return user;
}
export async function loadSteamfootStoreNotices(input:unknown):Promise<StoreNoticeLoadResult> {
 return withNoticeDiagnostics(()=>readSteamfootStoreNotices(input));
}
async function readSteamfootStoreNotices(input:unknown):Promise<StoreNoticeLoadResult> {
 try {
  const d=z.object({storeId:id,handled:z.boolean(),summaryOnly:z.boolean().default(false),offset:z.number().int().min(0).max(100000).default(0)}).parse(input);const window=noticeWindow(d.handled);
  const user=await noticeReadStep('access',()=>scope(d.storeId,"booking.read"));
  if(d.summaryOnly){
   const totals=await noticeReadStep('count_query',()=>prisma.$queryRaw<Array<{count:number;latest:Date|null}>>`SELECT count(*)::int AS count,max("publishedAt") AS latest FROM (SELECT "publishedAt" FROM public."SteamfootStoreNotice" WHERE "storeId"=${d.storeId} AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now} UNION ALL SELECT "publishedAt" FROM public."DigitalManagerNotice" WHERE "storeId"=${d.storeId} AND ("eventType" IN ('DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','VIP_INTEREST','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') OR ("eventType"='TRANSFER_PENDING_CONFIRMATION' AND "eventKey" LIKE 'pending-payment:%')) AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}) AS pending`);
   return {success:true,storeId:d.storeId,enabled:true,items:[],count:totals[0]?.count??0,latestAt:totals[0]?.latest?.toISOString()??null,canHandle:false,more:false};
  }
  const child=user.role!=="ADMIN"&&user.storeId!==d.storeId;
  type Row=Omit<StoreNoticeItem,"startsAt"|"previousStartsAt"|"handledAt"|"createdAt"|"updatedAt">&{startsAt:Date;previousStartsAt:Date|null;handledAt:Date|null;createdAt:Date;updatedAt:Date;publishedAt?:Date};
  const [rows,totals,canHandle,canPayment,canCustomers]=await Promise.all([
   prisma.$queryRaw<Row[]>`SELECT * FROM (
 (
    SELECT id,kind,"bookingId" AS "targetId","customerName","serviceName" AS "courseName","staffName" AS "coachName","previousStaffName" AS "previousCoachName","startsAt","previousStartsAt","affectedCount",details,"readAt" AS "handledAt","readByName" AS "handledByName",revision,"createdAt","updatedAt","publishedAt" FROM public."SteamfootStoreNotice" WHERE "storeId"=${d.storeId} AND "publishedAt">${window.after} AND "publishedAt"<=${window.through} ORDER BY "publishedAt" DESC,id DESC LIMIT ${d.offset+51}
    ) UNION ALL ( SELECT 'digital:'||id AS id,CASE "eventType" WHEN 'TRANSFER_PENDING_CONFIRMATION' THEN 'PAYMENT' WHEN 'DIGITAL_BUTLER_LEAD_CREATED' THEN 'LEAD' WHEN 'VIP_INTEREST' THEN 'VIP' WHEN 'INCOMPLETE_SERVICE_REMINDER' THEN 'REMINDER' WHEN 'DAILY_ACTION_DIGEST' THEN 'DIGEST' ELSE 'SUPPORT' END,NULL::text,CASE "eventType" WHEN 'TRANSFER_PENDING_CONFIRMATION' THEN '方案付款' WHEN 'DIGITAL_BUTLER_LEAD_CREATED' THEN '顧客詢問' WHEN 'VIP_INTEREST' THEN '續購需求' WHEN 'INCOMPLETE_SERVICE_REMINDER' THEN '服務未完成' WHEN 'DAILY_ACTION_DIGEST' THEN '門市' ELSE '真人客服' END,''::text,''::text,NULL::text,"createdAt",NULL::timestamptz,1,'{}'::jsonb,"readAt" AS "handledAt","readByName" AS "handledByName",revision,"createdAt","updatedAt","publishedAt" FROM public."DigitalManagerNotice" WHERE "storeId"=${d.storeId} AND ("eventType" IN ('DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','VIP_INTEREST','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') OR ("eventType"='TRANSFER_PENDING_CONFIRMATION' AND "eventKey" LIKE 'pending-payment:%')) AND "publishedAt">${window.after} AND "publishedAt"<=${window.through} ORDER BY "publishedAt" DESC,id DESC LIMIT ${d.offset+51}
   )
 ) AS notices ORDER BY "publishedAt" DESC,id DESC OFFSET ${d.offset} LIMIT 51`,
   prisma.$queryRaw<Array<{count:number;latest:Date|null}>>`SELECT count(*)::int AS count,max("publishedAt") AS latest FROM (SELECT "publishedAt" FROM public."SteamfootStoreNotice" WHERE "storeId"=${d.storeId} AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now} UNION ALL SELECT "publishedAt" FROM public."DigitalManagerNotice" WHERE "storeId"=${d.storeId} AND ("eventType" IN ('DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','VIP_INTEREST','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') OR ("eventType"='TRANSFER_PENDING_CONFIRMATION' AND "eventKey" LIKE 'pending-payment:%')) AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}) AS pending`,
   child?Promise.resolve(false):checkPermission(user.role,user.staffId,"booking.update"),
   child?Promise.resolve(false):checkPermission(user.role,user.staffId,"transaction.create"),
   child?Promise.resolve(false):checkPermission(user.role,user.staffId,"customer.read")
  ]);
  return {success:true,storeId:d.storeId,enabled:true,count:totals[0]?.count??0,latestAt:totals[0]?.latest?.toISOString()??null,canHandle,more:rows.length>50,items:rows.slice(0,50).map(n=>({...n,canViewCourse:n.kind==='PAYMENT'?canPayment:n.kind==='LEAD'||n.kind==='SUPPORT'||n.kind==='VIP'?canCustomers:n.kind==='REMINDER'||n.kind==='DIGEST'?!child:true,startsAt:n.startsAt.toISOString(),previousStartsAt:n.previousStartsAt?.toISOString()??null,handledAt:n.handledAt?.toISOString()??null,createdAt:n.createdAt.toISOString(),updatedAt:n.updatedAt.toISOString(),publishedAt:(n.publishedAt??n.createdAt).toISOString()}))};
 }catch(e){const r=handleActionError(e);return {success:false,error:r.success?"操作失敗":r.error};}
}
export async function loadSteamfootVipNoticeTarget(input:unknown) {
 try {
  const d=z.object({storeId:id,id:id}).parse(input),user=await scope(d.storeId,"booking.read");
  if(user.role!=="ADMIN"&&user.storeId!==d.storeId)throw new AppError("FORBIDDEN","請切換至本店操作");
  if(!await checkPermission(user.role,user.staffId,"customer.read"))throw new AppError("FORBIDDEN","需要顧客查閱權限");
  if(!d.id.startsWith("digital:"))throw new AppError("NOT_FOUND","找不到通知");
  const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT c.id FROM public."DigitalManagerNotice" n JOIN public."Customer" c ON c.id=n."targetId" AND c."storeId"=n."storeId" AND c."mergedIntoCustomerId" IS NULL WHERE n.id=${d.id.slice(8)} AND n."storeId"=${d.storeId} AND n."eventType"='VIP_INTEREST'`;
  if(!rows[0])throw new AppError("NOT_FOUND","找不到本店顧客");
  return {success:true as const,storeId:d.storeId,data:{id:rows[0].id}};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"通知讀取失敗":r.error};}
}
export async function loadSteamfootReminderTarget(input:unknown) {
 try {
  const d=z.object({storeId:id,id:id}).parse(input);await scope(d.storeId,"booking.read");
  if(!d.id.startsWith("digital:"))throw new AppError("NOT_FOUND","找不到通知");
  const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT b.id FROM public."DigitalManagerNotice" n JOIN public."Booking" b ON b.id=n."targetId" AND b."storeId"=n."storeId" WHERE n.id=${d.id.slice(8)} AND n."storeId"=${d.storeId} AND n."eventType"='INCOMPLETE_SERVICE_REMINDER' AND n."eventKey" LIKE 'incomplete-service-reminder:%'`;
  if(!rows[0])throw new AppError("NOT_FOUND","找不到本店預約");
  return {success:true as const,storeId:d.storeId,data:{id:rows[0].id}};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"通知讀取失敗":r.error};}
}
export async function markSteamfootStoreNotice(input:unknown):Promise<StoreNoticeMarkResult> {
 try {
  const d=z.object({storeId:id,id,handled:z.boolean(),revision:z.number().int().nonnegative()}).parse(input);const window=noticeWindow(d.handled);
  const user=await scope(d.storeId,"booking.update");
  const data=await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM public."Store" WHERE id=${d.storeId} FOR UPDATE`;
   const digital=d.id.startsWith('digital:'),actualId=digital?d.id.slice(8):d.id;
   const rows=digital?await tx.$queryRaw<Array<{id:string;revision:number;handledAt:Date|null;handledByName:string|null}>>`UPDATE public."DigitalManagerNotice" SET "readAt"=${d.handled?new Date():null},"readById"=${d.handled?user.id:null},"readByName"=${d.handled?user.name??"門市人員":null},revision=revision+1,"updatedAt"=now() WHERE "storeId"=${d.storeId} AND id=${actualId} AND ("eventType" IN ('DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','VIP_INTEREST','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') OR ("eventType"='TRANSFER_PENDING_CONFIRMATION' AND "eventKey" LIKE 'pending-payment:%')) AND revision=${d.revision} AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now} RETURNING id,revision,"readAt" AS "handledAt","readByName" AS "handledByName"`:await tx.$queryRaw<Array<{id:string;revision:number;handledAt:Date|null;handledByName:string|null}>>`UPDATE public."SteamfootStoreNotice" SET "readAt"=${d.handled?new Date():null},"readById"=${d.handled?user.id:null},"readByName"=${d.handled?user.name??"門市人員":null},revision=revision+1,"updatedAt"=now() WHERE "storeId"=${d.storeId} AND id=${actualId} AND revision=${d.revision} AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now} RETURNING id,revision,"readAt" AS "handledAt","readByName" AS "handledByName"`;
   const saved=rows[0];if(!saved)throw new AppError("CONFLICT","通知已更新，請重新確認");
   await recordOperationAudit({actorUserId:user.id,actorNameSnapshot:user.name,storeId:d.storeId,module:"STEAM",targetType:digital?"DigitalManagerNotice":"SteamfootStoreNotice",targetId:actualId,action:d.handled?"HANDLE_NOTICE":"REOPEN_NOTICE",summary:d.handled?"標記門市訊息已讀":"恢復門市訊息未讀"},tx);
   return {...saved,id:digital?`digital:${saved.id}`:saved.id,handledAt:saved.handledAt?.toISOString()??null};
  });
  return {success:true,storeId:d.storeId,data};
 }catch(e){const r=handleActionError(e);return {success:false,error:r.success?"操作失敗":r.error};}
}
export async function saveSteamfootNoticeSetting(input:unknown) {
 try {
  const d=z.object({storeId:id,enabled:z.boolean(),previous:z.boolean()}).parse(input);
  await scope(d.storeId,"business_hours.manage");
  throw new AppError("VALIDATION","門市通知持續接收；提示音可在小鈴噹內調整");
 }catch(e){return handleActionError(e);}
}

/** Marks all pages in this store together; leaves bookings and delivery settings intact. */
export async function markAllSteamfootStoreNotices(input:unknown) {
 try {
 const d=z.object({storeId:id}).parse(input);const window=noticeWindow(false);
 const user=await scope(d.storeId,"booking.update");
 const count=await prisma.$transaction(async tx=>{
 await tx.$queryRaw`SELECT id FROM public."Store" WHERE id=${d.storeId} FOR UPDATE`;
 const rows0=await tx.$executeRaw`UPDATE public."SteamfootStoreNotice" SET "readAt"=now(),"readById"=${user.id},"readByName"=${user.name??"門市人員"},revision=revision+1,"updatedAt"=now() WHERE "storeId"=${d.storeId} AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}`;
 const rows1=await tx.$executeRaw`UPDATE public."DigitalManagerNotice" SET "readAt"=now(),"readById"=${user.id},"readByName"=${user.name??"門市人員"},revision=revision+1,"updatedAt"=now() WHERE "storeId"=${d.storeId} AND ("eventType" IN ('DIGITAL_BUTLER_LEAD_CREATED','HUMAN_SUPPORT_REQUESTED','HUMAN_SUPPORT_FINAL_REMINDER','VIP_INTEREST','INCOMPLETE_SERVICE_REMINDER','DAILY_ACTION_DIGEST') OR ("eventType"='TRANSFER_PENDING_CONFIRMATION' AND "eventKey" LIKE 'pending-payment:%')) AND "readAt" IS NULL AND "publishedAt">${window.retainedAfter} AND "publishedAt"<=${window.now}`;
 await recordOperationAudit({actorUserId:user.id,actorNameSnapshot:user.name,storeId:d.storeId,module:"STEAM",targetType:"SteamfootStoreNotice",targetId:d.storeId,action:"HANDLE_ALL_NOTICES",summary:"全部標為已讀"},tx);
 return rows0+rows1;
 });
 return {success:true as const,storeId:d.storeId,count};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"操作失敗":r.error};}
}
