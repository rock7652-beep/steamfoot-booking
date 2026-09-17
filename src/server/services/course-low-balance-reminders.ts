import "server-only";
import { courseReminderAlreadySent } from "./course-reminder-merge-dedupe";
import {createHash,randomUUID} from "node:crypto";
import {prisma} from "@/lib/db";
import {coursePrisma} from "@/lib/course-db";
import {courseCardIsLow,courseLowBalanceBody} from "@/lib/course-low-balance";
import {hasStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {deriveBaseUrl} from "@/lib/base-url";
import {LINE_CARD_COLORS,LINE_CARD_STYLES} from "@/lib/line-card-theme";
import type {LineMessage} from "@/lib/line";
import {deliverCourseCardNotification} from "./course-card-notification-delivery";

export function courseLowBalanceMessages(body:string,slug:string):LineMessage[] {
  const url=new URL(`/s/${encodeURIComponent(slug)}/book`,deriveBaseUrl());url.searchParams.set("view","plans");
  const preferences=new URL(`/s/${encodeURIComponent(slug)}/book/reminders`,deriveBaseUrl());
  return [{type:"flex",altText:body,contents:{type:"bubble",styles:LINE_CARD_STYLES,
    body:{type:"box",layout:"vertical",spacing:"md",contents:[
      {type:"text",text:"蒸管家｜方案可用額度提醒",weight:"bold",color:LINE_CARD_COLORS.primary,wrap:true},
      {type:"text",text:body,wrap:true},
    ]},footer:{type:"box",layout:"vertical",contents:[
      {type:"button",style:"primary",color:LINE_CARD_COLORS.primary,action:{type:"uri",label:"查看我的方案",uri:url.toString()}},
      {type:"button",style:"link",action:{type:"uri",label:"停止／管理此類提醒",uri:preferences.toString()}},
    ]}}}];
}

/** Same once-per-card notification policy as the mature wallet reminder, never sum cards. */
export async function runCourseLowBalanceReminders(now=new Date(),onlyStoreId?:string,cardIds?:string[]) {
  const summary={total:0,sent:0,skipped:0,failed:0};
  const stores=await prisma.store.findMany({where:{industryModule:"COURSE",...(onlyStoreId?{id:onlyStoreId}: {})},select:{id:true,slug:true}});
  for(const store of stores) {
    if(!(await hasStoreFeature(store.id,FEATURES.LINE_REMINDER))) continue;
    const cards=await coursePrisma.coursePointCard.findMany({where:{storeId:store.id,...(cardIds?{id:{in:cardIds}}:{}),closedAt:null,expiresAt:{gt:now},plan:{lowBalanceEnabled:true,lowBalanceThreshold:{not:null}}},include:{plan:true,members:true,bookings:{where:{storeId:store.id,status:"RESERVED"},select:{pointCost:true}}}});
    for(const card of cards) {
      const held=card.bookings.reduce((n,b)=>n+b.pointCost,0);
      if(!courseCardIsLow({enabled:card.plan.lowBalanceEnabled,threshold:card.plan.lowBalanceThreshold,remaining:card.remaining,held,closed:!!card.closedAt,expiresAt:card.expiresAt},now)) continue;
      const people=await prisma.customer.findMany({where:{storeId:store.id,id:{in:card.members.map(m=>m.customerId)},mergedIntoCustomerId:null},select:{id:true,lineUserId:true,lineLinkStatus:true}});
      for(const person of people) {
        summary.total++;
        const hash=createHash("sha256").update(`course-low-balance:${store.id}:${card.id}:${person.id}`).digest("hex");
        const id=`course-low-balance:${hash}`,templateId=`course-low-balance:${store.id}`;
        const retryKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
        try {
          const status=await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${store.id} FOR UPDATE`;
            if(await courseReminderAlreadySent(tx,store.id,person.id,customerId=>`course-low-balance:${createHash("sha256").update(`course-low-balance:${store.id}:${card.id}:${customerId}`).digest("hex")}`)) return "SKIPPED";
            const current=await tx.$queryRaw<{remaining:number;held:number;unit:string;nameSnapshot:string}[]>`
              SELECT c.remaining,c.unit,c."nameSnapshot",COALESCE((SELECT SUM(b."pointCost") FROM "CourseBooking" b WHERE b."storeId"=c."storeId" AND b."cardId"=c.id AND b.status='RESERVED'),0)::int AS held
              FROM "CoursePointCard" c JOIN "CoursePointPlan" p ON p.id=c."planId" AND p."storeId"=c."storeId"
              WHERE c.id=${card.id} AND c."storeId"=${store.id} AND c."closedAt" IS NULL AND c."expiresAt">${now}
              AND p."lowBalanceEnabled" AND p."lowBalanceThreshold" IS NOT NULL
              AND c.remaining-COALESCE((SELECT SUM(b."pointCost") FROM "CourseBooking" b WHERE b."storeId"=c."storeId" AND b."cardId"=c.id AND b.status='RESERVED'),0)<=p."lowBalanceThreshold"
              AND EXISTS(SELECT 1 FROM "CourseCardMember" m WHERE m."cardId"=c.id AND m."storeId"=c."storeId" AND m."customerId"=${person.id})`;
            if(!current[0]) return "SKIPPED";
            const pref=await tx.$queryRaw<{stoppedAt:Date|null}[]>`
              INSERT INTO "CourseBalanceReminderPreference" (id,"storeId","customerId") VALUES (${randomUUID()},${store.id},${person.id})
              ON CONFLICT ("storeId","customerId") DO UPDATE SET "customerId"=EXCLUDED."customerId" RETURNING "stoppedAt"`;
            const body=courseLowBalanceBody(current[0].nameSnapshot,current[0].remaining,current[0].held,current[0].unit);
            await tx.messageTemplate.upsert({where:{id:templateId},create:{id:templateId,storeId:store.id,name:"課程低可用額度提醒",channel:"LINE",body:"每卡可用額度達門檻時提醒一次"},update:{}});
            await tx.messageLog.upsert({where:{id},create:{id,templateId,storeId:store.id,customerId:person.id,courseCardId:card.id,channel:"LINE",status:"PENDING",renderedBody:body},update:{status:"PENDING",renderedBody:body,errorMessage:null}});
            if(pref[0].stoppedAt) {await tx.messageLog.update({where:{id},data:{status:"SKIPPED",errorMessage:"顧客已停止接收此類訊息"}});return "SKIPPED";}
            return deliverCourseCardNotification(tx,{id,storeId:store.id,person,messages:courseLowBalanceMessages(body,store.slug),retryKey,now});
          },{timeout:25000});
          if(status==="SENT")summary.sent++;else if(status==="FAILED")summary.failed++;else summary.skipped++;
        } catch {
          summary.failed++;
          // Keep the stable key on retry; do not overwrite a concurrent successful send.
          try {
            await prisma.messageTemplate.upsert({where:{id:templateId},create:{id:templateId,storeId:store.id,name:"課程低可用額度提醒",channel:"LINE",body:"每卡可用額度達門檻時提醒一次"},update:{}});
            await prisma.messageLog.upsert({where:{id},create:{id,templateId,storeId:store.id,customerId:person.id,courseCardId:card.id,channel:"LINE",status:"FAILED",renderedBody:courseLowBalanceBody(card.nameSnapshot,card.remaining,held,card.unit),errorMessage:"發送結果未確認，重試使用同一識別碼"},update:{}});
            await prisma.messageLog.updateMany({where:{id,storeId:store.id,status:{not:"SENT"}},data:{status:"FAILED",errorMessage:"發送結果未確認，重試使用同一識別碼"}});
          } catch { /* The caller receives a failure count even when the database is unavailable. */ }
          console.error("[Course low balance] unconfirmed delivery",{storeId:store.id,cardId:card.id});
        }
      }
    }
  }
  return summary;
}
