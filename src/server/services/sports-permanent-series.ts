import {sportsProductionEnabled} from "../../../scripts/sports-production-scope.mjs";
import {verifySportsPermanentReadiness} from "../../../scripts/sports-permanent-readiness.mjs";
import {sportsSeriesTable,assertSportsPermanentCreationAllowed} from "@/lib/sports-series-storage";
import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {sportsScheduleRule,type SportsScheduleRule} from "@/lib/sports-staging-types";
import {fixedSeriesOccurrenceOnDate,findFixedSeriesConflicts,findOngoingFixedSeriesConflicts,type FixedCourseSeries} from "@/lib/course-series";
import {addTaiwanDuration,toLocalDateStr,parseTaipeiDateTime} from "@/lib/date-utils";
import {AppError} from "@/lib/errors";
import type {Prisma} from "../../../generated/course-client";
import type {CourseActor} from "./course-booking";
type Tx=Prisma.TransactionClient;
export const sportsLearners=z.array(z.object({customerId:z.string(),cardId:z.string().nullable().optional(),stopDate:z.string().optional()}));
export type SportsSeries=FixedCourseSeries&{id:string;storeId:string;templateId:string;nameSnapshot:string;capacity:number;pointCost:number;createdById:string;enrollmentMode:string;learnerSnapshot:unknown;generatedThrough:Date};
export async function readSportsSeries(tx:Pick<Tx,"$queryRaw"|"$queryRawUnsafe">,storeId:string){
 if(!sportsNativePreview(storeId))return [];
 if(sportsProductionEnabled(storeId))await verifySportsPermanentReadiness(sql=>tx.$queryRawUnsafe<Array<Record<string,unknown>>>(sql));
 return tx.$queryRaw<SportsSeries[]>`SELECT * FROM ${sportsSeriesTable(storeId)} WHERE "storeId"=${storeId} AND id LIKE 'sports-series:%'`;
}
export async function assertSportsSeriesFree(tx:Tx,storeId:string,ranges:Array<{startsAt:Date;endsAt:Date}>,resources:{roomId:string;coachId:string},requestKey?:string,frequency?:string,excludedOwnDates?:string[]){
 if(!sportsNativePreview(storeId))return;
 const rules=await readSportsSeries(tx,storeId);
 // Moving selected occurrences must not exempt the rest of their ongoing rule.
 const active=rules.filter(r=>!r.cancelledAt&&(r.requestKey!==requestKey||excludedOwnDates!==undefined))
  .map(r=>r.requestKey===requestKey&&excludedOwnDates!==undefined?{...r,excludedDates:[...new Set([...r.excludedDates,...excludedOwnDates])]}:r);
 if(frequency&&frequency!=="SINGLE"){
  const [sessions,rentals]=await Promise.all([
   tx.courseSession.findMany({where:{storeId,...(requestKey?{requestKey:{not:requestKey}}:{}),cancelledAt:null,releasedAt:null,endsAt:{gt:ranges[0].startsAt},OR:[{roomId:resources.roomId},{coachId:resources.coachId}]},select:{startsAt:true,endsAt:true,roomId:true,coachId:true}}),
   tx.courseRental.findMany({where:{storeId,roomId:resources.roomId,cancelledAt:null,occupiedEndsAt:{gt:ranges[0].startsAt}},select:{occupiedStartsAt:true,occupiedEndsAt:true,roomId:true}}),
  ]);
  const proposed={...resources,...ranges[0],requestKey:requestKey??"",frequency,untilDate:null,excludedDates:[],cancelledAt:null};
  const issue=findOngoingFixedSeriesConflicts(proposed,active,[...sessions,...rentals.map(r=>({startsAt:r.occupiedStartsAt,endsAt:r.occupiedEndsAt,roomId:r.roomId}))])[0];
  if(issue)throw new AppError("CONFLICT",`${issue.date} ${issue.reason}；固定時段尚未建立`);
 }else for(const range of ranges){
  for(const rule of active){
   const conflicts=findFixedSeriesConflicts([rule],[range],resources);
   for(const conflict of conflicts){
    // An exception frees this fixed occurrence, not the entire proposed class.
    // Check every overlap separately so one released date cannot free another.
    const startsAt=conflict.startsAt;
    const endsAt=new Date(startsAt.getTime()+rule.endsAt.getTime()-rule.startsAt.getTime());
    const released=await tx.courseSession.findFirst({where:{storeId,requestKey:rule.requestKey,OR:[{startsAt,endsAt,releasedAt:{not:null}},{rescheduledFromStartsAt:startsAt,rescheduledFromEndsAt:endsAt}]},select:{id:true}});
    if(!released)throw new AppError("CONFLICT","此時段已有持續固定課，請選擇其他時段");
   }
  }
 }
}
export async function persistSportsSeries(tx:Tx,actor:CourseActor,requestKey:string,rule:SportsScheduleRule){
 if(!sportsNativePreview(actor.storeId)||!rule.perpetual)return;
 assertSportsPermanentCreationAllowed(actor.storeId);
 const s=await tx.courseSession.findFirst({where:{storeId:actor.storeId,requestKey},orderBy:{requestIndex:"asc"}});
 if(!s)throw new AppError("NOT_FOUND","固定課不存在");
 const id=`sports-series:${createHash("sha256").update(actor.storeId+":"+requestKey).digest("hex").slice(0,32)}`;
 await tx.$executeRaw`INSERT INTO ${sportsSeriesTable(actor.storeId)} (id,"storeId","requestKey","templateId","nameSnapshot","roomId","coachId","startsAt","endsAt","pointCost",capacity,frequency,"enrollmentMode","learnerSnapshot","generatedThrough","createdById","updatedAt") VALUES (${id},${actor.storeId},${requestKey},${s.templateId},${s.nameSnapshot},${s.roomId},${s.coachId},${s.startsAt},${s.endsAt},${s.pointCost},${s.capacity},${rule.frequency},${rule.enrollment},${JSON.stringify(rule.students)}::jsonb,${toLocalDateStr(s.startsAt)}::date,${actor.userId},NOW()) ON CONFLICT ("storeId","requestKey") DO NOTHING`;
}
/** No card is reserved for an ongoing assigned place. Attendance resolves the current paid card. */
export async function addSportsFixedLearners(tx:Tx,actor:CourseActor,session:{id:string;templateId:string;startsAt:Date;endsAt:Date;pointCost:number;capacity:number},rule:SportsScheduleRule){
 if(!sportsNativePreview(actor.storeId)||!rule.perpetual)throw new AppError("FORBIDDEN","此店尚未開放運動固定課");
 for(const learner of rule.students){
  const customer=await tx.$queryRaw<Array<{name:string}>>`SELECT name FROM "Customer" WHERE id=${learner.customerId} AND "storeId"=${actor.storeId} AND "mergedIntoCustomerId" IS NULL`;
  if(!customer.length)throw new AppError("VALIDATION","學員不屬於本店");
  const duplicate=await tx.courseBooking.findFirst({where:{storeId:actor.storeId,customerId:learner.customerId,status:{not:"CANCELLED"},session:{cancelledAt:null,releasedAt:null,startsAt:{lt:session.endsAt},endsAt:{gt:session.startsAt}}}});
  if(duplicate)throw new AppError("CONFLICT","指定學員同時段已有課程");
  await tx.courseBooking.create({data:{storeId:actor.storeId,sessionId:session.id,customerId:learner.customerId,customerName:customer[0].name,cardId:null,bookingKind:"UNPAID",pointCost:0,operatorUserId:actor.userId,operatorName:actor.name,requestKey:`sports-fixed:${session.id}:${learner.customerId}`}});
 }
}
/** Called only by the guarded Preview calendar action, not by production or music reads. */
export async function materializeSportsMonth(tx:Tx,actor:CourseActor,first:string,last:string){
 if(!sportsNativePreview(actor.storeId))return;
 const rules=await readSportsSeries(tx,actor.storeId);
 for(const series of rules){
  if(series.cancelledAt)continue;
  const learners=sportsLearners.parse(series.learnerSnapshot);
  const source=await tx.$queryRaw<Array<{payload:unknown}>>`SELECT r.payload FROM "SportsStagingSessionRule" r JOIN "CourseSession" s ON s.id=r."sessionId" AND s."storeId"=r."storeId" WHERE r."storeId"=${actor.storeId} AND s."requestKey"=${series.requestKey} ORDER BY s."requestIndex" LIMIT 1`;
  if(!source.length)throw new AppError("CONFLICT","固定課規則不完整，請核對");
  const original=sportsScheduleRule.parse(source[0].payload);
  for(let date=first;date<=last;date=addTaiwanDuration(date,1,"DAY")){
   const range=fixedSeriesOccurrenceOnDate(series,date);if(!range)continue;
   const index=Math.round((Date.parse(date+"T12:00:00Z")-Date.parse(toLocalDateStr(series.startsAt)+"T12:00:00Z"))/86400000)/(series.frequency==="BIWEEKLY"?14:7);
   if(await tx.courseSession.findUnique({where:{storeId_requestKey_requestIndex:{storeId:actor.storeId,requestKey:series.requestKey,requestIndex:index}}}))continue;
   await assertSportsSeriesFree(tx,actor.storeId,[range],series,series.requestKey);
   const conflict=await tx.courseSession.findFirst({where:{storeId:actor.storeId,cancelledAt:null,releasedAt:null,startsAt:{lt:range.endsAt},endsAt:{gt:range.startsAt},OR:[{roomId:series.roomId},{coachId:series.coachId}]}});
   const rental=await tx.courseRental.findFirst({where:{storeId:actor.storeId,roomId:series.roomId,cancelledAt:null,occupiedStartsAt:{lt:range.endsAt},occupiedEndsAt:{gt:range.startsAt}}});
   if(conflict||rental)throw new AppError("CONFLICT",`${date} 固定課時段有衝突，請先處理`);
   const s=await tx.courseSession.create({data:{...range,storeId:actor.storeId,templateId:series.templateId,nameSnapshot:series.nameSnapshot,roomId:series.roomId,coachId:series.coachId,pointCost:series.pointCost,capacity:series.capacity,requestKey:series.requestKey,requestIndex:index,createdById:series.createdById}});
   const {attachSportsSessionRules}=await import("./sports-staging-schedule");
   await attachSportsSessionRules(tx,actor,series.requestKey,{...original,students:learners.filter(l=>!l.stopDate||date<l.stopDate).map(l=>({customerId:l.customerId,cardId:null}))},[s.id]);
  }
 }
}
export async function bindSportsAttendanceCard(tx:Tx,actor:CourseActor,bookingId:string){
 const b=await tx.courseBooking.findFirst({where:{id:bookingId,storeId:actor.storeId},include:{session:true}});
 if(!b||b.cardId||!(b.bookingKind==="UNPAID"&&(b.requestKey.startsWith("sports-fixed:")||b.requestKey.startsWith("sports-makeup:"))))return;
 if(!sportsNativePreview(actor.storeId)||actor.customerId)throw new AppError("FORBIDDEN","固定課點名僅限本店授權人員");
 const [rule]=await tx.$queryRaw<Array<{planId:string|null}>>`SELECT "planId" FROM "SportsStagingSessionRule" WHERE "storeId"=${actor.storeId} AND "sessionId"=${b.sessionId}`;
 const cards=await tx.coursePointCard.findMany({where:{storeId:actor.storeId,...(rule?.planId?{planId:rule.planId}:{}),closedAt:null,expiresAt:{gte:b.session.startsAt},members:{some:{customerId:b.customerId!}},OR:[{templateIds:{isEmpty:true}},{templateIds:{has:b.session.templateId}}]},include:{bookings:{where:{status:"RESERVED"},select:{pointCost:true}}},orderBy:[{expiresAt:"asc"},{id:"asc"}]});
 const card=cards.find(c=>c.remaining-c.bookings.reduce((n,b)=>n+b.pointCost,0)>=(c.unit==="SESSION"?1:b.session.pointCost));
 if(!card)throw new AppError("VALIDATION","學員沒有適用且足額的有效方案；尚未扣堂，請先購買或續課");
 await tx.courseBooking.update({where:{id:b.id},data:{cardId:card.id,bookingKind:"CARD",...(b.requestKey.startsWith("sports-makeup:")?{makeupForBookingId:b.requestKey.split(":")[1]}:{}),pointCost:card.unit==="SESSION"?1:b.session.pointCost}});
}

