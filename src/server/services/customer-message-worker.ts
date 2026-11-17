import "server-only";
import { prisma } from "@/lib/db";
import { getLineBotInfo, pushMessage } from "@/lib/line";
import { isLineDeliveryEventCurrent } from "@/lib/line-delivery-pause";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { checkPermission } from "@/lib/permissions";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { checkReminderSendLimit } from "@/lib/reminder-send-limit";
import { getLineConfigForStore } from "@/lib/line-config";
import { getConfiguredStoreLine } from "@/lib/store-line-config";
import { readLineQuota } from "@/lib/line-quota";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
import { messageRetryAllowed } from "@/lib/customer-message";
import { customerMessageBlocker, customerMessageChannelKey, customerMessageRecipient, type MessageBatchRow } from "./customer-messages";
import { resolveVerifiedReminderLineRoute } from "./verified-reminder-line-route";

type Recipient = {id:string;batchId:string;storeId:string;customerId:string;lineUserId:string;status:string;retryKey:string;attempts:number;firstAttemptAt:Date|null;nextAttemptAt:Date};
type Claimed = {batch:MessageBatchRow;recipient:Recipient};
export type CustomerMessageWorkerDeps = {
  claim:()=>Promise<Claimed|null>;
  check:(event:Claimed)=>Promise<string|null>;
  reserve:(event:Claimed)=>Promise<boolean>;
  push:(event:Claimed)=>ReturnType<typeof pushMessage>;
  finish:(event:Claimed,status:string,reason:string|null)=>Promise<void>;
};
/** A batch lock serializes cancellation with claims. Leases outlive every bounded network call. */
export async function claimCustomerMessage(storeId?:string):Promise<Claimed|null> {
  return prisma.$transaction(async tx=>{
    const [batch]=await tx.$queryRaw<MessageBatchRow[]>`
      SELECT b.* FROM "CustomerMessageBatch" b
      WHERE b.status='QUEUED' AND b."scheduledAt"<=NOW()
      AND (${storeId??null}::text IS NULL OR b."storeId"=${storeId??null})
      AND EXISTS(SELECT 1 FROM "CustomerMessageRecipient" r WHERE r."batchId"=b.id AND r.status IN ('PENDING','SENDING') AND r."nextAttemptAt"<=NOW())
      ORDER BY b."scheduledAt",b.id FOR UPDATE SKIP LOCKED LIMIT 1`;
    if(!batch)return null;
    const [recipient]=await tx.$queryRaw<Recipient[]>`
      UPDATE "CustomerMessageRecipient" SET status='SENDING',"nextAttemptAt"=NOW()+interval '5 minutes',attempts=attempts+1
      WHERE id=(SELECT id FROM "CustomerMessageRecipient" WHERE "batchId"=${batch.id} AND status IN ('PENDING','SENDING') AND "nextAttemptAt"<=NOW() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    return recipient?{batch,recipient}:null;
  });
}
async function check(event:Claimed):Promise<string|null> {
  const {batch:b,recipient:r}=event;
  if(customerMessageBlocker(b.storeId))return customerMessageBlocker(b.storeId);
  if(!isLineDeliveryEventCurrent(b.confirmedAt??b.createdAt))return "停發期間的舊訊息不補發，請重新確認";
  if(customerMessageChannelKey(b.storeId)!==b.channelKey)return "本店 LINE 管道已變更，停止發送";
  const [store,actor]=await Promise.all([
    prisma.store.findFirst({where:{id:b.storeId,archivedAt:null,isDemo:false,operatingStatus:{in:["ACTIVE","TRIAL"]}},select:{id:true}}),
    prisma.user.findFirst({where:{id:b.createdById,status:"ACTIVE"},select:{role:true,staff:{select:{id:true,storeId:true,status:true}}}}),
  ]);
  if(!store || !actor || (actor.role!=="ADMIN" && (actor.staff?.storeId!==b.storeId || actor.staff?.status!=="ACTIVE")))return "門市或原發送人員已停用／異動";
  if(!await checkPermission(actor.role,actor.staff?.id??null,"customer.message.send") || !await checkPermission(actor.role,actor.staff?.id??null,"customer.read"))return "原發送人員已無發送權限";
  if(!await hasStoreFeature(b.storeId,FEATURES.CUSTOMER_MANAGEMENT) || !await hasStoreFeature(b.storeId,FEATURES.LINE_REMINDER))return "本店顧客管理或 LINE 功能已停用";
  await assertStoreSubscriptionWritable(b.storeId);
  const bot=await getLineBotInfo(b.storeId),config=getLineConfigForStore(b.storeId),explicit=getConfiguredStoreLine(b.storeId);
  if(!bot.ok)throw new Error("LINE 管道暫時無法確認");
  if(!config.expectedBasicId || bot.data.basicId!==config.expectedBasicId || (explicit && bot.data.userId!==explicit.destination))return "LINE 發送帳號與本店設定不符，停止發送";
  const current=await customerMessageRecipient(b.storeId,r.customerId);
  if(!current.recipient || current.recipient!==r.lineUserId)return "顧客 LINE 身分已變更或無法使用，停止發送";
  const resolved=await resolveVerifiedReminderLineRoute(b.storeId,r.lineUserId,null,r.customerId);
  if(resolved.status!=="READY" || resolved.channel!=="STORE" || resolved.recipientLineUserId!==r.lineUserId)return "無法確認本店 LINE 收件身分，未發送";
  const quota=await readLineQuota(b.storeId,"STORE");
  // An ambiguous previous attempt may already consume quota: allow reconciliation using the SAME retry key.
  if(!r.firstAttemptAt && quota.limit!==null && quota.used>=quota.limit)return "LINE 額度已用完，未發送";
  return null;
}
async function reserve({batch:b,recipient:r}:Claimed) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${b.storeId} FOR UPDATE`;
    const [batch]=await tx.$queryRaw<Array<{status:string}>>`SELECT status FROM "CustomerMessageBatch" WHERE id=${b.id} AND "storeId"=${b.storeId} FOR UPDATE`;
    if(batch?.status!=="QUEUED")return false;
    const existing=await tx.messageLog.findUnique({where:{id:`customer-message:${r.id}`},select:{status:true}});
    if(existing?.status==="PENDING" || existing?.status==="SENT")return true;
    const range=monthRange(toLocalMonthStr());
    const plan=await getStoreForPlanByStoreId(b.storeId,tx);
    const count=await tx.messageLog.count({where:{storeId:b.storeId,OR:[{status:"SENT",sentAt:{gte:range.start,lte:range.end}},{status:"PENDING",createdAt:{gte:range.start,lte:range.end}}]}});
    if(!checkReminderSendLimit(plan,count).allowed)return false;
    await tx.messageLog.create({data:{id:`customer-message:${r.id}`,storeId:b.storeId,customerId:r.customerId,renderedBody:b.body,status:"PENDING",lineRoute:"STORE"}});
    await tx.$executeRaw`UPDATE "CustomerMessageRecipient" SET "firstAttemptAt"=COALESCE("firstAttemptAt",NOW()) WHERE id=${r.id}`;
    return true;
  });
}
export async function finishCustomerMessage(event:Claimed,status:string,reason:string|null) {
  const {batch:b,recipient:r}=event;
  await prisma.$transaction(async tx=>{
    const updated=await tx.$executeRaw`UPDATE "CustomerMessageRecipient" SET status=${status},reason=${reason},"acceptedAt"=CASE WHEN ${status}='ACCEPTED' THEN NOW() ELSE "acceptedAt" END,"nextAttemptAt"=NOW()+interval '5 minutes' WHERE id=${r.id} AND "storeId"=${b.storeId} AND attempts=${r.attempts} AND status IN ('SENDING','UNKNOWN')`;
    if(!updated)return;
    const logStatus=status==="ACCEPTED"?"SENT":status==="UNKNOWN"||status==="PENDING"?"PENDING":status==="FAILED"?"FAILED":"SKIPPED";
    await tx.messageLog.updateMany({where:{id:`customer-message:${r.id}`,storeId:b.storeId},data:{status:logStatus,errorMessage:reason,sentAt:status==="ACCEPTED"?new Date():null}});
    await tx.$executeRaw`UPDATE "CustomerMessageBatch" b SET status=CASE WHEN EXISTS(SELECT 1 FROM "CustomerMessageRecipient" r WHERE r."batchId"=b.id AND r.status IN ('SKIPPED','FAILED','UNKNOWN')) THEN 'PARTIAL' ELSE 'COMPLETED' END WHERE b.id=${b.id} AND b.status='QUEUED' AND NOT EXISTS(SELECT 1 FROM "CustomerMessageRecipient" r WHERE r."batchId"=b.id AND r.status IN ('PENDING','SENDING'))`;
  });
}
/** No session or push is performed by previews; only confirmed durable jobs enter this worker. */
export async function processCustomerMessage(event:Claimed,deps:CustomerMessageWorkerDeps) {
  const {batch:b,recipient:r}=event;
  const finish=(status:string,reason:string|null)=>deps.finish(event,status,reason);
  if(!messageRetryAllowed(r.firstAttemptAt,r.attempts-1))return finish(r.firstAttemptAt?"UNKNOWN":"SKIPPED",r.firstAttemptAt?"先前發送結果未確認，已停止自動重試":"已超過重試次數");
  if(!r.firstAttemptAt && Date.now()-b.scheduledAt.getTime()>24*3600000)return finish("SKIPPED","已超過預定時間 24 小時，請重新確認發送");
  try {
    const reason=await deps.check(event);
    if(reason)return finish(r.firstAttemptAt?"UNKNOWN":"SKIPPED",reason);
    if(!await deps.reserve(event))return finish("SKIPPED","訊息已取消或已達蒸管家方案的訊息用量上限");
    const result=await deps.push(event);
    if(result.success)return finish("ACCEPTED",null);
    if(result.errorType==="delivery_paused" || result.errorType==="preview_blocked")return finish(r.firstAttemptAt?"UNKNOWN":"SKIPPED","LINE 發送暫停，未繼續發送");
    if(result.httpStatus && result.httpStatus>=400 && result.httpStatus<500)return finish(r.firstAttemptAt?"UNKNOWN":"FAILED","LINE 未接受本次請求，請檢查管道或額度");
    return finish("PENDING","發送結果待確認，將以相同識別碼核對，避免重複發送");
  } catch {return finish("PENDING","暫時無法確認發送結果，稍後自動核對");}
}
export async function runCustomerMessages(storeId?:string,max=100) {
  // Preserve global pause and preview isolation before touching the queue.
  const {isSystemLineDeliveryPaused}=await import("@/lib/line-delivery-pause");
  const {isPreviewExternalIntegrationBlocked}=await import("@/lib/runtime-env");
  if(isSystemLineDeliveryPaused() || isPreviewExternalIntegrationBlocked())return {processed:0,paused:true};
  const deps:CustomerMessageWorkerDeps={claim:()=>claimCustomerMessage(storeId),check,reserve,push:({batch:b,recipient:r})=>pushMessage(b.storeId,r.lineUserId,b.payload,r.retryKey,b.confirmedAt??b.createdAt),finish:finishCustomerMessage};
  let processed=0;
  const deadline=Date.now()+210_000;
  for(;processed<max&&Date.now()<deadline;processed++){const event=await deps.claim();if(!event)break;await processCustomerMessage(event,deps);}
  return {processed,paused:false};
}
