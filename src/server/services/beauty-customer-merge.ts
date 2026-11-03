import 'server-only';
import type {Prisma} from '@prisma/client';
import {AppError} from '@/lib/errors';
import {toLocalDateStr} from '@/lib/date-utils';
import {beautyCareId} from '@/lib/beauty/care-id';
import {beautyPlanPreferenceId,beautyPlanStopped} from '@/lib/beauty/reminders';

/** Same Store lock as bookings and card commands, held by the existing merge transaction. */
export async function lockBeautyCustomerMerge(tx:Prisma.TransactionClient,storeId:string){
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='BEAUTY' AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
 if(rows.length!==1)throw new AppError('FORBIDDEN','美業店家已停用或模組已變更');
}
/** Move identity references, never financial amounts, balances, rate or person-name snapshots. */
export async function moveBeautyCustomerRelations(tx:Prisma.TransactionClient,storeId:string,sourceId:string,targetId:string){
 const overlaps=await tx.$queryRaw<{id:string}[]>`SELECT a.id FROM "BeautyAppointment" a JOIN "BeautyAppointment" b ON a."storeId"=b."storeId" AND a."customerId"=${sourceId} AND b."customerId"=${targetId} AND a."startsAt"<b."endsAt" AND b."startsAt"<a."endsAt" WHERE a."storeId"=${storeId} AND a.status='RESERVED' AND b.status='RESERVED' LIMIT 1`;
 if(overlaps.length)throw new AppError('CONFLICT','兩筆顧客有重疊的待服務預約，請先核對；尚未合併');
 const [rebinds,reviews,uncertain,events]=await Promise.all([
  tx.lineRebindRequest.count({where:{storeId,customerId:{in:[sourceId,targetId]},status:{in:['PENDING_CAPTURE','CANDIDATE_CAPTURED']}}}),
  tx.centralMemberLinkReviewRequest.count({where:{storeId,customerId:{in:[sourceId,targetId]},status:'PENDING'}}),
  tx.messageLog.count({where:{storeId,customerId:{in:[sourceId,targetId]},status:{in:['PENDING','FAILED']}}}),
  tx.$queryRaw<{id:string}[]>`SELECT id FROM "BeautyEvent" WHERE "storeId"=${storeId} AND "customerId" IN (${sourceId},${targetId}) AND status IN ('PENDING','FAILED','SENDING') LIMIT 1`,
 ]);
 if(rebinds||reviews||uncertain||events.length)throw new AppError('CONFLICT','顧客仍有身分審核或通知結果待確認，請先處理後再合併');
 const cards=await tx.$queryRaw<{id:string;expiresAt:Date}[]>`SELECT id,"expiresAt" FROM "BeautyCard" WHERE "storeId"=${storeId} AND ("customerId"=${sourceId} OR ${sourceId}=ANY("memberIds"))`;
 const prefix=`beauty-care-kind:${encodeURIComponent(storeId)}:`;
 const notifications=await tx.messageLog.findMany({where:{storeId,customerId:sourceId,templateId:{startsWith:prefix}},select:{id:true,templateId:true,renderedBody:true}});
 const markers=notifications.map(log=>{
  const kind=log.templateId!.slice(prefix.length);
  const subjects=kind.startsWith('TRIAL_CARE:')?['trial-care']:cards.flatMap(card=>kind.startsWith('PLAN_EXPIRY:')?[...new Set([toLocalDateStr(card.expiresAt),...((log.renderedBody??'').match(/\d{4}-\d{2}-\d{2}/g)??[])])].map(date=>`${card.id}:${date}`):[card.id]);
  const subject=subjects.find(subject=>beautyCareId(storeId,sourceId,subject,kind)===log.id);
  if(!subject)throw new AppError('CONFLICT','來源顧客的提醒去重紀錄無法核對，尚未合併');
  return {id:beautyCareId(storeId,targetId,subject,kind),sourceId:log.id};
 });
 // A SKIPPED marker prevents a merged identity from receiving the same reminder again.
 // Original sent records remain intact and are moved by the common customer merge.
 for(const marker of markers)await tx.messageLog.upsert({where:{id:marker.id},create:{id:marker.id,storeId,customerId:targetId,channel:'LINE',status:'SKIPPED',renderedBody:`顧客合併保留去重：${marker.sourceId}`},update:{}});
 const [fromPreference,toPreference]=await Promise.all([tx.messageTemplate.findFirst({where:{id:beautyPlanPreferenceId(storeId,sourceId),storeId},select:{body:true}}),tx.messageTemplate.findFirst({where:{id:beautyPlanPreferenceId(storeId,targetId),storeId},select:{body:true}})]);
 if(fromPreference){const id=beautyPlanPreferenceId(storeId,targetId),body=beautyPlanStopped(fromPreference.body)||beautyPlanStopped(toPreference?.body)?'stopped':'receiving';await tx.messageTemplate.upsert({where:{id},create:{id,storeId,name:'美業方案提醒偏好',channel:'LINE',body},update:{body}});}
 await tx.$executeRaw`INSERT INTO "TrialCarePreference" (id,"storeId","customerId",token,"stoppedAt","lastEventAt","createdAt") SELECT ${crypto.randomUUID()},"storeId",${targetId},${crypto.randomUUID()},"stoppedAt","lastEventAt","createdAt" FROM "TrialCarePreference" WHERE "storeId"=${storeId} AND "customerId"=${sourceId} ON CONFLICT ("storeId","customerId") DO UPDATE SET "stoppedAt"=COALESCE("TrialCarePreference"."stoppedAt",EXCLUDED."stoppedAt"),"lastEventAt"=GREATEST("TrialCarePreference"."lastEventAt",EXCLUDED."lastEventAt")`;
 await tx.$executeRaw`UPDATE "TrialCareLog" a SET "customerId"=${targetId} WHERE a."storeId"=${storeId} AND a."customerId"=${sourceId} AND a.module='BEAUTY' AND NOT EXISTS (SELECT 1 FROM "TrialCareLog" b WHERE b."storeId"=a."storeId" AND b."customerId"=${targetId} AND b.stage=a.stage)`;
 const members=await tx.$executeRaw`UPDATE "BeautyCard" SET "memberIds"=ARRAY(SELECT DISTINCT CASE WHEN m=${sourceId} THEN ${targetId} ELSE m END FROM unnest("memberIds") AS m),"customerId"=CASE WHEN "customerId"=${sourceId} THEN ${targetId} ELSE "customerId" END WHERE "storeId"=${storeId} AND ("customerId"=${sourceId} OR ${sourceId}=ANY("memberIds"))`;
 const bookings=await tx.$executeRaw`UPDATE "BeautyAppointment" SET "customerId"=${targetId},revision=revision+1 WHERE "storeId"=${storeId} AND "customerId"=${sourceId}`;
 const groups=await tx.$executeRaw`UPDATE "BeautyGroup" SET "customerId"=${targetId} WHERE "storeId"=${storeId} AND "customerId"=${sourceId}`;
 const purchases=await tx.$executeRaw`UPDATE "BeautyPurchase" SET "customerId"=${targetId} WHERE "storeId"=${storeId} AND "customerId"=${sourceId}`;
 await tx.$executeRaw`UPDATE "BeautyEvent" SET "customerId"=${targetId} WHERE "storeId"=${storeId} AND "customerId"=${sourceId}`;
 const health=await tx.customerHealthRecord.updateMany({where:{storeId,customerId:sourceId},data:{customerId:targetId}});
 const [schema]=await tx.$queryRaw<{available:boolean}[]>`SELECT to_regclass('public."CustomerHealthHistoryGrant"') IS NOT NULL AS available`;
 const healthGrants=schema?.available?await tx.customerHealthHistoryGrant.updateMany({where:{targetStoreId:storeId,targetCustomerId:sourceId},data:{targetCustomerId:targetId}}):{count:0};
 await tx.$executeRaw`UPDATE "Customer" SET "mergedIntoCustomerId"=${targetId} WHERE "storeId"=${storeId} AND "mergedIntoCustomerId"=${sourceId}`;
 return {beautyMembers:members,beautyBookings:bookings,beautyGroups:groups,beautyPurchases:purchases,healthRecords:health.count,healthGrants:healthGrants.count};
}