/** Existing/cancelled/moved occurrences count as generated; never resurrect an exception. */
export async function ensureSportsMonth(actor:CourseActor,first:string,last:string){
 if(!sportsNativePreview(actor.storeId))return;
 const {coursePrisma}=await import("@/lib/course-db");
 // Reconcile previously recorded no-shows in this visible range, without
 // touching debit entries, makeup credit, or any other tenant.
 const releasedCandidates=await coursePrisma.courseSession.findMany({where:{storeId:actor.storeId,cancelledAt:null,releasedAt:null,startsAt:{gte:parseTaipeiDateTime(first,"00:00")!,lt:parseTaipeiDateTime(addTaiwanDuration(last,1,"DAY"),"00:00")!},bookings:{some:{status:"NO_SHOW"},none:{status:{notIn:["CANCELLED","NO_SHOW"]}}}},select:{id:true}});
 if(releasedCandidates.length){const {courseTransaction}=await import("./course-access");const {syncCourseRelease}=await import("./course-booking");await courseTransaction(actor.storeId,async tx=>{for(const s of releasedCandidates)await syncCourseRelease(tx,actor.storeId,s.id);});}
 const rules=await readSportsSeries(coursePrisma,actor.storeId);
 let missing=false;
 for(const series of rules){
  const indexes:number[]=[];
  for(let date=first;date<=last;date=addTaiwanDuration(date,1,"DAY"))if(fixedSeriesOccurrenceOnDate(series,date))indexes.push(Math.round((Date.parse(date+"T12:00:00Z")-Date.parse(toLocalDateStr(series.startsAt)+"T12:00:00Z"))/86400000)/(series.frequency==="BIWEEKLY"?14:7));
  if(indexes.length&&await coursePrisma.courseSession.count({where:{storeId:actor.storeId,requestKey:series.requestKey,requestIndex:{in:indexes}}})!==indexes.length){missing=true;break;}
 }
 if(missing){const {courseTransaction}=await import("./course-access");await courseTransaction(actor.storeId,tx=>materializeSportsMonth(tx,actor,first,last));}
}
