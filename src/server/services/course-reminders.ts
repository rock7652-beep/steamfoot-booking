import { currentPreviewLineAcceptance, withAcceptanceRetryKey } from "@/lib/preview-line-acceptance";
import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { monthRange,toLocalMonthStr } from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { pushMessage,pushSteamButlerMessage } from "@/lib/line";
import { resolveCentralLineRecipientForCustomer } from "./central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "./verified-reminder-line-route";
import { buildPackageBookingReminderLineMessages, buildPackageBookingTestReminderLineMessages } from "./trial-booking-reminder-line-message";

import { COURSE_REMINDER_TRIGGER, COURSE_REMINDER_DEFAULT, getCourseReminderCandidates, prepareCourseReminderEvent, courseReminderRetryKey } from "./course-reminder-events";
export { COURSE_REMINDER_TRIGGER, COURSE_REMINDER_DEFAULT, courseReminderId, getCourseReminderCandidates } from "./course-reminder-events";

export async function runCourseReminders(now=new Date(),onlyStoreId?:string) {
 const acceptance=currentPreviewLineAcceptance();
 if(acceptance && onlyStoreId!==acceptance.storeId) throw new Error("驗收店家不匹配");
 const summary={total:0,sent:0,skipped:0,failed:0};
 const rules=await prisma.reminderRule.findMany({where:{triggerType:COURSE_REMINDER_TRIGGER,isEnabled:true,channel:"LINE",...(onlyStoreId?{storeId:onlyStoreId}:{}),store:{industryModule:"COURSE"}},include:{template:true}});
 for(const rule of rules) {
  if(!(await hasStoreFeature(rule.storeId,FEATURES.LINE_REMINDER))) continue;
  const map=await prisma.shopConfig.findUnique({where:{storeId:rule.storeId},select:{address:true,mapUrl:true}});
  const candidates=await getCourseReminderCandidates(rule.storeId,now),plan=await getStoreForPlanByStoreId(rule.storeId);
  for(const {booking,customer,store,date} of candidates) {
   if(acceptance && (booking.id!==acceptance.bookingId || customer.id!==acceptance.customerId)) continue;
   summary.total++;
   const {id,url,body,triggerAt,messageInput} = prepareCourseReminderEvent(
     {booking,customer,store,date}, rule.template?.body??COURSE_REMINDER_DEFAULT, now, map,
   );
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
     if(isPreviewExternalIntegrationBlocked() && !acceptance) return skip("隔離預覽未向外發送；此紀錄不代表 LINE 實機送達");
     const range=monthRange(toLocalMonthStr(now));
     const count=await tx.messageLog.count({where:{storeId:store.id,status:"SENT",sentAt:{gte:range.start,lte:range.end}}});
     if(!checkReminderSendLimit(plan,count).allowed) return skip("已達本月提醒額度");
     const recipient=await resolveCentralLineRecipientForCustomer(customer.id,store.id,tx);
     const route=await resolveVerifiedReminderLineRoute(store.id,customer.lineUserId,recipient,customer.id,tx);
     if(route.status==="BLOCKED") return skip(`LINE 身分或通道未確認：${route.reason}`);
     if(acceptance && (route.channel!=="STORE" || createHash("sha256").update(route.recipientLineUserId).digest("hex")!==acceptance.recipientHash)) return skip("驗收收件人或通道不匹配");
     const messages=(acceptance?buildPackageBookingTestReminderLineMessages:buildPackageBookingReminderLineMessages)(messageInput,url.toString(),booking.id);
     const deliver=()=>route.channel==="STORE"?pushMessage(store.id,route.recipientLineUserId,messages,courseReminderRetryKey(id)):pushSteamButlerMessage(route.recipientLineUserId,messages,courseReminderRetryKey(id));
     const sent=acceptance?await withAcceptanceRetryKey(courseReminderRetryKey(id),deliver):await deliver();
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
 if(acceptance) return summary;
 const {runCourseExpiryReminders}=await import("./course-expiry-reminders");
 const expiry=await runCourseExpiryReminders(now,onlyStoreId);
 return {total:summary.total+expiry.total,sent:summary.sent+expiry.sent,skipped:summary.skipped+expiry.skipped,failed:summary.failed+expiry.failed};
}
