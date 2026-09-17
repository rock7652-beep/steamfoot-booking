import "server-only";
import {createHash} from "node:crypto";
import {prisma} from "@/lib/db";
import {coursePrisma} from "@/lib/course-db";
import {addTaiwanDuration,dayRange,monthRange,toLocalDateStr,toLocalMonthStr} from "@/lib/date-utils";
import {courseExpirySettingId} from "@/lib/course-expiry-reminder";
import {hasStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {deriveBaseUrl} from "@/lib/base-url";
import {isPreviewExternalIntegrationBlocked} from "@/lib/runtime-env";
import {getStoreForPlanByStoreId} from "@/lib/store-plan";
import {checkReminderSendLimit} from "@/lib/usage-gate";
import {pushMessage,pushSteamButlerMessage} from "@/lib/line";
import {buildPlanExpiryLineMessages} from "./plan-expiry-notifications";
import {resolveCentralLineRecipientForCustomer} from "./central-line-recipient-loader";
import {resolveVerifiedReminderLineRoute} from "./verified-reminder-line-route";

export async function getCourseExpiryCandidates(storeId:string,now=new Date()) {
  if(!(await prisma.store.findFirst({where:{id:storeId,industryModule:"COURSE"},select:{id:true}}))) return [];
  const dates=([14,7] as const).map(days=>({days,date:addTaiwanDuration(toLocalDateStr(now),days,"DAY")}));
  const cards=await coursePrisma.coursePointCard.findMany({where:{storeId,closedAt:null,remaining:{gt:0},OR:dates.map(d=>({expiresAt:{gte:dayRange(d.date).start,lte:dayRange(d.date).end}}))},include:{members:true,bookings:{where:{storeId,status:"RESERVED"},select:{pointCost:true}}}});
  return cards.flatMap(card=>{
    const phase=dates.find(d=>d.date===toLocalDateStr(card.expiresAt));
    const held=card.bookings.reduce((n,b)=>n+b.pointCost,0);
    return phase&&card.remaining>held?[{card,held,...phase}]:[];
  });
}

export async function runCourseExpiryReminders(now=new Date(),onlyStoreId?:string) {
  const summary={total:0,sent:0,skipped:0,failed:0};
  const settings=await prisma.messageTemplate.findMany({where:{id:{startsWith:"course-expiry-reminder-enabled:"},body:"enabled",...(onlyStoreId?{storeId:onlyStoreId}:{}),store:{industryModule:"COURSE"}},include:{store:{select:{id:true,slug:true}}}});
  for(const setting of settings) {
    const store=setting.store;
    if(!store || setting.id!==courseExpirySettingId(store.id) || !(await hasStoreFeature(store.id,FEATURES.LINE_REMINDER))) continue;
    const plan=await getStoreForPlanByStoreId(store.id);
    for(const candidate of await getCourseExpiryCandidates(store.id,now)) {
      const people=await prisma.customer.findMany({where:{storeId:store.id,id:{in:candidate.card.members.map(m=>m.customerId)},mergedIntoCustomerId:null},select:{id:true,name:true,lineUserId:true,lineLinkStatus:true}});
      for(const person of people) {
        summary.total++;
        const hash=createHash("sha256").update(`${store.id}:${candidate.card.id}:${person.id}:${candidate.date}:${candidate.days}`).digest("hex");
        const id=`course-expiry:${hash}`;
        const key=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
        try {
          const status=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${store.id} FOR UPDATE`;
            if(!(await tx.messageTemplate.findFirst({where:{id:setting.id,storeId:store.id,body:"enabled"}}))) return "SKIPPED";
            if((await tx.messageLog.findUnique({where:{id}}))?.status==="SENT") return "SKIPPED";
            const current=await tx.$queryRaw<Array<{remaining:number;held:number}>>`SELECT c.remaining,COALESCE((SELECT SUM(b."pointCost") FROM "CourseBooking" b WHERE b."storeId"=c."storeId" AND b."cardId"=c.id AND b.status='RESERVED'),0)::int AS held FROM "CoursePointCard" c WHERE c.id=${candidate.card.id} AND c."storeId"=${store.id} AND c."closedAt" IS NULL AND c."expiresAt"=${candidate.card.expiresAt} AND EXISTS(SELECT 1 FROM "CourseCardMember" m WHERE m."cardId"=c.id AND m."storeId"=c."storeId" AND m."customerId"=${person.id})`;
            if(!current[0] || current[0].remaining<=current[0].held) return "SKIPPED";
            const url=new URL(`/s/${encodeURIComponent(store.slug)}`,deriveBaseUrl());url.searchParams.set("view","plans");
            const messages=buildPlanExpiryLineMessages({customerName:person.name,planName:candidate.card.nameSnapshot,remainingSessions:current[0].remaining-current[0].held,expiryDate:new Date(candidate.date+"T00:00:00Z"),daysUntilExpiry:candidate.days,storeSlug:store.slug,course:{unit:candidate.card.unit==="SESSION"?"SESSION":"POINT",remaining:current[0].remaining,held:current[0].held,url:url.toString()}});
            await tx.messageLog.upsert({where:{id},create:{id,templateId:setting.id,storeId:store.id,customerId:person.id,courseCardId:candidate.card.id,channel:"LINE",status:"PENDING",renderedBody:messages[0].altText},update:{status:"PENDING",errorMessage:null}});
            const skip=async(reason:string)=>{await tx.messageLog.update({where:{id},data:{status:"SKIPPED",errorMessage:reason}});return "SKIPPED";};
            if(isPreviewExternalIntegrationBlocked()) return skip("隔離預覽未向外發送；不代表 LINE 送達");
            const range=monthRange(toLocalMonthStr(now));
            const count=await tx.messageLog.count({where:{storeId:store.id,status:"SENT",sentAt:{gte:range.start,lte:range.end}}});
            if(!checkReminderSendLimit(plan,count).allowed) return skip("已達本月提醒額度");
            const recipient=await resolveCentralLineRecipientForCustomer(person.id,store.id);
            const route=await resolveVerifiedReminderLineRoute(store.id,person.lineLinkStatus==="LINKED"?person.lineUserId:null,recipient);
            if(route.status==="BLOCKED") return skip(`LINE 身分未確認：${route.reason}`);
            const sent=route.channel==="STORE"?await pushMessage(store.id,route.recipientLineUserId,messages,key):await pushSteamButlerMessage(route.recipientLineUserId,messages,key);
            await tx.messageLog.update({where:{id},data:{status:sent.success?"SENT":"FAILED",lineRoute:route.channel,sentAt:sent.success?now:null,errorMessage:sent.success?null:sent.error}});
            return sent.success?"SENT":"FAILED";
          },{timeout:25000});
          if(status==="SENT")summary.sent++;else if(status==="FAILED")summary.failed++;else summary.skipped++;
        } catch {
          summary.failed++;
          try {
            await prisma.messageLog.upsert({where:{id},create:{id,templateId:setting.id,storeId:store.id,customerId:person.id,courseCardId:candidate.card.id,channel:"LINE",status:"FAILED",renderedBody:"課程方案到期提醒",errorMessage:"發送結果未確認，重試沿用同一發送識別碼"},update:{}});
            await prisma.messageLog.updateMany({where:{id,storeId:store.id,status:{not:"SENT"}},data:{status:"FAILED",errorMessage:"發送結果未確認，重試沿用同一發送識別碼"}});
          } catch { /* Preserve the cron failure count if the database is unavailable. */ }
          console.error("[Course expiry] delivery result unconfirmed",{storeId:store.id,cardId:candidate.card.id});
        }
      }
    }
  }
  return summary;
}
