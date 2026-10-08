import 'server-only';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { coursePrisma } from '@/lib/course-db';
import { addTaiwanDuration,dayRange,formatTWDateTime,monthRange,toLocalDateStr,toLocalMonthStr } from '@/lib/date-utils';
import { isPreviewExternalIntegrationBlocked } from '@/lib/runtime-env';
import { hasStoreFeature } from '@/lib/feature-gate';
import { FEATURES } from '@/lib/feature-flags';
import { getStoreForPlanByStoreId } from '@/lib/store-plan';
import { checkReminderSendLimit } from '@/lib/usage-gate';
import { pushMessage,pushSteamButlerMessage,type LineFlexMessage } from '@/lib/line';
import { coachNoticeSettingId,coachNoticeFlex,type CoachNoticeKind,type CoachNoticeLine } from '@/lib/course-coach-notifications';
import { resolveCentralMemberCustomerForStore } from './central-member-resolver';
import { resolveCentralLineRecipientForCustomer } from './central-line-recipient-loader';
import { resolveVerifiedReminderLineRoute } from './verified-reminder-line-route';
import { deriveCourseBaseUrl } from './course-delivery-links';

type Snapshot={id:string;coachId:string;startsAt:string;endsAt:string;roomId:string;cancelledAt:string|null;teacherAttendance:string;nameSnapshot:string};
type BookingSnapshot={sessionId:string;status:string;customerName:string;session:Snapshot};
type Notice={id:string;storeId:string;staffId:string;kind:CoachNoticeKind;payload:Record<string,{before:Snapshot|BookingSnapshot|null;after:Snapshot|BookingSnapshot}> & {date?:string};retryKey:string;createdAt:Date;firstAttemptAt:Date|null;recipient:Target|null;message:LineFlexMessage|null};
type Target={userId:string;customerId:string;channel:'CENTRAL'|'STORE';recipient:string};
export async function coachNoticeEnabled(storeId:string,kind:CoachNoticeKind){return !!(await prisma.messageTemplate.findFirst({where:{id:coachNoticeSettingId(storeId,kind),storeId,body:'enabled'},select:{id:true}}));}
async function targetFor(storeId:string,staffId:string,verify=true):Promise<Target|null> {
 const link=await prisma.staffMemberLink.findFirst({where:{storeId,staffId,revokedAt:null,staff:{storeId,status:'ACTIVE',courseCoachEnabled:true},user:{status:'ACTIVE'}},select:{userId:true}});
 if(!link)return null;
 const member=await resolveCentralMemberCustomerForStore(link.userId,storeId);if(!member)return null;
 const customer=await prisma.customer.findFirst({where:{id:member.customerId,storeId,mergedIntoCustomerId:null,lineLinkStatus:{not:'BLOCKED'}},select:{id:true,lineUserId:true,lineLinkStatus:true}});if(!customer)return null;
 const central=await resolveCentralLineRecipientForCustomer(customer.id,storeId);if(central?.centralUserId!==link.userId)return null;
 if(!verify)return central.deliverable?{userId:link.userId,customerId:customer.id,channel:'CENTRAL',recipient:central.recipientLineUserId!}:customer.lineLinkStatus==='LINKED'&&customer.lineUserId?{userId:link.userId,customerId:customer.id,channel:'STORE',recipient:customer.lineUserId}:null;
 const route=await resolveVerifiedReminderLineRoute(storeId,customer.lineLinkStatus==='LINKED'?customer.lineUserId:null,central,customer.id);
 return route.status==='READY'?{userId:link.userId,customerId:customer.id,channel:route.channel,recipient:route.recipientLineUserId}:null;
}
export async function coachBindingStatus(storeId:string,staffId:string){return !!await targetFor(storeId,staffId,false);}
function sameTarget(a:Target,b:Target){return a.userId===b.userId&&a.customerId===b.customerId&&a.channel===b.channel&&a.recipient===b.recipient;}

