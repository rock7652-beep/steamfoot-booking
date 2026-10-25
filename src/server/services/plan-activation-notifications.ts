import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { pushMessage, pushSteamButlerMessage } from "@/lib/line";
import { getConfiguredStoreLine } from "@/lib/store-line-config";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { checkReminderSendLimit } from "@/lib/reminder-send-limit";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import { resolveCentralLineRecipientForCustomer } from "./central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "./verified-reminder-line-route";
import { getPlanActivationEnabled } from "./plan-activation-enqueue";
import { planActivationEnabled, planActivationSettingId, PLAN_ACTIVATION_TEMPLATE, type PlanActivationSnapshot } from "@/lib/plan-activation-notification";
import { buildPlanActivationCard } from "@/lib/plan-activation-card";

type Route = {channel:"STORE"|"CENTRAL";recipient:string;destination:string|null;messageFormat?:"flex-v1"};
type Event = {
  id:string;storeId:string;customerId:string;module:"STEAMFOOT"|"COURSE"|"BEAUTY";
  sourceId:string;entitlementId:string;snapshot:PlanActivationSnapshot;body:string;status:string;
  errorMessage:string|null;retryKey:string;route:Route|null;attempts:number;
  createdAt:Date;nextAttemptAt:Date;loggedAt:Date|null;lastAttemptAt:Date|null;
};
type SourceDb = Pick<typeof prisma,"$queryRaw"|"$executeRaw">;
async function sourceValid(db: SourceDb, e: Event) {
  if(e.module==="STEAMFOOT") return (await db.$queryRaw<Array<{id:string}>>`
    SELECT t.id FROM "Transaction" t
    JOIN "CustomerPlanWallet" w ON w.id=t."customerPlanWalletId" AND w."storeId"=t."storeId"
    WHERE t.id=${e.sourceId} AND t."storeId"=${e.storeId} AND t."customerId"=${e.customerId}
    AND w.id=${e.entitlementId} AND w.status::text='ACTIVE' AND t.status::text='SUCCESS'
    AND t."paymentStatus"::text IN ('SUCCESS','CONFIRMED') AND t."refundAmount"=0`).length===1;
  if(e.module==="COURSE") return (await db.$queryRaw<Array<{id:string}>>`
    SELECT p.id FROM "CoursePurchase" p
    JOIN "CoursePointCard" c ON c.id=p."cardId" AND c."storeId"=p."storeId"
    WHERE p.id=${e.sourceId} AND p."storeId"=${e.storeId} AND p."customerId"=${e.customerId}
    AND c.id=${e.entitlementId} AND p.status='CONFIRMED' AND p."voidedAt" IS NULL AND c."closedAt" IS NULL`).length===1;
  return (await db.$queryRaw<Array<{id:string}>>`
    SELECT c.id FROM "BeautyCard" c WHERE c.id=${e.entitlementId} AND c."storeId"=${e.storeId}
    AND c."customerId"=${e.customerId} AND c."closedAt" IS NULL
    AND EXISTS (SELECT 1 FROM "BeautyPayment" p WHERE p.id=${e.sourceId} AND p."storeId"=c."storeId" AND p."cardId"=c.id AND p.kind='SALE')
    AND NOT EXISTS (SELECT 1 FROM "BeautyTransactionRevision" r WHERE r."storeId"=c."storeId" AND r."transactionId"=${e.sourceId} AND r."voidedAt" IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM "BeautyPayment" r WHERE r."storeId"=c."storeId" AND r."originalPaymentId"=${e.sourceId} AND r.kind='REFUND')`).length===1;
}
async function writeLog(tx: Prisma.TransactionClient, e: Event, status: "PENDING"|"SENT"|"SKIPPED"|"FAILED", reason: string|null = null) {
  const templateId=planActivationSettingId(e.storeId);
  await tx.messageTemplate.upsert({where:{id:templateId},create:{id:templateId,storeId:e.storeId,name:PLAN_ACTIVATION_TEMPLATE,body:"enabled"},update:{}});
  const data={status,errorMessage:reason,lineRoute:e.route?.channel??null,sentAt:status==="SENT"?new Date():null};
  await tx.messageLog.upsert({where:{id:`plan-activation:${e.id}`},create:{id:`plan-activation:${e.id}`,storeId:e.storeId,customerId:e.customerId,templateId,renderedBody:e.body,...data},update:data});
}
function sameRoute(a:Route,b:Route) {
  return a.channel===b.channel&&a.recipient===b.recipient&&a.destination===b.destination;
}
async function eligibility(db:SourceDb,e:Event):Promise<string|null> {
  if(isPreviewExternalIntegrationBlocked())return "隔離預覽不向外發送 LINE";
  if(e.module==="BEAUTY"&&(process.env.BEAUTY_MODULE_ENABLED!=="1"||process.env.BEAUTY_NOTIFICATIONS_ENABLED!=="1"))return "美業通知未開啟";
  const store=await prisma.store.findFirst({where:{id:e.storeId,industryModule:e.module,archivedAt:null,isDemo:false,operatingStatus:{in:["ACTIVE","TRIAL"]}},select:{id:true}});
  if(!store||!await getPlanActivationEnabled(e.storeId)||!await hasStoreFeature(e.storeId,FEATURES.LINE_REMINDER))return "門市、通知開關或 LINE 功能已停用";
  if(!await sourceValid(db,e))return "原購買或方案已作廢、退款或結清";
  return null;
}
async function dispatch(db:SourceDb,candidate:Event) {
  // Atomic five-minute lease; LINE calls time out after eight seconds. Crashes
  // retain the original key, route and payload (LINE deduplicates for 24 hours).
  const [e]=await db.$queryRaw<Event[]>`
    UPDATE "PlanActivationNotification" SET "attempts"="attempts"+1,"nextAttemptAt"=NOW()+interval '5 minutes'
    WHERE id=${candidate.id} AND "nextAttemptAt"<=NOW()
    AND (status IN ('PENDING','FAILED') OR (status='SKIPPED' AND "loggedAt" IS NULL)) RETURNING *`;
  if(!e)return;
  const previousLog=await prisma.messageLog.findUnique({where:{id:`plan-activation:${e.id}`},select:{status:true}});
  if(previousLog?.status==="SENT"){
    await db.$executeRaw`UPDATE "PlanActivationNotification" SET status='SENT',"errorMessage"=NULL,"loggedAt"=NOW() WHERE id=${e.id}`;
    return;
  }
  const finish=async(reason:string)=>{
    const uncertain=!!e.lastAttemptAt&&previousLog?.status==="PENDING";
    await prisma.$transaction(tx=>writeLog(tx,e,uncertain?"PENDING":"SKIPPED",uncertain?`${reason}；先前 LINE 嘗試結果未確認`:reason));
    await db.$executeRaw`UPDATE "PlanActivationNotification" SET status='SKIPPED',"errorMessage"=${reason},"loggedAt"=NOW() WHERE id=${e.id}`;
  };
  if(e.status==="SKIPPED"){await finish(e.errorMessage??"未發送");return;}
  if(Date.now()-e.createdAt.getTime()>=23*60*60_000||e.attempts>5){await finish("已超過安全重試期限或次數，停止補送；先前結果請查發送紀錄");return;}
  const reason=await eligibility(db,e);
  if(reason){await finish(reason);return;}
  const person=await prisma.customer.findFirst({where:{id:e.customerId,storeId:e.storeId,mergedIntoCustomerId:null,lineLinkStatus:{not:"BLOCKED"}},select:{id:true,lineUserId:true,lineLinkStatus:true}});
  if(!person){await finish("購買人身分已變更或封鎖 LINE");return;}
  const central=await resolveCentralLineRecipientForCustomer(person.id,e.storeId);
  const resolved=await resolveVerifiedReminderLineRoute(e.storeId,person.lineLinkStatus==="LINKED"?person.lineUserId:null,central,person.id);
  if(resolved.status==="BLOCKED"){
    if(resolved.reason.includes("unavailable"))throw new Error("LINE verification temporarily unavailable");
    await finish(`LINE 身分未確認：${resolved.reason}`);return;
  }
  const route:Route={channel:resolved.channel,recipient:resolved.recipientLineUserId,destination:getConfiguredStoreLine(e.storeId)?.destination??null,messageFormat:"flex-v1"};
  if(e.route&&!sameRoute(e.route,route)){await finish("LINE 身分或通道已變更，停止補送");return;}
  if(!e.route){
    // Commit before any push; never change recipient/payload after ambiguity.
    await db.$executeRaw`UPDATE "PlanActivationNotification" SET route=${JSON.stringify(route)}::jsonb WHERE id=${e.id}`;
    e.route=route;
  }
  const plan=await getStoreForPlanByStoreId(e.storeId);
  const reserved=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${e.storeId} FOR UPDATE`;
    const setting=await tx.messageTemplate.findUnique({where:{id:planActivationSettingId(e.storeId)},select:{body:true}});
    if(!planActivationEnabled(setting?.body))return false;
    const range=monthRange(toLocalMonthStr(new Date()));
    const usage=await tx.messageLog.count({where:{storeId:e.storeId,id:{not:`plan-activation:${e.id}`},OR:[{status:"SENT",sentAt:{gte:range.start,lte:range.end}},{status:"PENDING",createdAt:{gte:range.start,lte:range.end}}]}});
    if(!checkReminderSendLimit(plan,usage).allowed)return false;
    await writeLog(tx,e,"PENDING");
    return true;
  });
  if(!reserved){await finish("通知已關閉或已達本月 LINE 提醒額度");return;}
  // Last decision before LINE hand-off. An accepted request cannot be recalled
  // by a later refund, opt-out or identity change.
  const freshReason=await eligibility(db,e);
  if(freshReason){await finish(freshReason);return;}
  // Serialize the final decision with switching this notification off. Keep the
  // attempt marker durable even if the process stops after LINE accepts it.
  const prepared=await db.$executeRaw`UPDATE "PlanActivationNotification" SET "lastAttemptAt"=NOW() WHERE id=${e.id} AND status IN ('PENDING','FAILED')`;
  if(!prepared)return;
  // Old in-flight routes retain text; never change the payload behind a LINE retry key.
  const messages=e.route.messageFormat==="flex-v1"?[buildPlanActivationCard(e.snapshot)]:[{type:"text" as const,text:e.body}];
  const result=route.channel==="STORE"
    ?await pushMessage(e.storeId,route.recipient,messages,e.retryKey)
    :await pushSteamButlerMessage(route.recipient,messages,e.retryKey);
  const status=result.success?"SENT":"FAILED";
  // Keep an uncertain send's quota reservation; retries use the frozen payload.
  await prisma.$transaction(tx=>writeLog(tx,e,result.success?"SENT":result.httpStatus?"FAILED":"PENDING",result.success?null:result.error??"LINE 未接受或結果不確定"));
  await db.$executeRaw`UPDATE "PlanActivationNotification"
    SET status=CASE WHEN status='SKIPPED' AND ${!result.success} THEN status ELSE ${status} END,
      "errorMessage"=CASE WHEN status='SKIPPED' AND ${!result.success} THEN "errorMessage" ELSE ${result.success?null:result.error??"結果不確定"} END,
      "loggedAt"=NOW() WHERE id=${e.id}`;
  return status;
}
export async function runPlanActivationNotifications(storeId?:string, beauty=false) {
  const deadline=Date.now()+20_000;
  const db:SourceDb=beauty?(await import("@/lib/beauty-db")).beautyPrisma:prisma;
  const rows=beauty ? await db.$queryRaw<Event[]>`
    SELECT * FROM "PlanActivationNotification" WHERE module='BEAUTY'
    AND (${storeId??null}::text IS NULL OR "storeId"=${storeId??null}) AND "nextAttemptAt"<=NOW()
    AND (status IN ('PENDING','FAILED') OR (status='SKIPPED' AND "loggedAt" IS NULL)) ORDER BY "createdAt" LIMIT 50` :
    await db.$queryRaw<Event[]>`
    SELECT * FROM "PlanActivationNotification" WHERE module IN ('STEAMFOOT','COURSE')
    AND (${storeId??null}::text IS NULL OR "storeId"=${storeId??null}) AND "nextAttemptAt"<=NOW()
    AND (status IN ('PENDING','FAILED') OR (status='SKIPPED' AND "loggedAt" IS NULL)) ORDER BY "createdAt" LIMIT 50`;
  let failed=0,processed=0;
  for(const candidate of rows) {
    if(Date.now()>=deadline)break;
    processed++;
    try {if(await dispatch(db,candidate)==="FAILED")failed++;}
    catch {
      failed++;
      await db.$executeRaw`UPDATE "PlanActivationNotification" SET status='FAILED',"errorMessage"='派送未完成，保留原事件重試' WHERE id=${candidate.id} AND status IN ('PENDING','FAILED')`.catch(()=>undefined);
      console.error("[plan-activation] event deferred",{id:candidate.id});
    }
  }
  return {processed,failed};
}
