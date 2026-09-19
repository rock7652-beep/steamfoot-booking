import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { addTaiwanDuration,dayRange,formatTWDateTime,monthRange,toLocalDateStr,toLocalMonthStr } from "@/lib/date-utils";
import { courseMemberNotificationUrl } from "./course-delivery-links";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { pushMessage,pushSteamButlerMessage } from "@/lib/line";
import { resolveCentralLineRecipientForCustomer } from "./central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "./verified-reminder-line-route";
import { buildPackageBookingReminderLineMessages } from "./trial-booking-reminder-line-message";

export const COURSE_REMINDER_TRIGGER="COURSE_NEXT_DAY";
export const COURSE_REMINDER_DEFAULT="請記得準時到課；如需取消，請依店家規則在會員專區逐位處理。";
export const courseReminderId=(storeId:string)=>`course-next-day:${storeId}`;
export async function getCourseReminderCandidates(storeId:string,now=new Date()) {
 const store=await prisma.store.findFirst({where:{id:storeId,industryModule:"COURSE"},select:{id:true,name:true,slug:true}});
 if(!store) throw new Error("此提醒僅適用本店課程");
 const date=addTaiwanDuration(toLocalDateStr(now),1,"DAY"),range=dayRange(date);
 const bookings=await coursePrisma.courseBooking.findMany({where:{storeId,status:"RESERVED",session:{storeId,cancelledAt:null,startsAt:{gte:range.start,lte:range.end}}},include:{session:true}});
 const customers=await prisma.customer.findMany({where:{storeId,id:{in:bookings.map(b=>b.customerId)},mergedIntoCustomerId:null},select:{id:true,name:true,lineUserId:true}});
 return bookings.flatMap(booking=>{const customer=customers.find(c=>c.id===booking.customerId);return customer?[{booking,customer,store,date}]:[];});
}
function retryKey(id:string) {
 const hex=createHash("sha256").update(id).digest("hex");
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export async function runCourseReminders(now=new Date(),onlyStoreId?:string) {
 const summary={total:0,sent:0,skipped:0,failed:0};
 const rules=await prisma.reminderRule.findMany({where:{triggerType:COURSE_REMINDER_TRIGGER,isEnabled:true,channel:"LINE",...(onlyStoreId?{storeId:onlyStoreId}:{}),store:{industryModule:"COURSE"}},include:{template:true}});
 for(const rule of rules) {
  if(!(await hasStoreFeature(rule.storeId,FEATURES.LINE_REMINDER))) continue;
  const candidates=await getCourseReminderCandidates(rule.storeId,now),plan=await getStoreForPlanByStoreId(rule.storeId);
  for(const {booking,customer,store,date} of candidates) {
   summary.total++;
   const id=`course-reminder:${createHash("sha256").update(`${store.id}:${booking.id}:${booking.session.startsAt.toISOString()}`).digest("hex")}`;
   const url=courseMemberNotificationUrl(store.slug,"bookings",date);
   const text=rule.template?.body??COURSE_REMINDER_DEFAULT;
   const body=`${customer.name}｜${formatTWDateTime(booking.session.startsAt)}｜${booking.session.nameSnapshot}\n${text}\n${url}`;
   const triggerAt=new Date(`${toLocalDateStr(now)}T18:00:00+08:00`);
   try {
    const status=await prisma.$transaction(async tx=>{
     // One delivery/quota claim at a time for a course store, including retries.
     await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${store.id} AND "industryModule"::text='COURSE' FOR UPDATE`;
     const currentRule=await tx.reminderRule.findFirst({where:{id:rule.id,storeId:store.id,isEnabled:true,triggerType:COURSE_REMINDER_TRIGGER}});
     if(!currentRule) return "SKIPPED" as const;
     const existing=await tx.messageLog.findUnique({where:{id}});
     if(existing?.status==="SENT") return "SKIPPED" as const;
     // Recheck cancellation after taking the store lock used by course mutations.
     const active=await tx.$queryRaw<Array<{id:string}>>`SELECT b.id FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId" WHERE b.id=${booking.id} AND b."storeId"=${store.id} AND b.status::text='RESERVED' AND s."cancelledAt" IS NULL AND s."startsAt"=${booking.session.startsAt}`;
     if(!active.length) return "SKIPPED" as const;
     await tx.messageLog.upsert({where:{id},create:{id,ruleId:rule.id,templateId:rule.templateId,customerId:customer.id,storeId:store.id,courseBookingId:booking.id,triggerAt,channel:"LINE",status:"PENDING",renderedBody:body},update:{status:"PENDING",errorMessage:null,renderedBody:body}});
     const skip=async(reason:string)=>{await tx.messageLog.update({where:{id},data:{status:"SKIPPED",errorMessage:reason}});return "SKIPPED" as const;};
     if(isPreviewExternalIntegrationBlocked()) return skip("隔離預覽未向外發送；此紀錄不代表 LINE 實機送達");
     const range=monthRange(toLocalMonthStr(now));
     const count=await tx.messageLog.count({where:{storeId:store.id,status:"SENT",sentAt:{gte:range.start,lte:range.end}}});
     if(!checkReminderSendLimit(plan,count).allowed) return skip("已達本月提醒額度");
     const recipient=await resolveCentralLineRecipientForCustomer(customer.id,store.id);
     const route=await resolveVerifiedReminderLineRoute(store.id,customer.lineUserId,recipient,customer.id);
     if(route.status==="BLOCKED") return skip(`LINE 身分或通道未確認：${route.reason}`);
     const messages=buildPackageBookingReminderLineMessages({customerName:customer.name,bookingDate:date,bookingTime:formatTWDateTime(booking.session.startsAt).slice(11),shopName:store.name,serviceName:booking.session.nameSnapshot,serviceDuration:`${Math.round((booking.session.endsAt.getTime()-booking.session.startsAt.getTime())/60000)} 分鐘`,reminderText:text,managementOnlyLabel:"會員專區／查看課程"},url.toString(),booking.id);
     const sent=route.channel==="STORE"?await pushMessage(store.id,route.recipientLineUserId,messages,retryKey(id)):await pushSteamButlerMessage(route.recipientLineUserId,messages,retryKey(id));
     await tx.messageLog.update({where:{id},data:{status:sent.success?"SENT":"FAILED",lineRoute:route.channel,sentAt:sent.success?now:null,errorMessage:sent.success?null:sent.error}});
     return sent.success?"SENT" as const:"FAILED" as const;
    },{timeout:25000});
    if(status==="SENT")summary.sent++;else if(status==="FAILED")summary.failed++;else summary.skipped++;
   } catch (error) {
    summary.failed++;
    // Transaction failure may follow an accepted LINE request. Preserve an audit
    // record without overwriting a concurrent SENT outcome; retry uses the same key.
    try {
     await prisma.messageLog.upsert({where:{id},create:{id,ruleId:rule.id,templateId:rule.templateId,customerId:customer.id,storeId:store.id,courseBookingId:booking.id,triggerAt,channel:"LINE",status:"FAILED",renderedBody:body,errorMessage:"發送結果未確認，重試將沿用同一發送識別碼"},update:{}});
     await prisma.messageLog.updateMany({where:{id,storeId:store.id,status:{not:"SENT"}},data:{status:"FAILED",errorMessage:"發送結果未確認，重試將沿用同一發送識別碼"}});
    } catch { /* DB unavailable: the cron aggregate and server log remain evidence. */ }
    console.error("[Course reminders] delivery failed", {storeId:store.id,bookingId:booking.id,error: error instanceof Error ? error.name : "Unknown"});
   }
  }
 }
 const {runCourseExpiryReminders}=await import("./course-expiry-reminders");
 const expiry=await runCourseExpiryReminders(now,onlyStoreId);
 return {total:summary.total+expiry.total,sent:summary.sent+expiry.sent,skipped:summary.skipped+expiry.skipped,failed:summary.failed+expiry.failed};
}
