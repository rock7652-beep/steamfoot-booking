import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { readTrialCareRules, renderTrialCareBody, trialCareDueAt, trialCareSkipReason, TRIAL_CARE_LABELS } from "@/lib/trial-care";
import { courseMemberNotificationUrl, deriveCourseBaseUrl } from "./course-delivery-links";
import { deliverCourseCardNotification } from "./course-card-notification-delivery";
import { LINE_CARD_COLORS, LINE_CARD_STYLES } from "@/lib/line-card-theme";
import type { LineMessage } from "@/lib/line";

export function courseTrialCareMessages(body:string,stage:number,slug:string):LineMessage[] {
  return [{type:"flex",altText:TRIAL_CARE_LABELS[stage],contents:{type:"bubble",styles:LINE_CARD_STYLES,body:{type:"box",layout:"vertical",contents:[{type:"text",text:body,wrap:true}]},footer:{type:"box",layout:"vertical",contents:[
    {type:"button",style:"primary",color:LINE_CARD_COLORS.primary,action:{type:"uri",label:"查看本店方案",uri:courseMemberNotificationUrl(slug,"shop",undefined,"book").toString()}},
    {type:"button",style:"link",action:{type:"uri",label:"不再接收此類訊息",uri:new URL(`/s/${encodeURIComponent(slug)}/book/reminders`,deriveCourseBaseUrl()).toString()}},
  ]}}}];
}
/** Explicit completion audit markers enroll future attended trials only; no historic backfill. */
export async function runCourseTrialCare(now=new Date()) {
  const result={sent:0,skipped:0,failed:0};
  if(process.env.VERCEL_ENV!=="production")return result;
  const settings=await prisma.trialCareSetting.findMany({where:{enabled:true,activatedAt:{not:null},store:{industryModule:"COURSE",operatingStatus:"ACTIVE",isDemo:false}},include:{store:true}});
  for(const setting of settings) {
    try {
      if(!(await hasStoreFeature(setting.storeId,FEATURES.LINE_REMINDER)))continue;
      const rules=readTrialCareRules(setting.rules);
      const rows=await prisma.$queryRaw<Array<{id:string;customerId:string;completedAt:Date}>>`
        SELECT b.id,b."customerId",GREATEST(a."createdAt",s."endsAt") AS "completedAt" FROM "AuditLog" a
        JOIN "CourseBooking" b ON b.id=a."targetId" AND b."storeId"=a."storeId"
        JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId"
        WHERE a.module='COURSE' AND a.action='COURSE_TRIAL_CARE_COMPLETED' AND a."storeId"=${setting.storeId}
        AND a."createdAt">=${setting.activatedAt} AND s."startsAt">=${dayRange(toLocalDateStr(setting.activatedAt!)).start}
        AND s."endsAt"<=${now} AND s."cancelledAt" IS NULL AND b."bookingKind"='TRIAL' AND b.status='ATTENDED' AND b."customerId" IS NOT NULL
        ORDER BY "completedAt", b.id`;
      const seen=new Set<string>();
      for(const row of rows) {
        if(seen.has(row.customerId))continue;seen.add(row.customerId);
        for(const [stage,rule] of rules.entries()) {
          const dueAt=trialCareDueAt(row.completedAt,rule);if(dueAt>now)continue;
          const key={storeId:setting.storeId,customerId:row.customerId,stage};
          const hash=createHash("sha256").update(`course-trial-care:${key.storeId}:${key.customerId}:${stage}`).digest("hex"),id=`course-trial-care:${hash}`;
          const retryKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
          const status=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${setting.storeId} FOR UPDATE`;
            if(await tx.trialCareLog.findUnique({where:{storeId_customerId_stage:key}}))return "SKIPPED";
            const [current,person,pref,booking,purchased,pendingPayment,booked]=await Promise.all([
              tx.trialCareSetting.findUnique({where:{storeId:key.storeId}}),
              tx.customer.findFirst({where:{id:row.customerId,storeId:key.storeId,mergedIntoCustomerId:null,NOT:{user:{is:{status:"SUSPENDED"}}}},select:{id:true,name:true,lineUserId:true,lineLinkStatus:true}}),
              tx.trialCarePreference.upsert({where:{storeId_customerId:{storeId:key.storeId,customerId:key.customerId}},create:{storeId:key.storeId,customerId:key.customerId,token:randomBytes(24).toString("hex")},update:{}}),
              coursePrisma.courseBooking.findFirst({where:{id:row.id,storeId:key.storeId,customerId:key.customerId,bookingKind:"TRIAL",status:"ATTENDED"}}),
              coursePrisma.courseCardMember.count({where:{storeId:key.storeId,customerId:key.customerId}}),
              coursePrisma.coursePurchase.count({where:{storeId:key.storeId,customerId:key.customerId,status:"PENDING"}}),
              coursePrisma.courseBooking.count({where:{storeId:key.storeId,customerId:key.customerId,status:"RESERVED",session:{startsAt:{gte:now},cancelledAt:null}}}),
            ]);
            if(!current?.enabled || current.updatedAt.getTime()!==setting.updatedAt.getTime() || !person || !booking)return "SKIPPED";
            const sentToday=await tx.trialCareLog.count({where:{storeId:key.storeId,customerId:key.customerId,status:{in:["SENT","SENDING"]},createdAt:{gte:dayRange(toLocalDateStr(now)).start,lte:dayRange(toLocalDateStr(now)).end}}});
            const reason=trialCareSkipReason({now,dueAt,updatedAt:current.updatedAt,enabled:rule.enabled,stopped:!!pref.stoppedAt,stage,purchased:purchased>0,pendingPayment:pendingPayment>0,booked:booked>0,alreadySentToday:sentToday>0});
            const body=renderTrialCareBody(rule.body,person.name,setting.store.name);
            await tx.trialCareLog.create({data:{...key,module:"COURSE",bookingId:row.id,dueAt,status:reason?"SKIPPED":"SENDING",body,reason}});
            if(reason)return "SKIPPED";
            await tx.messageLog.upsert({where:{id},create:{id,storeId:key.storeId,customerId:key.customerId,courseBookingId:row.id,channel:"LINE",status:"PENDING",renderedBody:body},update:{}});
            const delivered=await deliverCourseCardNotification(tx,{id,storeId:key.storeId,person,messages:courseTrialCareMessages(body,stage,setting.store.slug),retryKey,now});
            await tx.trialCareLog.update({where:{storeId_customerId_stage:key},data:{status:delivered,sentAt:delivered==="SENT"?now:null,reason:delivered==="SENT"?null:"請查看發送紀錄；不自動補發"}});
            return delivered;
          },{timeout:25000});
          if(status==="SENT")result.sent++;else if(status==="FAILED")result.failed++;else result.skipped++;
        }
      }
    }catch{console.error("[Course trial care] delivery unconfirmed",{storeId:setting.storeId});result.failed++;}
  }
  return result;
}