export async function enqueueCoachDigests(now=new Date()) {
 // Runs at 21:00 Taipei; reject an accidental early invocation.
 if(formatTWDateTime(now).slice(11)<'21:00'||formatTWDateTime(now).slice(11)>'21:10')return 0;
 const date=addTaiwanDuration(toLocalDateStr(now),1,'DAY'),range=dayRange(date);
 const rows=await coursePrisma.courseSession.findMany({where:{cancelledAt:null,releasedAt:null,teacherAttendance:{notIn:['LEAVE','NO_SHOW']},startsAt:{gte:range.start,lte:range.end}},select:{storeId:true,coachId:true,id:true}});
 const groups=new Map<string,typeof rows>();for(const row of rows){const key=`${row.storeId}:${row.coachId}`;groups.set(key,[...(groups.get(key)??[]),row]);}
 let queued=0;
 for(const sessions of groups.values()){
  const {storeId,coachId}=sessions[0];
  if(!await hasStoreFeature(storeId,FEATURES.LINE_REMINDER)||!await coachNoticeEnabled(storeId,'DIGEST'))continue;
  const id='course-coach:'+createHash('md5').update(`${storeId}:${coachId}:DIGEST:${date}`).digest('hex');
  const payload=JSON.stringify({date,...Object.fromEntries(sessions.map(s=>[s.id,{before:null,after:{id:s.id}}]))});
  queued+=await prisma.$executeRaw`INSERT INTO "CourseCoachNotification"(id,"storeId","staffId",kind,payload) VALUES(${id},${storeId},${coachId},'DIGEST',${payload}::jsonb) ON CONFLICT(id) DO NOTHING`;
 }
 return queued;
}
async function render(notice:Notice,slug:string,storeName:string) {
 const lines:CoachNoticeLine[]=[];
 const entries=Object.entries(notice.payload).filter((entry):entry is [string,{before:Snapshot|BookingSnapshot|null;after:Snapshot|BookingSnapshot}]=>entry[0]!=='date'&&typeof entry[1]==='object');
 for(const [id,item] of entries){
  const before=item.before;
  const sessionId=notice.kind==='TRIAL'?(item.after as BookingSnapshot).sessionId:id;
  const session=await coursePrisma.courseSession.findFirst({where:{storeId:notice.storeId,id:sessionId},include:{room:{select:{name:true}},template:{select:{classType:true}},bookings:{where:{bookingKind:'TRIAL',musicOpeningMakeupEntitlementId:null,status:'RESERVED'},select:{id:true}}}});
  if(!session)continue;
  if(notice.kind==='CHANGE'&&session.endsAt<=new Date())continue;
  let detail='',previous:string|undefined;
  if(notice.kind==='DIGEST'){
   if(session.cancelledAt||session.releasedAt||['LEAVE','NO_SHOW'].includes(session.teacherAttendance)||session.coachId!==notice.staffId||session.startsAt<=new Date())continue;
   detail=`體驗 ${session.bookings.length} 位`;
  }else if(notice.kind==='TRIAL'){
   if(session.cancelledAt||session.coachId!==notice.staffId)continue;
   const booking=await coursePrisma.courseBooking.findFirst({where:{id,storeId:notice.storeId,bookingKind:'TRIAL',musicOpeningMakeupEntitlementId:null},select:{status:true,customerName:true}});if(!booking)continue;
   const old=before as BookingSnapshot|null;
   if(booking.status==='CANCELLED'){
    // Only cancellation of an already sent trial alert warrants a second alert.
    const [sent]=await prisma.$queryRaw<{id:string}[]>`SELECT id FROM "CourseCoachNotification" WHERE "storeId"=${notice.storeId} AND "staffId"=${notice.staffId} AND kind='TRIAL' AND status='SENT' AND payload ? ${id} LIMIT 1`;
    if(!sent)continue;
    detail=`${booking.customerName} · 已取消體驗`;
   }else if(booking.status==='RESERVED')detail=`${booking.customerName} · ${old?'體驗資料更新':'新增體驗'}`;
   else continue;
  }else{
   const old=before as Snapshot|null;if(!old)continue;
   if(+new Date(old.startsAt)===+session.startsAt&&+new Date(old.endsAt)===+session.endsAt&&old.roomId===session.roomId&&old.coachId===session.coachId&&!!old.cancelledAt===!!session.cancelledAt&&old.teacherAttendance===session.teacherAttendance)continue;
   detail=session.cancelledAt?'課程已取消':session.teacherAttendance==='LEAVE'?'老師請假 · 停課':session.teacherAttendance==='NO_SHOW'?'老師曠課 · 停課':old.coachId!==session.coachId?(notice.staffId===session.coachId?'由您接任授課':'已改由其他教練授課'):'授課安排已更新';
   previous=`原 ${formatTWDateTime(new Date(old.startsAt))}–${formatTWDateTime(new Date(old.endsAt)).slice(11)}`;
  }
  const type=session.template.classType;
  const color=session.isTrial?'#F07829':type==='PRIVATE'?'#3168EF':type==='SELF_ORGANIZED'?'#CD9827':'#40986F';
  lines.push({name:session.nameSnapshot,startsAt:session.startsAt.toISOString(),endsAt:session.endsAt.toISOString(),room:session.room.name,color,detail,previous});
 }
 if(!lines.length)return null;
 lines.sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
 const date=notice.payload.date??toLocalDateStr(new Date(lines[0].startsAt));
 const url=new URL(`/s/${encodeURIComponent(slug)}/book`,deriveCourseBaseUrl());url.searchParams.set('view','work');url.searchParams.set('date',date);url.searchParams.set('month',date.slice(0,7));
 return coachNoticeFlex(notice.kind,storeName,lines,url.toString(),notice.kind==='DIGEST'?date:undefined);
}

