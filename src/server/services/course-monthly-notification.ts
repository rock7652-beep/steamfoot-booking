import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
import { monthRange,toLocalMonthStr } from "@/lib/date-utils";
import { getStoreForPlanByStoreId } from "@/lib/store-plan";
import { checkReminderSendLimit } from "@/lib/usage-gate";
import { pushMessage,pushSteamButlerMessage } from "@/lib/line";
import { courseTransaction } from "./course-access";
import { readCourseMonthlySettlement } from "./course-monthly-settlement";
import { resolveCentralMemberCustomerForStore } from "./central-member-resolver";
import { resolveCentralLineRecipientForCustomer } from "./central-line-recipient-loader";
import { resolveVerifiedReminderLineRoute } from "./verified-reminder-line-route";
import { deriveCourseBaseUrl } from "./course-delivery-links";
import { notificationId,recipientHash,noticeRetryState,monthlyNotificationBody,type NoticeRecord,type NoticeSummary } from "@/lib/course-monthly-notification";

async function context(storeId:string,month:string,revision:number) {
 const report=await coursePrisma.$transaction(tx=>readCourseMonthlySettlement(tx,storeId,month),{isolationLevel:'RepeatableRead',timeout:20000});
 const last=report.revisions[0];
 const reason=!report.settings.personalIncomeEnabled?'請先於月結設定開放人員查看本人收入。':!last?'請先確認本月金額。':last.revision!==revision||last.fingerprint!==report.fingerprint?'月結已有異動，請重新確認金額後再通知。':null;
 return {report,last,reason,staffIds:[...new Set((last?.snapshot??[]).map(l=>l.staffId).filter((id):id is string=>!!id))]};
}
async function recipient(storeId:string,staffId:string,preview:boolean) {
 const link=await prisma.staffMemberLink.findFirst({where:{storeId,staffId,revokedAt:null,staff:{storeId,status:'ACTIVE'},user:{status:'ACTIVE'}},select:{userId:true}});
 if(!link)return null;
 const member=await resolveCentralMemberCustomerForStore(link.userId,storeId);
 if(!member)return null;
 const customer=await prisma.customer.findFirst({where:{id:member.customerId,storeId,mergedIntoCustomerId:null,lineLinkStatus:{not:'BLOCKED'}},select:{id:true,lineUserId:true,lineLinkStatus:true}});
 if(!customer)return null;
 const central=await resolveCentralLineRecipientForCustomer(customer.id,storeId);
 if(central?.centralUserId!==link.userId)return null;
 // Preview never probes or sends to a real external LINE account.
 if(preview)return central.deliverable?{userId:link.userId,customerId:customer.id,channel:'CENTRAL' as const,recipient:central.recipientLineUserId!}:null;
 const route=await resolveVerifiedReminderLineRoute(storeId,customer.lineLinkStatus==='LINKED'?customer.lineUserId:null,central,customer.id);
 if(route.status!=='READY')return 'UNAVAILABLE' as const;
 return {userId:link.userId,customerId:customer.id,channel:route.channel,recipient:route.recipientLineUserId};
}
export async function courseMonthlyNoticeSummary(storeId:string,month:string,revision:number):Promise<NoticeSummary> {
 const ctx=await context(storeId,month,revision),preview=isPreviewExternalIntegrationBlocked();
 const result:NoticeSummary={revision,reason:ctx.reason,preview,rows:[]};
 if(ctx.reason||!ctx.last)return result;
 const records=await coursePrisma.$queryRaw<NoticeRecord[]>`SELECT * FROM "CourseMonthlyNotification" WHERE "storeId"=${storeId} AND "settlementId"=${ctx.last.id}`;
 for(const staffId of ctx.staffIds){
  const name=ctx.last.snapshot.find(l=>l.staffId===staffId)?.name??'人員';
  const old=records.find(r=>r.id===notificationId(storeId,ctx.last!.id,staffId));
  let status=noticeRetryState(old,new Date()),reason='';
  if(status==='READY'||status==='FAILED'){
   const target=await recipient(storeId,staffId,preview);
   if(target==='UNAVAILABLE'){status='BLOCKED';reason='LINE 暫時無法確認可通知，請稍後更新狀態。';}
   else if(!target){status='UNBOUND';reason='尚未完成可用的 LINE 綁定，或人員已停用。';}
   else if(old&&(old.userId!==target.userId||old.customerId!==target.customerId||old.recipientHash!==recipientHash(target.channel,target.recipient))){status='BLOCKED';reason='通知對象綁定已變更，請先核對。';}
  }
  if(status==='BLOCKED'&&!reason)reason='無法安全重送，請先核對通知紀錄。';
  if(status==='BUSY')reason='正在處理，稍後重新整理。';
  if(status==='FAILED')reason='上次未確認成功，可安全重試。';
  result.rows.push({staffId,name,status,reason});
 }
 return result;
}

