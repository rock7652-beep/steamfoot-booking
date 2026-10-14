import "server-only";
import { z } from "zod";
import { coursePrisma } from "@/lib/course-db";
import { AppError } from "@/lib/errors";
import { musicOpeningMakeupHash } from "@/lib/music-opening-makeup";
import { musicOpeningImportSchema, planVerifiedMusicOpeningImport } from "@/lib/music-opening-import";
import { musicCourseExpiry } from "@/lib/music-course-products";
import { sourceStudentMarker } from "@/lib/music-source-import";
import { authorizeMusicSourceImport } from "./music-source-import";
import { courseManager } from "./course-access";
import { importOpeningMakeupInTransaction } from "./music-opening-makeup-import";
import { lockCourseStore } from "./course-store-lock";
import { PILOT_EVIDENCE_HASH, PILOT_EVIDENCE_ID, PILOT_RECEIPT_ID } from "./music-pilot-policy";
import type { Prisma } from "../../../generated/course-client";

const key = z.string().min(1).max(200);
const payloadSchema = z.object({
  version:z.literal(1),cutoff:z.literal("2026-10-14"),capturedAt:z.string().datetime(),
  students:z.array(z.object({id:key,customerId:key,name:key})).length(10),
  histories:z.array(z.object({studentId:key,fees:z.unknown(),tabs:z.unknown()})).length(10),
  groups:z.array(z.object({studentId:key,cardId:key,planId:key,templateId:key,remaining:z.literal(8),validDays:z.literal(70),firstSessionId:key,tuition:z.literal(3420),paid:z.literal(3420)})).length(6),
  sessions:z.array(z.object({key,id:key,date:key,startsAt:z.string().datetime(),endsAt:z.string().datetime(),roomId:key,coachId:key,templateId:key,isTrial:z.boolean(),capacity:z.number().int().min(1).max(6),students:z.array(key).min(1).max(4)})).length(28),
  opening:musicOpeningImportSchema,proof:z.object({sourceManifestKey:key,sourceRevision:key,contentHash:key,now:z.string(),maxAgeMs:z.number()}),
  calendarEvidence:z.unknown(),rules:z.object({leave:z.literal("DEDUCT_AND_SEPARATE_MAKEUP"),noShow:z.literal("DEDUCT_ONLY"),makeupExpiry:z.literal("ORIGINAL_EXPIRY"),groupValidityDays:z.literal(70),privateSharedExpiry:z.literal("2027-02-25"),teacherAliasConfirmed:z.literal(true)}),
}).strict();
type Payload=z.infer<typeof payloadSchema>;
type Result={cardIds:string[];sessionIds:string[];bookingIds:string[];ordinaryRemaining:number;makeupRights:number;contentHash:string};
function fail(message:string):never {throw new AppError("VALIDATION",message);}
async function authorize() {
  const actor=await authorizeMusicSourceImport();
  for(const p of ["booking.create","staff.manage","plans.edit"] as const){const access=await courseManager(p);if(access.storeId!==actor.storeId||access.user.id!==actor.userId)fail("測試匯入操作範圍不一致");}
  return actor;
}
async function evidence(tx:Prisma.TransactionClient,storeId:string):Promise<Payload>{
  const rows=await tx.$queryRaw<Array<{payload:unknown;contentHash:string}>>`SELECT payload,"contentHash" FROM "MusicSourceImportBatch" WHERE id=${PILOT_EVIDENCE_ID} AND "storeId"=${storeId}`;
  if(rows.length!==1||rows[0].contentHash!==PILOT_EVIDENCE_HASH||musicOpeningMakeupHash(rows[0].payload)!==PILOT_EVIDENCE_HASH)fail("尚未取得本次已核對的來源證據");
  return payloadSchema.parse(rows[0].payload);
}
async function sideEffects(tx:Prisma.TransactionClient,storeId:string){
  return tx.$queryRaw<Array<{kind:string;n:number}>>`
    SELECT 'purchase' kind,count(*)::int n FROM "CoursePurchase" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'payment',count(*)::int FROM "CourseFeePayment" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'transaction',count(*)::int FROM "Transaction" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'message',count(*)::int FROM "MessageLog" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'coach',count(*)::int FROM "CourseCoachNotification" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'monthly',count(*)::int FROM "CourseMonthlyNotification" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'manager',count(*)::int FROM "ManagerNotificationLog" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'balance',count(*)::int FROM "SessionBalanceNotification" WHERE "storeId"=${storeId}
    UNION ALL SELECT 'outbox',count(*)::int FROM "OperationAuditOutbox" WHERE payload->>'storeId'=${storeId}
    ORDER BY kind`;
}
export async function commitMusicOperationalPilot(){
  const actor=await authorize();
  return coursePrisma.$transaction(async tx=>{
    await lockCourseStore(tx,actor.storeId);
    const data=await evidence(tx,actor.storeId);
    const prior=await tx.$queryRaw<Array<{afterJson:Result}>>`SELECT "afterJson" FROM "AuditLog" WHERE id=${PILOT_RECEIPT_ID} AND "storeId"=${actor.storeId} AND action='SOURCE_OPERATIONS_IMPORT'`;
    if(prior.length){if(prior.length!==1||prior[0].afterJson.contentHash!==PILOT_EVIDENCE_HASH)fail("已有不同內容的匯入紀錄");return {duplicate:true,result:prior[0].afterJson};}
    const opening=planVerifiedMusicOpeningImport(data.opening,{...data.proof,now:new Date().toISOString()});
    if(opening.status!=="READY")fail("期初核對未通過："+opening.issue);
    if(opening.ordinary.scope.cutoffBusinessDate!==data.cutoff)fail("切點與已核對證據不符");
    const before=await sideEffects(tx,actor.storeId);
    for(const s of data.students){
      const customers=await tx.$queryRaw<Array<{id:string;name:string}>>`SELECT id,name FROM "Customer" WHERE id=${s.customerId} AND "storeId"=${actor.storeId} AND "serviceNote"=${sourceStudentMarker(s.id)} AND "mergedIntoCustomerId" IS NULL AND "userId" IS NULL AND "lineUserId" IS NULL`;
      if(customers.length!==1||customers[0].name!==s.name)fail("學生來源映射已變動");
    }
    const ids=[...new Set(data.sessions.map(s=>s.templateId))];
    const templates=await tx.courseTemplate.findMany({where:{storeId:actor.storeId,id:{in:ids},isActive:true}});
    if(templates.length!==3||templates.some(t=>t.musicTeacherShare!==null))fail("課程映射或未核對鐘點設定已變動");
    const plans=[{id:"yjy-pilot-plan-group8",name:"音教雲樣本・吉他團班 8 堂",points:8,price:3420,validDays:70,templateId:"music-demo-guitar-group450",sizes:[8]},
      {id:"yjy-pilot-plan-private16",name:"音教雲樣本・吉他個別 4 期",points:16,price:12800,validDays:140,templateId:"music-luby-tpl-private-acoustic",sizes:[4,4,4,4]}];
    for(const p of plans)await tx.coursePointPlan.create({data:{id:p.id,storeId:actor.storeId,name:p.name,points:p.points,price:p.price,validDays:p.validDays,unit:"SESSION",templateIds:[p.templateId],allowShared:false,customerPurchasable:false,musicTerms:p.sizes.length,musicTermSizes:p.sizes}});
    const cardIds:string[]=[];
    for(const g of data.groups){
      const first=data.sessions.find(s=>s.id===g.firstSessionId&&s.students.includes(g.studentId));if(!first)fail("首次排課來源缺漏");
      await tx.coursePointCard.create({data:{id:g.cardId,storeId:actor.storeId,planId:g.planId,nameSnapshot:plans[0].name,remaining:8,unit:"SESSION",templateIds:[g.templateId],requestKey:g.cardId,musicTermSizes:[8],musicValidityDays:70,musicActivatedAt:null,musicJoinSessionId:first.id,expiresAt:musicCourseExpiry(new Date(first.startsAt),70),members:{create:{customerId:data.students.find(s=>s.id===g.studentId)!.customerId}}}});
      cardIds.push(g.cardId);
    }
    for(const entry of opening.ordinary.entries){
      const item=data.opening.enrollments.find(e=>e.record.sourceRecordKey===entry.record.sourceRecordKey)!;
      const r=item.record,cardId="yjy-pilot-card:"+r.sourceStudentKey;
      await tx.coursePointCard.create({data:{id:cardId,storeId:actor.storeId,planId:item.mapping.planId,nameSnapshot:plans[1].name,remaining:r.balance.remainingAtCutoff,unit:"SESSION",templateIds:[item.mapping.templateId],requestKey:cardId,expiresAt:new Date(r.expiresAt!),musicActivatedAt:new Date(r.activatedAt!),musicTermSizes:r.terms.map(t=>t.totalLessons),musicOpeningStateRequired:true,members:{create:{customerId:item.mapping.customerId}}}});
      await tx.courseMusicOpeningState.create({data:{storeId:actor.storeId,cardId,customerId:item.mapping.customerId,sourceKey:entry.key,contentHash:entry.contentHash,snapshot:{scope:opening.ordinary.scope,record:r} as unknown as Prisma.InputJsonValue,appliedBatchId:data.opening.makeup.batchId,teacherFeePolicy:"UNVERIFIED"}});cardIds.push(cardId);
    }
    await importOpeningMakeupInTransaction(tx,actor,data.opening.makeup,opening.makeupVerification,data.opening.enrollments.map(e=>e.record.sourceRecordKey));
    // Only the teaching identity becomes schedulable. The suspended CUSTOMER
    // login, credentials, staff permissions and LINE identities are untouched.
    const li=await tx.$queryRaw<Array<{status:string;userStatus:string;userRole:string}>>`SELECT s.status::text,u.status::text AS "userStatus",u.role::text AS "userRole" FROM "Staff" s JOIN "User" u ON u.id=s."userId" WHERE s.id='music-luby-staff-li' AND s."storeId"=${actor.storeId}`;
    if(li.length!==1||li[0].userStatus!=="SUSPENDED"||li[0].userRole!=="CUSTOMER"||!["ACTIVE","INACTIVE"].includes(li[0].status))fail("教師業務身份與停用登入狀態未通過核對");
    await tx.$executeRaw`UPDATE "Staff" SET status='ACTIVE',"updatedAt"=NOW() WHERE id='music-luby-staff-li' AND "storeId"=${actor.storeId}`;
    const bookingIds:string[]=[],sessionIds:string[]=[];
    const ordinals=new Map<string,number>();
    for(let i=0;i<data.sessions.length;i++){
      const s=data.sessions[i],template=templates.find(t=>t.id===s.templateId)!;
      const conflict=await tx.courseSession.findFirst({where:{storeId:actor.storeId,cancelledAt:null,releasedAt:null,startsAt:{lt:new Date(s.endsAt)},endsAt:{gt:new Date(s.startsAt)},OR:[{roomId:s.roomId},{coachId:s.coachId}]},select:{id:true}});if(conflict)fail("測試站老師或教室已有重疊排課");
      const refs=await tx.$queryRaw<Array<{ok:boolean}>>`SELECT EXISTS(SELECT 1 FROM "Staff" WHERE id=${s.coachId} AND "storeId"=${actor.storeId} AND status='ACTIVE' AND "courseCoachEnabled" AND "courseQualificationsConfirmed" AND ${s.templateId}=ANY("courseQualifiedTemplateIds")) AND EXISTS(SELECT 1 FROM "CourseRoom" WHERE id=${s.roomId} AND "storeId"=${actor.storeId} AND "isActive") AS ok`;
      if(refs.length!==1||!refs[0].ok)fail("老師或教室映射未通過核對");
      await tx.courseSession.create({data:{id:s.id,storeId:actor.storeId,templateId:s.templateId,roomId:s.roomId,coachId:s.coachId,nameSnapshot:template.name,startsAt:new Date(s.startsAt),endsAt:new Date(s.endsAt),pointCost:1,capacity:s.capacity,isTrial:s.isTrial,requestKey:PILOT_RECEIPT_ID,requestIndex:i,createdById:actor.userId,teacherNote:"音教雲十人樣本；授課費尚未核對；團班僅銜接本次選定學生"}});sessionIds.push(s.id);
      await tx.$executeRaw`UPDATE "CourseSession" SET "scheduleType"=${s.isTrial?"TRIAL":s.templateId===plans[1].templateId?"FIXED":"SINGLE"},"scheduleFrequency"=${s.templateId===plans[1].templateId?"WEEKLY":"NONE"},"enrollmentMode"='ASSIGNED' WHERE id=${s.id} AND "storeId"=${actor.storeId}`;
      for(const studentId of s.students){
        const student=data.students.find(st=>st.id===studentId)!;const cardId=s.isTrial?null:"yjy-pilot-card:"+studentId;
        const imported=data.opening.enrollments.find(e=>e.record.sourceStudentKey===studentId);const n=ordinals.get(studentId)??0;const slot=imported?.record.ordinarySourceSlots?.[n];ordinals.set(studentId,n+1);
        const bookingId="yjy-pilot-booking:"+musicOpeningMakeupHash([s.id,studentId]).slice(0,32);
        await tx.courseBooking.create({data:{id:bookingId,storeId:actor.storeId,sessionId:s.id,cardId,customerId:student.customerId,customerName:student.name,operatorUserId:actor.userId,operatorName:actor.name,pointCost:s.isTrial?0:1,status:"RESERVED",requestKey:bookingId,bookingKind:s.isTrial?"TRIAL":"CARD",trialPrice:s.isTrial?0:null,notes:"音教雲已核對樣本；來源付款與歷史簽到於樣本核對頁查看",...(slot?{musicOpeningTermKey:slot.sourceTermKey,musicOpeningLessonOrdinal:slot.originalLessonOrdinal,musicOpeningSourceLessonKey:slot.sourceLessonKey}:{})}});
        if(cardId)await tx.coursePointEntry.create({data:{storeId:actor.storeId,cardId,bookingId,kind:"RESERVE",points:1,actorUserId:actor.userId}});bookingIds.push(bookingId);
      }
    }
    const cards=await tx.coursePointCard.findMany({where:{storeId:actor.storeId,id:{in:cardIds}},include:{members:true}});
    if(cards.length!==7||cards.reduce((n,c)=>n+c.remaining,0)!==63||cards.some(c=>c.members.length!==1))fail("堂數讀回核對失敗");
    const bookings=await tx.courseBooking.findMany({where:{storeId:actor.storeId,id:{in:bookingIds}}});
    if(bookings.length!==46||bookings.filter(b=>b.bookingKind==="TRIAL").length!==1||bookings.some(b=>b.status!=="RESERVED"))fail("預約讀回核對失敗");
    if(musicOpeningMakeupHash(before)!==musicOpeningMakeupHash(await sideEffects(tx,actor.storeId)))fail("匯入產生非預期的帳務或通知");
    const result:Result={cardIds,sessionIds,bookingIds,ordinaryRemaining:63,makeupRights:1,contentHash:PILOT_EVIDENCE_HASH};
    await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","actorNameSnapshot","storeId",module,"targetType","targetId",action,summary,"afterJson","createdAt") VALUES (${PILOT_RECEIPT_ID},${actor.userId},${actor.name},${actor.storeId},'MUSIC','MusicOperationalImport',${PILOT_EVIDENCE_ID},'SOURCE_OPERATIONS_IMPORT','音教雲十人樣本：已核對堂數、未來排課及獨立補課；歷史帳務不重入營收',${JSON.stringify(result)}::jsonb,NOW())`;
    return {duplicate:false,result};
  },{isolationLevel:"Serializable",timeout:30000});
}

