import {beautyCareId} from '@/lib/beauty/care-id';
import {beautyNotificationDeliveryBlocked,beautyNotificationActivationAt} from '@/lib/beauty/notification-policy';
import {beautyWorkerLineAllowed} from './notification-worker-context';
import "server-only";
import type {Prisma} from "@prisma/client";
import {prisma} from "@/lib/db";
import {beautyPrisma} from "@/lib/beauty-db";
import {hasStoreFeature} from "@/lib/feature-gate";
import {FEATURES} from "@/lib/feature-flags";
import {dayRange,toLocalDateStr,parseTaipeiDateTime} from "@/lib/date-utils";
import {deriveBaseUrl} from "@/lib/base-url";
import {beautyPlanReminderKinds,beautyPlanPreferenceId,beautyPlanStopped} from "@/lib/beauty/reminders";
import {trialCareRulesSchema,trialCareDueAt,trialCareSkipReason,renderTrialCareBody,TRIAL_CARE_LABELS} from "@/lib/trial-care";
import {deliverCourseCardNotification} from "@/server/services/course-card-notification-delivery";
import {LINE_CARD_COLORS,LINE_CARD_STYLES} from "@/lib/line-card-theme";
import type {LineMessage} from "@/lib/line";

type Store={id:string;name:string;slug:string};
type Person={id:string;name:string;lineUserId:string|null;lineLinkStatus:string};
type Summary={sent:number;skipped:number;failed:number};
const nameFor=(kind:string)=>kind==="LOW_BALANCE"?"美業剩餘次數提醒":kind==="PLAN_USED_UP"?"美業方案用完提醒":kind.startsWith("PLAN_EXPIRY")?"美業方案到期提醒":TRIAL_CARE_LABELS[Number(kind.split(":")[1])];
export function beautyCareMessages(body:string,slug:string):LineMessage[] {
  const path=`/s/${encodeURIComponent(slug)}/beauty`;
  return [{type:"flex",altText:body.slice(0,350),contents:{type:"bubble",styles:LINE_CARD_STYLES,body:{type:"box",layout:"vertical",contents:[{type:"text",text:body,wrap:true}]},footer:{type:"box",layout:"vertical",contents:[
    {type:"button",style:"primary",color:LINE_CARD_COLORS.primary,action:{type:"uri",label:"查看我的方案",uri:new URL(path+"?view=plans",deriveBaseUrl()).toString()}},
    {type:"button",style:"link",action:{type:"uri",label:"停止／管理此類提醒",uri:new URL(path+"/reminders",deriveBaseUrl()).toString()}},
  ]}}}];
}
export {beautyCareId} from '@/lib/beauty/care-id';