/** Claim commits before external delivery, so crashes cannot erase retry identity. */
export async function sendCourseMonthlyNotice(actor:{storeId:string;userId:string},month:string,revision:number,staffId:string) {
 const {storeId,userId}=actor;
 if(isPreviewExternalIntegrationBlocked())throw new AppError('BUSINESS_RULE','隔離預覽不會發送真實 LINE。');
 const ctx=await context(storeId,month,revision);
 if(ctx.reason||!ctx.last)throw new AppError('CONFLICT',ctx.reason??'月結尚未確認');
 if(!ctx.staffIds.includes(staffId))throw new AppError('FORBIDDEN','此人員不在本次已確認月結中');
 const target=await recipient(storeId,staffId,false);
 if(target==='UNAVAILABLE')throw new AppError('BUSINESS_RULE','LINE 暫時無法確認可通知，請稍後重試');
 if(!target)throw new AppError('BUSINESS_RULE','人員 LINE 綁定尚未完成或已停用');
 const store=await prisma.store.findUniqueOrThrow({where:{id:storeId},select:{name:true,slug:true}});
 const url=new URL(`/s/${encodeURIComponent(store.slug)}/book/income`,deriveCourseBaseUrl());url.searchParams.set('month',month);
 const id=notificationId(storeId,ctx.last.id,staffId),hash=recipientHash(target.channel,target.recipient);
 const limits=await getStoreForPlanByStoreId(storeId);
 const claimed=await courseTransaction(storeId,async tx=>{
  const live=await readCourseMonthlySettlement(tx,storeId,month);
  if(!live.settings.personalIncomeEnabled||live.revisions[0]?.id!==ctx.last!.id||live.fingerprint!==ctx.last!.fingerprint)throw new AppError('CONFLICT','查詢設定或月結已變更，請重新整理');
  const [binding]=await tx.$queryRaw<{userId:string}[]>`SELECT l."userId" FROM "StaffMemberLink" l JOIN "Staff" s ON s.id=l."staffId" AND s."storeId"=l."storeId" JOIN "User" u ON u.id=l."userId" WHERE l."storeId"=${storeId} AND l."staffId"=${staffId} AND l."revokedAt" IS NULL AND s.status='ACTIVE' AND u.status='ACTIVE'`;
  if(binding?.userId!==target.userId)throw new AppError('CONFLICT','人員綁定已變更');
  const [old]=await tx.$queryRaw<NoticeRecord[]>`SELECT * FROM "CourseMonthlyNotification" WHERE id=${id} FOR UPDATE`;
  const now=new Date(),state=noticeRetryState(old,now);
  if(state==='SENT')return null;
  if(state==='BUSY'||state==='BLOCKED')throw new AppError('CONFLICT',state==='BUSY'?'正在發送，請稍後重新整理':'已超過安全重試期限或發送受阻，請先核對');
  if(old&&(old.userId!==target.userId||old.customerId!==target.customerId||old.recipientHash!==hash||old.channel!==target.channel))throw new AppError('CONFLICT','收件帳號已變更，不能重送原通知');
  const range=monthRange(toLocalMonthStr(now));
  const [usage]=await tx.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM "MessageLog" WHERE "storeId"=${storeId} AND "createdAt">=${range.start} AND "createdAt"<=${range.end} AND (status='SENT' OR (id LIKE 'course-monthly:%' AND status IN ('PENDING','FAILED'))) AND id<>${id}`;
  if(!checkReminderSendLimit(limits,Number(usage.count)).allowed)throw new AppError('BUSINESS_RULE','已達本月提醒額度');
  const retryKey=old?.retryKey??randomUUID(),body=old?.body??monthlyNotificationBody(store.name,month,url.toString());
  const lease=new Date(now.getTime()+120000);
  await tx.$executeRaw`INSERT INTO "CourseMonthlyNotification" (id,"storeId","settlementId","staffId","userId","customerId","recipientHash",channel,body,"retryKey",status,"leaseUntil","actorUserId") VALUES (${id},${storeId},${ctx.last!.id},${staffId},${target.userId},${target.customerId},${hash},${target.channel},${body},${retryKey},'PENDING',${lease},${userId}) ON CONFLICT (id) DO UPDATE SET status='PENDING',"leaseUntil"=EXCLUDED."leaseUntil"`;
  await tx.$executeRaw`INSERT INTO "MessageLog" (id,"storeId","customerId",channel,status,"renderedBody","createdAt") VALUES (${id},${storeId},${target.customerId},'LINE','PENDING',${body},${now}) ON CONFLICT (id) DO UPDATE SET status='PENDING',"errorMessage"=NULL`;
  return {retryKey,body};
 });
 if(!claimed)return {status:'SENT' as const};
 let result:{success:boolean;httpStatus?:number};
 try {result=target.channel==='STORE'?await pushMessage(storeId,target.recipient,[{type:'text',text:claimed.body}],claimed.retryKey):await pushSteamButlerMessage(target.recipient,[{type:'text',text:claimed.body}],claimed.retryKey);}catch{result={success:false};}
 const status=result.success?'SENT':result.httpStatus&&result.httpStatus>=400&&result.httpStatus<500&&result.httpStatus!==429?'BLOCKED':'FAILED';
 // A delayed success may upgrade a failure; a delayed failure never overwrites SENT.
 await courseTransaction(storeId,async tx=>{
  const changed=await tx.$executeRaw`UPDATE "CourseMonthlyNotification" SET status=${status},"sentAt"=CASE WHEN ${result.success} THEN NOW() ELSE "sentAt" END,"leaseUntil"=NOW()+interval '5 seconds' WHERE id=${id} AND status<>'SENT'`;
  if(changed)await tx.$executeRaw`UPDATE "MessageLog" SET status=${result.success?'SENT':'FAILED'}::"MessageLogStatus","sentAt"=CASE WHEN ${result.success} THEN NOW() ELSE NULL END,"lineRoute"=${target.channel}::"ReminderLineRoute","errorMessage"=${result.success?null:'通知未確認成功，請由月結通知區查看或重試。'} WHERE id=${id}`;
 });
 return {status};
}
