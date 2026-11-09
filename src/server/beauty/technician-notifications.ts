import 'server-only';
import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {beautyPrisma} from '@/lib/beauty-db';
import {addTaiwanDuration,dayRange,toLocalDateStr} from '@/lib/date-utils';
import {deriveBaseUrl} from '@/lib/base-url';
import {beautyNotificationDeliveryBlocked,beautyNotificationActivationAt} from '@/lib/beauty/notification-policy';
import {TECHNICIAN_NOTICE_KINDS,technicianNoticeSettingId,technicianNoticeMessage,type TechnicianNoticeBody,type TechnicianNoticeKind} from '@/lib/beauty/technician-notifications';
import {isPersonnelReminderBatch} from '@/lib/reminder-schedule';
import {resolveCentralLineRecipientForCustomer} from '@/server/services/central-line-recipient-loader';
import {resolveVerifiedReminderLineRoute} from '@/server/services/verified-reminder-line-route';
import {deliverCourseCardNotification} from '@/server/services/course-card-notification-delivery';

export async function technicianNoticeEnabled(storeId:string,kind:TechnicianNoticeKind) {
 const row=await beautyPrisma.beautyEvent.findUnique({where:{id:technicianNoticeSettingId(storeId,kind)},select:{storeId:true,kind:true,status:true,body:true}});
 return row?.storeId===storeId&&row.kind==='TECH_SETTING'&&row.status==='AUDIT'&&row.body==='enabled';
}
export async function queueTechnicianDigest(storeId:string,now:Date) {
 if(beautyNotificationDeliveryBlocked()||!isPersonnelReminderBatch(now)||!await technicianNoticeEnabled(storeId,'TECH_DIGEST'))return;
 const date=addTaiwanDuration(toLocalDateStr(now),1,'DAY'),range=dayRange(date);
 const technicians=await beautyPrisma.beautyTechnician.findMany({where:{storeId,active:true,userId:{not:null}},select:{id:true,userId:true}});
 for(const t of technicians){
  if(!await beautyPrisma.beautyAppointment.count({where:{storeId,technicianId:t.id,status:'RESERVED',startsAt:{gte:range.start,lte:range.end}}}))continue;
  const id='beauty-tech-digest:'+createHash('sha256').update(`${storeId}:${t.id}:${date}`).digest('hex');
  await beautyPrisma.beautyEvent.upsert({where:{id},create:{id,storeId,kind:'TECH_DIGEST',userId:t.userId,body:JSON.stringify({technicianId:t.id,date} satisfies TechnicianNoticeBody)},update:{}});
 }
}
/** Store lock and current event status are checked by the common Beauty worker. */
export async function deliverTechnicianEvent(tx:Prisma.TransactionClient,store:{id:string;name:string},event:{id:string;kind:string;body:string;userId:string|null;appointmentId:string|null;createdAt:Date},now:Date,skip:(reason:string)=>Promise<'SKIPPED'>) {
 if(beautyNotificationDeliveryBlocked())return skip('LINE 服務通知已停用');
 if(!TECHNICIAN_NOTICE_KINDS.includes(event.kind as TechnicianNoticeKind)||!event.userId)return skip('技師通知對象不明');
 const kind=event.kind as TechnicianNoticeKind,body:TechnicianNoticeBody=JSON.parse(event.body);
 if(beautyNotificationActivationAt()&&event.createdAt<beautyNotificationActivationAt()!)return skip('啟用前通知不補發');
 const [setting]=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "BeautyEvent" WHERE kind='TECH_SETTING' AND status='AUDIT' AND id=${technicianNoticeSettingId(store.id,kind)} AND "storeId"=${store.id} AND body='enabled'`;
 if(!setting)return skip('技師通知已關閉');
 const [technician]=await tx.$queryRaw<{id:string}[]>`SELECT t.id FROM "BeautyTechnician" t JOIN "User" u ON u.id=t."userId" AND u.status::text='ACTIVE' WHERE t.id=${body.technicianId} AND t."storeId"=${store.id} AND t."userId"=${event.userId} AND t.active=true`;
 if(!technician)return skip('技師工作身分已停用或變更');
 const customers=await tx.customer.findMany({where:{storeId:store.id,mergedIntoCustomerId:null,lineLinkStatus:{not:'BLOCKED'},OR:[{userId:event.userId},{userId:null,identityLinks:{some:{userId:event.userId,storeId:store.id}}}]},select:{id:true,lineUserId:true,lineLinkStatus:true},take:2});
 if(customers.length!==1)return skip('技師須完成本店唯一會員與 LINE 綁定');
 const person=customers[0],central=await resolveCentralLineRecipientForCustomer(person.id,store.id,tx);
 if(central?.centralUserId!==event.userId)return skip('技師通知身分不一致');
 const route=await resolveVerifiedReminderLineRoute(store.id,person.lineLinkStatus==='LINKED'?person.lineUserId:null,central,person.id,tx);
 if(route.status!=='READY')return skip('技師 LINE 通道尚不可用');
 const recipient=JSON.stringify([event.userId,person.id,route.channel,route.recipientLineUserId]);
 if(body.recipient&&body.recipient!==recipient)return skip('技師 LINE 綁定已變更，停止重送');
 const range=body.date?dayRange(body.date):null;
 const rows=await tx.$queryRaw<{technicianId:string;status:string;startsAt:Date;endsAt:Date;name:string;service:string;location:string}[]>`SELECT b."technicianId",b.status,b."startsAt",b."endsAt",b."personName" AS name,b."serviceName" AS service,COALESCE(r.name,'未指定位置') AS location FROM "BeautyAppointment" b LEFT JOIN "CourseRoom" r ON r.id=b."locationId" AND r."storeId"=b."storeId" WHERE b."storeId"=${store.id} AND (${event.appointmentId}::text IS NOT NULL AND b.id=${event.appointmentId} OR ${range?.start??null}::timestamptz IS NOT NULL AND b."technicianId"=${technician.id} AND b.status='RESERVED' AND b."startsAt">=${range?.start??null} AND b."startsAt"<=${range?.end??null}) ORDER BY b."startsAt"`;
 if(!rows.length||rows.some(b=>b.startsAt<=now))return skip('已無待服務的通知安排');
 if(kind==='TECH_CHANGE'&&body.startsAt&&rows[0].startsAt.toISOString()!==body.startsAt)return skip('預約已再次改期');
 if(kind==='TECH_CHANGE'&&body.action!=='CANCEL'&&rows[0].status!=='RESERVED')return skip('預約狀態已變更');
 if(body.action==='CANCEL'&&rows[0].status!=='CANCELLED')return skip('取消預約已恢復');
 const snapshot=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 if(body.snapshot&&body.snapshot!==snapshot)return skip('班表已更新，停止重送舊通知');
 const targetStore=await tx.store.findFirst({where:{id:store.id,industryModule:'BEAUTY'},select:{slug:true}});if(!targetStore)return skip('本店入口已停用');
 const date=body.date??toLocalDateStr(rows[0].startsAt);
 const url=new URL(`/s/${encodeURIComponent(targetStore.slug)}/beauty`,deriveBaseUrl());url.searchParams.set('work','1');url.searchParams.set('view','schedule');url.searchParams.set('date',date);url.searchParams.set('month',date.slice(0,7));
 const action=body.action==='CANCEL'?'預約已取消':rows[0].technicianId!==technician.id?'已改由其他技師服務':body.action==='MOVE'?'預約已改期':body.action==='BOOKING'?'新增預約':body.action==='RESTORE'?'預約已恢復':undefined;
 const message=body.message??technicianNoticeMessage(store.name,kind,rows,url.toString(),action);
 const frozen=JSON.stringify({...body,recipient,snapshot,message});
 await tx.$executeRaw`UPDATE "BeautyEvent" SET body=${frozen},"customerId"=${person.id} WHERE id=${event.id} AND "storeId"=${store.id}`;
 const id=`beauty:${event.id}`,hash=createHash('sha256').update(id).digest('hex');
 await tx.messageLog.upsert({where:{id},create:{id,storeId:store.id,customerId:person.id,renderedBody:message.altText,status:'PENDING',channel:'LINE'},update:{status:'PENDING',errorMessage:null}});
 const retryKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
 const status=await deliverCourseCardNotification(tx,{id,storeId:store.id,person,messages:[message],retryKey,now,eventCreatedAt:event.createdAt,transactionScoped:true});
 await tx.$executeRaw`UPDATE "BeautyEvent" SET status=${status},attempts=attempts+1 WHERE id=${event.id} AND "storeId"=${store.id}`;
 return status;
}