/** Durable claim before I/O, stable retry UUID and frozen recipient/message on retries. */
export async function runCoachNotifications(storeId?:string) {
 const notices=await prisma.$queryRaw<Notice[]>`UPDATE "CourseCoachNotification" SET status='PENDING',"leaseUntil"=NOW()+interval '2 minutes' WHERE id IN (SELECT id FROM "CourseCoachNotification" WHERE (${storeId??null}::text IS NULL OR "storeId"=${storeId??null}) AND (status='READY' OR (status IN ('FAILED','PENDING') AND "leaseUntil"<NOW())) ORDER BY "createdAt" LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`;
 const counts={sent:0,skipped:0,failed:0};
 for(const notice of notices){
  let target:Target|null=null;
  const finish=async(status:string,error:string|null)=>{await prisma.$executeRaw`UPDATE "CourseCoachNotification" SET status=${status},"errorMessage"=${error},"leaseUntil"=NOW()+interval '5 minutes',"sentAt"=CASE WHEN ${status}='SENT' THEN NOW() ELSE "sentAt" END WHERE id=${notice.id} AND status<>'SENT'`;};
  try {
   if(!await coachNoticeEnabled(notice.storeId,notice.kind)||!await hasStoreFeature(notice.storeId,FEATURES.LINE_REMINDER)){await finish('SKIPPED','通知開關已關閉或提醒功能未開通');counts.skipped++;continue;}
   if(isPreviewExternalIntegrationBlocked()){await finish('SKIPPED','隔離預覽不向外發送 LINE');counts.skipped++;continue;}
   if(Date.now()-(notice.firstAttemptAt??notice.createdAt).getTime()>23*3600000){await finish('BLOCKED','已超過安全重試期限');counts.skipped++;continue;}
   target=await targetFor(notice.storeId,notice.staffId);
   if(!target){await finish('SKIPPED','教練未完成可用 LINE 綁定或已停用');counts.skipped++;continue;}
   if(notice.recipient&&!sameTarget(notice.recipient,target)){await finish('BLOCKED','通知對象綁定已變更');counts.skipped++;continue;}
   const store=await prisma.store.findUniqueOrThrow({where:{id:notice.storeId},select:{name:true,slug:true}});
   const message=notice.message??await render(notice,store.slug,store.name);
   if(!message){await finish('SKIPPED','目前沒有需要通知的有效異動');counts.skipped++;continue;}
   const limits=await getStoreForPlanByStoreId(notice.storeId),range=monthRange(toLocalMonthStr());
   await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${notice.storeId} FOR UPDATE`;
    const setting=await tx.messageTemplate.findFirst({where:{id:coachNoticeSettingId(notice.storeId,notice.kind),storeId:notice.storeId,body:'enabled'},select:{id:true}});
    if(!setting)throw new Error('通知開關已關閉');
    const usage=await tx.messageLog.count({where:{storeId:notice.storeId,createdAt:{gte:range.start,lte:range.end},status:{in:['SENT','PENDING']},id:{not:notice.id}}});
    if(!checkReminderSendLimit(limits,usage).allowed)throw new Error('已達本月提醒額度');
    await tx.$executeRaw`UPDATE "CourseCoachNotification" SET recipient=${JSON.stringify(target)}::jsonb,message=${JSON.stringify(message)}::jsonb,"firstAttemptAt"=COALESCE("firstAttemptAt",NOW()) WHERE id=${notice.id}`;
    await tx.messageLog.upsert({where:{id:notice.id},create:{id:notice.id,storeId:notice.storeId,customerId:target!.customerId,channel:'LINE',status:'PENDING',renderedBody:message.altText},update:{status:'PENDING',errorMessage:null}});
   });
   const live=await targetFor(notice.storeId,notice.staffId);
   if(!live||!sameTarget(live,target)||!await coachNoticeEnabled(notice.storeId,notice.kind)){
    await finish('BLOCKED','發送前通知開關或綁定已變更');await prisma.messageLog.update({where:{id:notice.id},data:{status:'SKIPPED',errorMessage:'開關或綁定已變更'}});counts.skipped++;continue;
   }
   const result=target.channel==='STORE'?await pushMessage(notice.storeId,target.recipient,[message],notice.retryKey):await pushSteamButlerMessage(target.recipient,[message],notice.retryKey);
   const status=result.success?'SENT':result.httpStatus&&result.httpStatus>=400&&result.httpStatus<500&&result.httpStatus!==429?'BLOCKED':'FAILED';
   await finish(status,result.success?null:'LINE 未確認送達');
   await prisma.messageLog.updateMany({where:{id:notice.id,status:{not:'SENT'}},data:{status:result.success?'SENT':'FAILED',sentAt:result.success?new Date():null,lineRoute:target.channel,errorMessage:result.success?null:'教練通知未確認送達'}});
   counts[result.success?'sent':'failed']++;
  }catch(error){await finish('FAILED',error instanceof Error?error.message.slice(0,200):'通知處理失敗');counts.failed++;}
 }
 return counts;
}