export async function readMusicOperationalPilot(){
  const actor=await authorize();
  return coursePrisma.$transaction(async tx=>{
    const payload=await evidence(tx,actor.storeId);
    const imported=await tx.$queryRaw<Array<{afterJson:Result}>>`SELECT "afterJson" FROM "AuditLog" WHERE id=${PILOT_RECEIPT_ID} AND "storeId"=${actor.storeId}`;
    const cards=await tx.coursePointCard.findMany({where:{storeId:actor.storeId,OR:[{id:{in:imported[0]?.afterJson.cardIds??[]}},{requestKey:{startsWith:"yjy-pilot-makeup:"}}]},include:{members:true}});
    const bookings=await tx.courseBooking.findMany({where:{storeId:actor.storeId,customerId:{in:payload.students.map(s=>s.customerId)},session:{startsAt:{gte:new Date("2026-10-13T16:00:00Z")}}},include:{session:true},orderBy:{session:{startsAt:"asc"}}});
    return {payload,imported:!!imported.length,cards:cards.map(c=>({id:c.id,name:c.nameSnapshot,remaining:c.remaining,expiresAt:c.expiresAt?.toISOString()??null,activated:!!c.musicActivatedAt,closed:!!c.closedAt,customerId:c.members[0]?.customerId,makeup:c.requestKey.startsWith("yjy-pilot-makeup:")})),bookings:bookings.map(b=>({id:b.id,customerId:b.customerId,sessionId:b.sessionId,date:b.session.startsAt.toISOString(),status:b.status,absenceKind:b.absenceKind,kind:b.bookingKind,name:b.session.nameSnapshot}))};
  },{isolationLevel:"RepeatableRead",timeout:15000});
}
