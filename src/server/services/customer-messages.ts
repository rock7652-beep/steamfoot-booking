import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { LineMessage } from "@/lib/line";
import { systemLineFlexMessages } from "@/lib/line-system-flex";
import { prisma } from "@/lib/db";
import { getConfiguredStoreLine, storeLineIdentityProvider } from "@/lib/store-line-config";
import { getLineConfigForStore } from "@/lib/line-config";
import { isSystemLineDeliveryPaused } from "@/lib/line-delivery-pause";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { readLineQuota } from "@/lib/line-quota";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { customerLabelFilterIds } from "@/server/services/customer-label-filter";
import { musicCustomerWhere } from "@/server/services/music-data-scope";
import { messageDraftSchema, messageFiltersSchema, messageSchedule, CUSTOMER_MESSAGE_LIMIT, type MessageHistory, type MessagePerson, type MessagePreview } from "@/lib/customer-message";

export type MessageBatchRow = {id:string;storeId:string;createdById:string;body:string;payload:LineMessage[];channelKey:string;status:string;immediate:boolean;scheduledAt:Date;expiresAt:Date;createdAt:Date;confirmedAt:Date|null};
export function customerMessageChannelKey(storeId:string) {
  const config=getLineConfigForStore(storeId),explicit=getConfiguredStoreLine(storeId);
  // Channel identity, never credentials. Token rotation on the same OA is safe.
  return createHash("sha256").update(JSON.stringify({storeId,basicId:config.expectedBasicId,destination:explicit?.destination??null,channelId:explicit?.messagingChannelId??null,provider:explicit?.providerId??null})).digest("hex");
}
export function customerMessageBlocker(storeId:string):string|null {
  if(!getLineConfigForStore(storeId).accessToken) return "本店尚未設定 LINE 發送管道";
  if(isSystemLineDeliveryPaused()) return "系統 LINE 發送目前暫停，可編輯及預覽，恢復後須重新確認發送";
  if(isPreviewExternalIntegrationBlocked()) return "此環境僅供預覽，不會對顧客發送訊息";
  return null;
}
export async function customerMessageSearch(storeId:string,input:unknown,page=1,pageSize=25) {
  const f=messageFiltersSchema.parse(input);
  const labelIds=await customerLabelFilterIds(storeId,f.labelId);
  const where:Prisma.CustomerWhereInput={AND:[
    {storeId,mergedIntoCustomerId:null}, musicCustomerWhere(storeId),
    ...(f.stage?[{customerStage:f.stage}]:[]), ...(f.line?[{lineLinkStatus:f.line}]:[]),
    ...(f.staffId?[{assignedStaffId:f.staffId}]:[]), ...(labelIds!==null?[{id:{in:labelIds}}]:[]),
    ...(f.search?[{OR:[{name:{contains:f.search,mode:"insensitive" as const}},{phone:{contains:f.search}},{lineName:{contains:f.search,mode:"insensitive" as const}}]}]:[]),
  ]};
  if(f.labelId && labelIds===null) throw new Error("顧客標籤未開啟，請清除標籤篩選後重試");
  const [rows,total]=await Promise.all([
    prisma.customer.findMany({where,select:{id:true,name:true,phone:true,lineLinkStatus:true,customerStage:true},orderBy:[{name:"asc"},{id:"asc"}],skip:(page-1)*pageSize,take:pageSize}),
    prisma.customer.count({where}),
  ]);
  return {rows:rows.map(r=>({id:r.id,name:r.name,phone:r.phone,lineStatus:r.lineLinkStatus,stage:r.customerStage})) as MessagePerson[],total,page};
}
export async function customerMessageSelection(storeId:string,ids:string[]) {
  const rows=await prisma.customer.findMany({where:{AND:[{storeId,id:{in:ids},mergedIntoCustomerId:null},musicCustomerWhere(storeId)]},select:{id:true,name:true,phone:true,lineLinkStatus:true,customerStage:true}});
  if(rows.length!==ids.length)throw new Error("部分顧客已變更或不在目前門市，請返回顧客管理重新選取");
  const people=new Map(rows.map(r=>[r.id,{id:r.id,name:r.name,phone:r.phone,lineStatus:r.lineLinkStatus,stage:r.customerStage}]));
  return ids.map(id=>people.get(id)!) as MessagePerson[];
}
/** Database evidence for preview. Network reachability is checked again by the worker. */
export async function customerMessageRecipient(storeId:string,customerId:string) {
  const person=await prisma.customer.findFirst({where:{AND:[{id:customerId,storeId,mergedIntoCustomerId:null},musicCustomerWhere(storeId)]},select:{id:true,name:true,lineUserId:true,lineLinkStatus:true,user:{select:{status:true}}}});
  if(!person) return {id:customerId,name:"無法存取的顧客",recipient:null,reason:"顧客已合併、移除或不屬於本店"};
  const result=(recipient:string|null,reason:string|null)=>({id:person.id,name:person.name,recipient,reason});
  if(person.lineLinkStatus==="BLOCKED" || person.user && person.user.status!=="ACTIVE") return result(null,"LINE 已封鎖或會員已停用");
  const config=getConfiguredStoreLine(storeId);
  if(config) {
    const provider=storeLineIdentityProvider(config);
    const links=await prisma.customerIdentityLink.findMany({where:{storeId,customerId,provider,user:{status:"ACTIVE"}},select:{userId:true,providerAccountId:true},take:2});
    if(links.length!==1) return result(null,"尚未確認本店 LINE 身分");
    const link=links[0],account=await prisma.account.findUnique({where:{provider_providerAccountId:{provider,providerAccountId:link.providerAccountId}},select:{userId:true}});
    if(account?.userId!==link.userId) return result(null,"LINE 身分需要門市核對");
    return result(link.providerAccountId,null);
  }
  if(person.lineLinkStatus!=="LINKED" || !person.lineUserId) return result(null,"尚未綁定本店 LINE");
  return result(person.lineUserId,null);
}
export async function previewCustomerMessage(storeId:string,userId:string,input:unknown):Promise<MessagePreview> {
  const data=messageDraftSchema.parse(input),now=new Date(),scheduledAt=messageSchedule(data,now);
  const people:Array<Awaited<ReturnType<typeof customerMessageRecipient>>>=[];
  // Bound database load; independent recipients are read in small groups.
  for(let i=0;i<data.customerIds.length;i+=10) people.push(...await Promise.all(data.customerIds.slice(i,i+10).map(id=>customerMessageRecipient(storeId,id))));
  const seen=new Set<string>();
  for(const p of people) if(p.recipient){if(seen.has(p.recipient)){p.reason="與已選顧客使用同一個 LINE，避免重複發送";p.recipient=null;}else seen.add(p.recipient);}
  const ready=people.filter(p=>p.recipient),excluded=people.filter(p=>!p.recipient).map(p=>({id:p.id,name:p.name,reason:p.reason??"無法確認 LINE 身分"}));
  const id=randomUUID(),expiresAt=new Date(now.getTime()+15*60000);
  await prisma.$transaction(async tx=>{
    const payload=JSON.stringify(systemLineFlexMessages([{type:"text",text:data.body}]));
    await tx.$executeRaw`INSERT INTO "CustomerMessageBatch" (id,"storeId","createdById",body,payload,"channelKey",immediate,"scheduledAt","expiresAt") VALUES (${id},${storeId},${userId},${data.body},${payload}::jsonb,${customerMessageChannelKey(storeId)},${data.timing==="now"},${scheduledAt},${expiresAt})`;
    for(const p of people) await tx.$executeRaw`INSERT INTO "CustomerMessageRecipient" (id,"batchId","storeId","customerId","nameSnapshot","lineUserId",status,reason,"retryKey") VALUES (${randomUUID()},${id},${storeId},${p.id},${p.name},${p.recipient},${p.recipient?"PENDING":"SKIPPED"},${p.reason},${randomUUID()})`;
  },{timeout:30000});
  let quota=null;
  if(!customerMessageBlocker(storeId)) {try{quota=await readLineQuota(storeId,"STORE");}catch{/* Confirmation requires an authoritative fresh quota. */}}
  return {id,body:data.body,scheduledAt:scheduledAt.toISOString(),immediate:data.timing==="now",expiresAt:expiresAt.toISOString(),ready:ready.map(p=>({id:p.id,name:p.name})),excluded,blocker:customerMessageBlocker(storeId),quota};
}
export async function confirmCustomerMessage(storeId:string,userId:string,id:string) {
  const [batch]=await prisma.$queryRaw<MessageBatchRow[]>`SELECT * FROM "CustomerMessageBatch" WHERE id=${id} AND "storeId"=${storeId} AND "createdById"=${userId}`;
  if(!batch) throw new Error("找不到此訊息，請重新預覽");
  if(batch.status!=="DRAFT") return {id:batch.id,status:batch.status}; // Lost responses reuse the same batch.
  const blocker=customerMessageBlocker(storeId);if(blocker)throw new Error(blocker);
  if(batch.expiresAt<=new Date()) throw new Error("預覽已過期，請返回重新確認");
  if(batch.channelKey!==customerMessageChannelKey(storeId)) throw new Error("本店 LINE 管道已變更，請重新預覽");
  if(!batch.immediate && batch.scheduledAt<=new Date()) throw new Error("排程時間已過，請返回修改時間");
  const [counts]=await prisma.$queryRaw<Array<{count:bigint}>>`SELECT COUNT(*) AS count FROM "CustomerMessageRecipient" WHERE "batchId"=${id} AND status='PENDING'`;
  const count=Number(counts.count);if(!count||count>CUSTOMER_MESSAGE_LIMIT)throw new Error("沒有可發送的顧客，請返回調整名單");
  const quota=await readLineQuota(storeId,"STORE");
  if(quota.limit!==null && quota.used+count>quota.limit) throw new Error("本次預估用量超過 LINE 剩餘額度，請減少收件人或調整 LINE 方案");
  await prisma.$executeRaw`UPDATE "CustomerMessageBatch" SET status='QUEUED',"confirmedAt"=NOW(),"scheduledAt"=CASE WHEN immediate THEN NOW() ELSE "scheduledAt" END WHERE id=${id} AND "storeId"=${storeId} AND "createdById"=${userId} AND status='DRAFT' AND "expiresAt">NOW()`;
  const [result]=await prisma.$queryRaw<Array<{status:string}>>`SELECT status FROM "CustomerMessageBatch" WHERE id=${id} AND "storeId"=${storeId}`;
  if(result?.status==="DRAFT") throw new Error("預覽已過期，請重新確認");
  return {id,status:result.status};
}
export async function cancelCustomerMessage(storeId:string,id:string) {
  return prisma.$transaction(async tx=>{
    const [batch]=await tx.$queryRaw<MessageBatchRow[]>`SELECT * FROM "CustomerMessageBatch" WHERE id=${id} AND "storeId"=${storeId} FOR UPDATE`;
    if(!batch)throw new Error("找不到本店的發送紀錄");
    if(batch.status!=="QUEUED")throw new Error("此訊息已結束，無法取消");
    await tx.$executeRaw`UPDATE "CustomerMessageBatch" SET status='CANCELLED',"cancelledAt"=NOW() WHERE id=${id} AND "storeId"=${storeId}`;
    await tx.$executeRaw`UPDATE "CustomerMessageRecipient" SET status='CANCELLED',reason='店長取消發送' WHERE "batchId"=${id} AND "storeId"=${storeId} AND status IN ('PENDING','SENDING') AND "firstAttemptAt" IS NULL`;
    await tx.$executeRaw`UPDATE "CustomerMessageRecipient" SET status='UNKNOWN',reason='店長取消後續重試；先前發送結果待確認' WHERE "batchId"=${id} AND "storeId"=${storeId} AND status IN ('PENDING','SENDING') AND "firstAttemptAt" IS NOT NULL`;
    return {id};
  });
}
export async function customerMessageHistory(storeId:string):Promise<MessageHistory[]> {
  const rows=await prisma.$queryRaw<Array<Omit<MessageHistory,"scheduledAt"|"createdAt">&{scheduledAt:Date;createdAt:Date}>>`
    SELECT b.id,b.body,b.status,b."scheduledAt",b."createdAt",COUNT(r.id)::int AS total,
      COUNT(*) FILTER(WHERE r.status='ACCEPTED')::int AS accepted,
      COUNT(*) FILTER(WHERE r.status IN ('PENDING','SENDING'))::int AS pending,
      COUNT(*) FILTER(WHERE r.status='FAILED')::int AS failed,
      COUNT(*) FILTER(WHERE r.status IN ('SKIPPED','CANCELLED'))::int AS skipped,
      COUNT(*) FILTER(WHERE r.status='UNKNOWN')::int AS unknown
    FROM "CustomerMessageBatch" b JOIN "CustomerMessageRecipient" r ON r."batchId"=b.id
    WHERE b."storeId"=${storeId} AND b.status<>'DRAFT' GROUP BY b.id ORDER BY b."createdAt" DESC LIMIT 30`;
  return rows.map(r=>({...r,scheduledAt:r.scheduledAt.toISOString(),createdAt:r.createdAt.toISOString()}));
}
export async function customerMessageOptions(storeId:string) {
  const [store,labelEnabled,staff]=await Promise.all([
    prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true}}),
    hasStoreFeature(storeId,FEATURES.CUSTOMER_LABELS),
    prisma.staff.findMany({where:{storeId,user:{status:"ACTIVE"}},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
  ]);
  const setting=labelEnabled?await prisma.customerLabelSetting.findUnique({where:{storeId}}):null;
  const labels=setting?.enabled?await prisma.customerLabel.findMany({where:{storeId,active:true},select:{id:true,name:true},orderBy:[{position:"asc"},{name:"asc"}]}):[];
  return {storeId,storeName:store.name,labels,staff:staff.map(s=>({id:s.id,name:s.displayName})),blocker:customerMessageBlocker(storeId)};
}