async function lockStore(tx:Prisma.TransactionClient,storeId:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text='ACTIVE' AND "isDemo"=false FOR UPDATE`;
  return rows.length===1;
}
async function personFor(tx:Prisma.TransactionClient,storeId:string,customerId:string) {
  return tx.customer.findFirst({where:{id:customerId,storeId,mergedIntoCustomerId:null,lineLinkStatus:{not:"BLOCKED"},NOT:{user:{is:{status:"SUSPENDED"}}}},select:{id:true,name:true,lineUserId:true,lineLinkStatus:true}});
}
async function deliver(tx:Prisma.TransactionClient,store:Store,person:Person,id:string,kind:string,body:string,now:Date) {
  const templateId=`beauty-care-kind:${encodeURIComponent(store.id)}:${kind}`;
  await tx.messageTemplate.upsert({where:{id:templateId},create:{id:templateId,storeId:store.id,name:nameFor(kind),channel:"LINE",body:"美業通知紀錄類型"},update:{}});
  await tx.messageLog.create({data:{id,storeId:store.id,customerId:person.id,templateId,channel:"LINE",status:"PENDING",renderedBody:body}});
  const hash=id.slice("beauty-care:".length),retryKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  return deliverCourseCardNotification(tx,{id,storeId:store.id,person,messages:beautyCareMessages(body,store.slug),retryKey,now,transactionScoped:true});
}
async function failedReceipt(storeId:string,customerId:string,id:string) {
  // A result lost after transport must not become an automatic new delivery.
  await prisma.messageLog.upsert({where:{id},create:{id,storeId,customerId,channel:"LINE",status:"FAILED",renderedBody:"美業提醒發送結果未確認",errorMessage:"結果未確認，不自動補發；請人工核對"},update:{}}).catch(()=>{});
}
function count(result:Summary,status:string) {if(status==="SENT")result.sent++;else if(status==="FAILED")result.failed++;else result.skipped++;}

/** Authorized cron only. Preview / LINE-off returns before any data read or queue write. */
export async function runBeautyCareReminders(now=new Date()):Promise<Summary> {
  const result:Summary={sent:0,skipped:0,failed:0};
  if(beautyNotificationDeliveryBlocked())return result;
  const stores=await prisma.store.findMany({where:{industryModule:"BEAUTY",operatingStatus:"ACTIVE",isDemo:false},select:{id:true,name:true,slug:true}});
  for(const store of stores) {
    if(!await hasStoreFeature(store.id,FEATURES.LINE_REMINDER))continue;
    await runPlans(store,now,result);
    await runTrialCare(store,now,result);
  }
  return result;
}
async function runPlans(store:Store,now:Date,result:Summary) {
  const activatedAt=beautyNotificationActivationAt();
  const plans=await beautyPrisma.beautyPlan.findMany({where:{storeId:store.id,active:true}});
  const enabled=plans.filter(p=>p.lowBalanceEnabled||(p.expiryReminder as {enabled?:boolean})?.enabled===true);
  if(!enabled.length)return;
  const cards=await beautyPrisma.beautyCard.findMany({where:{storeId:store.id,planId:{in:enabled.map(p=>p.id)},closedAt:null,expiresAt:{gt:now}}});
  for(const candidate of cards) {
    const plan=enabled.find(p=>p.id===candidate.planId)!;
    const held=await beautyPrisma.beautyAppointment.count({where:{storeId:store.id,cardId:candidate.id,status:"RESERVED"}});
    for(const kind of beautyPlanReminderKinds(candidate,held,plan,now))for(const customerId of [...new Set(candidate.memberIds)]) {
      if(activatedAt&&kind.startsWith("PLAN_EXPIRY")&&parseTaipeiDateTime(toLocalDateStr(now),"18:00")!<activatedAt)continue;
      // Existing balances do not enroll on global enable. A new grant/use or
      // other ledger change after activation starts the current balance journey.
      if(activatedAt&&!kind.startsWith("PLAN_EXPIRY")&&!await beautyPrisma.beautyLedger.findFirst({where:{storeId:store.id,cardId:candidate.id,createdAt:{gte:activatedAt}},select:{id:true}}))continue;
      const id=beautyCareId(store.id,customerId,kind.startsWith("PLAN_EXPIRY")?`${candidate.id}:${toLocalDateStr(candidate.expiresAt)}`:candidate.id,kind);
      try {
        const status=await prisma.$transaction(async tx=>{
          if(!await lockStore(tx,store.id)||!await beautyWorkerLineAllowed(tx,store.id,now))return "SKIPPED";
          if(await tx.messageLog.findFirst({where:{id,storeId:store.id}}))return "SKIPPED";
          const [person,pref,card,currentPlan,currentHeld]=await Promise.all([
            personFor(tx,store.id,customerId),
            tx.messageTemplate.findFirst({where:{storeId:store.id,id:beautyPlanPreferenceId(store.id,customerId)},select:{body:true}}),
            beautyPrisma.beautyCard.findFirst({where:{id:candidate.id,storeId:store.id,memberIds:{has:customerId}}}),
            beautyPrisma.beautyPlan.findFirst({where:{id:plan.id,storeId:store.id}}),
            beautyPrisma.beautyAppointment.count({where:{storeId:store.id,cardId:candidate.id,status:"RESERVED"}}),
          ]);
          if(!person||beautyPlanStopped(pref?.body)||!card||!currentPlan||card.planId!==currentPlan.id||!beautyPlanReminderKinds(card,currentHeld,currentPlan,now).includes(kind))return "SKIPPED";
          if(kind.startsWith("PLAN_EXPIRY")&&toLocalDateStr(card.expiresAt)!==toLocalDateStr(candidate.expiresAt))return "SKIPPED";
          const body=`${person.name} 您好\n「${card.name}」剩餘 ${card.remaining} 次，預約占用 ${currentHeld} 次，可用 ${Math.max(0,card.remaining-currentHeld)} 次。`+(kind.startsWith("PLAN_EXPIRY")?`\n到期日：${toLocalDateStr(card.expiresAt)}`:kind==="PLAN_USED_UP"?"\n本方案已使用完畢。":"\n各張共用方案分開計算，預約占用尚未扣次。");
          return deliver(tx,store,person,id,kind,body,now);
        },{timeout:25000});
        count(result,status);
      }catch{result.failed++;await failedReceipt(store.id,customerId,id);}
    }
  }
}
async function runTrialCare(store:Store,now:Date,result:Summary) {
  const setting=await prisma.trialCareSetting.findUnique({where:{storeId:store.id}});
  const rules=trialCareRulesSchema.safeParse(setting?.rules);
  if(!setting?.enabled||!setting.activatedAt||!rules.success)return;
  const globalActivation=beautyNotificationActivationAt();
  const activatedAt=globalActivation&&globalActivation>setting.activatedAt?globalActivation:setting.activatedAt;
  // First completion markers are append-only. Restoring/re-completing cannot re-enroll history.
  const trials=await beautyPrisma.$queryRaw<Array<{id:string;customerId:string;completedAt:Date}>>`
    SELECT b.id,b."customerId",GREATEST(e."createdAt",b."endsAt") AS "completedAt"
    FROM "BeautyEvent" e JOIN "BeautyAppointment" b ON b.id=e."appointmentId" AND b."storeId"=e."storeId"
    WHERE e."storeId"=${store.id} AND e.kind='TRIAL_CARE_COMPLETED' AND e.status='AUDIT'
      AND e."createdAt">=${activatedAt}
      AND NOT EXISTS (SELECT 1 FROM "BeautyEvent" h WHERE h."storeId"=e."storeId" AND h."appointmentId"=b.id AND h.kind='COMPLETED' AND h."createdAt"<${setting.activatedAt})
      AND b."isTrial"=true AND b.status='COMPLETED' AND b."customerId" IS NOT NULL AND b."endsAt"<=${now}
    ORDER BY "completedAt",b.id`;
  const seen=new Set<string>();
  for(const trial of trials) {
    if(globalActivation&&trial.completedAt<globalActivation)continue;
    if(seen.has(trial.customerId))continue;seen.add(trial.customerId);
    for(const [stage,rule] of rules.data.entries()) {
      const dueAt=trialCareDueAt(trial.completedAt,rule);if(dueAt>now)continue;
      const key={storeId:store.id,customerId:trial.customerId,stage};
      const id=beautyCareId(store.id,trial.customerId,"trial-care",`TRIAL_CARE:${stage}`);
      try {
        const status=await prisma.$transaction(async tx=>{
          if(!await lockStore(tx,store.id)||!await beautyWorkerLineAllowed(tx,store.id,now))return "SKIPPED";
          if(await tx.trialCareLog.findUnique({where:{storeId_customerId_stage:key}})||await tx.messageLog.findFirst({where:{id,storeId:store.id}}))return "SKIPPED";
          const [current,person,pref,booking,purchased,pending,booked]=await Promise.all([
            tx.trialCareSetting.findUnique({where:{storeId:store.id}}),personFor(tx,store.id,trial.customerId),
            tx.trialCarePreference.findUnique({where:{storeId_customerId:{storeId:store.id,customerId:trial.customerId}}}),
            beautyPrisma.beautyAppointment.findFirst({where:{id:trial.id,storeId:store.id,customerId:trial.customerId,isTrial:true,status:"COMPLETED",endsAt:{lte:now}}}),
            beautyPrisma.beautyCard.count({where:{storeId:store.id,OR:[{customerId:trial.customerId},{memberIds:{has:trial.customerId}}]}}),
            beautyPrisma.beautyPurchase.count({where:{storeId:store.id,customerId:trial.customerId,status:"PENDING"}}),
            beautyPrisma.beautyAppointment.count({where:{storeId:store.id,customerId:trial.customerId,status:"RESERVED",startsAt:{gte:now}}}),
          ]);
          if(!current?.enabled||current.updatedAt.getTime()!==setting.updatedAt.getTime()||!person||!booking)return "SKIPPED";
          const today=dayRange(toLocalDateStr(now));
          const sentToday=await tx.trialCareLog.count({where:{storeId:store.id,customerId:trial.customerId,status:{in:["SENT","SENDING"]},createdAt:{gte:today.start,lte:today.end}}});
          const reason=trialCareSkipReason({now,dueAt,updatedAt:current.updatedAt,enabled:rule.enabled,stopped:!!pref?.stoppedAt,stage,purchased:purchased>0,pendingPayment:pending>0,booked:booked>0,alreadySentToday:sentToday>0});
          const body=renderTrialCareBody(rule.body,person.name,store.name);
          await tx.trialCareLog.create({data:{...key,module:"BEAUTY",bookingId:trial.id,dueAt,status:reason?"SKIPPED":"SENDING",body,reason}});
          if(reason)return "SKIPPED";
          const delivered=await deliver(tx,store,person,id,`TRIAL_CARE:${stage}`,body,now);
          await tx.trialCareLog.update({where:{storeId_customerId_stage:key},data:{status:delivered,sentAt:delivered==="SENT"?now:null,reason:delivered==="SENT"?null:"請查看發送紀錄；不自動補發"}});
          return delivered;
        },{timeout:25000});
        count(result,status);
      }catch{result.failed++;await failedReceipt(store.id,trial.customerId,id);}
    }
  }
}
