"use server";
import {sportsSeriesTable} from "@/lib/sports-series-storage";
import {z} from "zod";
import {courseManager,courseTransaction} from "@/server/services/course-access";
import {coursePrisma} from "@/lib/course-db";
import {prisma} from "@/lib/db";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {addTaiwanDuration,parseTaipeiDateTime,toLocalDateStr} from "@/lib/date-utils";
import {AppError,handleActionError} from "@/lib/errors";
import {ensureSportsMonth,readSportsSeries,sportsLearners} from "@/server/services/sports-permanent-series";
import {cancelCourseWaitlistForSession} from "@/server/services/course-waitlist";
import {reserveCourseInTransaction,settleCourseBooking} from "@/server/services/course-booking";
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>!!parseTaipeiDateTime(d,"00:00"));
async function actor(permission:Parameters<typeof courseManager>[0]){
 const a=await courseManager(permission);if(!sportsNativePreview(a.storeId)||!await prisma.storeFeatureEntitlement.findFirst({where:{storeId:a.storeId,featureKey:"business.fitness",status:"ENABLED"}}))throw new AppError("FORBIDDEN","此店尚未開放運動固定課");
 if(process.env.VERCEL_ENV==="production")await coursePrisma.$transaction(tx=>(import("@/server/services/sports-production-readiness")).then(m=>m.assertSportsProductionReady(tx,a.storeId)));
 return {storeId:a.storeId,userId:a.user.id,name:a.user.name??"門市人員"};
}
export async function syncSportsPermanentCalendar(input:unknown){try{
 const day=date.parse(input),a=await actor("booking.create");
 const first=addTaiwanDuration(day.slice(0,7)+"-01",-6,"DAY"),last=addTaiwanDuration(addTaiwanDuration(day.slice(0,7)+"-01",1,"MONTH"),5,"DAY");
 const warning=await ensureSportsMonth(a,first,last);return {success:true as const,warning:warning??null};
 }catch(e){return handleActionError(e);}}
export async function loadSportsSeriesPanel(sessionId:string){try{
 z.string().min(1).max(100).parse(sessionId);const a=await actor("booking.read");
 const session=await coursePrisma.courseSession.findFirst({where:{id:sessionId,storeId:a.storeId},select:{requestKey:true,templateId:true}});if(!session)throw new AppError("NOT_FOUND","課程不存在");
 const rules=await readSportsSeries(coursePrisma,a.storeId),series=rules.find(r=>r.requestKey===session.requestKey);
 const [customers,missing,targets]=await Promise.all([
  prisma.customer.findMany({where:{storeId:a.storeId,mergedIntoCustomerId:null},select:{id:true,name:true}}),
  coursePrisma.courseBooking.findMany({where:{storeId:a.storeId,AND:[{OR:[{requestKey:{startsWith:"sports-fixed:"}},{requestKey:{startsWith:"sports-makeup:"}}]}],OR:[{status:"NO_SHOW"},{status:"CANCELLED",absenceKind:{in:["STUDENT_LEAVE","TEACHER_ABSENT"]}}],session:{templateId:session.templateId}},include:{session:{select:{startsAt:true,requestKey:true}}},orderBy:{session:{startsAt:"asc"}}}),
  coursePrisma.courseSession.findMany({where:{storeId:a.storeId,templateId:session.templateId,cancelledAt:null,releasedAt:null,startsAt:{gt:new Date()}},select:{id:true,nameSnapshot:true,startsAt:true},orderBy:{startsAt:"asc"},take:200}),

 ]);
 const used=await coursePrisma.courseBooking.findMany({where:{storeId:a.storeId,makeupForBookingId:{in:missing.map(b=>b.id)},status:{not:"CANCELLED"}},select:{makeupForBookingId:true}});
 const deferred=await coursePrisma.courseBooking.findMany({where:{storeId:a.storeId,requestKey:{startsWith:"sports-makeup:"},OR:[{status:{not:"CANCELLED"}},{absenceKind:{in:["STUDENT_LEAVE","TEACHER_ABSENT"]}}]},select:{requestKey:true}});
 // The action guards every write; this reader returns no balances or private card IDs.
 return {success:true as const,data:{series:series?{id:series.id,active:!series.cancelledAt,learners:sportsLearners.parse(series.learnerSnapshot).map(l=>({customerId:l.customerId,name:customers.find(c=>c.id===l.customerId)?.name??"學員",stopDate:l.stopDate})),untilDate:series.untilDate?toLocalDateStr(series.untilDate):null}:null,pending:missing.filter(b=>!used.some(u=>u.makeupForBookingId===b.id)&&!deferred.some(d=>d.requestKey.startsWith(`sports-makeup:${b.id}:`))).map(b=>({id:b.id,name:b.customerName,date:toLocalDateStr(b.session.startsAt),status:b.status})),targets:targets.map(t=>({...t,startsAt:t.startsAt.toISOString()}))}};
 }catch(e){return handleActionError(e);}}
export async function stopSportsLearner(input:unknown){try{
 const d=z.object({seriesId:z.string().min(1),customerId:z.string().min(1),effectiveDate:date}).parse(input),a=await actor("booking.update");
 if(d.effectiveDate<toLocalDateStr())throw new AppError("VALIDATION","停課生效日期不能早於今天");
 await courseTransaction(a.storeId,async tx=>{
  const series=(await readSportsSeries(tx,a.storeId)).find(s=>s.id===d.seriesId);if(!series||series.cancelledAt)throw new AppError("NOT_FOUND","找不到有效固定課");
  const learners=sportsLearners.parse(series.learnerSnapshot),learner=learners.find(l=>l.customerId===d.customerId);if(!learner)throw new AppError("NOT_FOUND","學員不屬於此固定課");
  if(learner.stopDate){if(learner.stopDate===d.effectiveDate)return;throw new AppError("CONFLICT","學員已有停課日期，請重新核對");}
  const bookings=await tx.courseBooking.findMany({where:{storeId:a.storeId,customerId:d.customerId,session:{requestKey:series.requestKey,startsAt:{gte:parseTaipeiDateTime(d.effectiveDate,"00:00")!}},status:{not:"CANCELLED"}},select:{id:true,status:true,bookingKind:true,cardId:true}});
  if(bookings.some(b=>b.status!=="RESERVED"))throw new AppError("CONFLICT","生效日期後已有點名紀錄，請先核對");
  const deferred=bookings.filter(b=>b.bookingKind==="UNPAID"&&!b.cardId);
  if(deferred.length)await tx.courseBooking.updateMany({where:{storeId:a.storeId,id:{in:deferred.map(b=>b.id)},status:"RESERVED"},data:{status:"CANCELLED",absenceKind:null}});
  for(const b of bookings.filter(b=>!deferred.some(d=>d.id===b.id)))await settleCourseBooking(tx,a,b.id,"CANCELLED");
  learner.stopDate=d.effectiveDate;
  await tx.$executeRaw`UPDATE ${sportsSeriesTable(a.storeId)} SET "learnerSnapshot"=${JSON.stringify(learners)}::jsonb,"updatedAt"=NOW() WHERE id=${series.id} AND "storeId"=${a.storeId}`;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","storeId",module,summary,"targetType","targetId",action,"createdAt") VALUES (${crypto.randomUUID()},${a.userId},${a.storeId},'COURSE','固定課學員停課，保留歷史缺課及補課','CourseScheduleSeries',${series.id},'SPORTS_LEARNER_STOP',NOW())`;
 });return {success:true as const};
 }catch(e){return handleActionError(e);}}
export async function arrangeSportsMakeup(input:unknown){try{
 const d=z.object({sourceId:z.string().min(1),sessionId:z.string().min(1),requestKey:z.string().uuid()}).parse(input),a=await actor("booking.create");
 await courseTransaction(a.storeId,async tx=>{
  const receipt=await tx.courseBooking.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey:d.requestKey}}});if(receipt){if(receipt.makeupForBookingId!==d.sourceId||receipt.sessionId!==d.sessionId)throw new AppError("CONFLICT","請求已使用");return;}
  const deferredReceipt=await tx.courseBooking.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey:`sports-makeup:${d.sourceId}:${d.sessionId}:${d.requestKey}`}}});if(deferredReceipt)return;
  const source=await tx.courseBooking.findFirst({where:{id:d.sourceId,storeId:a.storeId,OR:[{requestKey:{startsWith:"sports-fixed:"}},{requestKey:{startsWith:"sports-makeup:"}}]},include:{session:true}});
  if(!source?.customerId||!(source.status==="NO_SHOW"||source.status==="CANCELLED"&&["STUDENT_LEAVE","TEACHER_ABSENT"].includes(source.absenceKind??"")))throw new AppError("VALIDATION","此紀錄不適用補課");
  if(await tx.courseBooking.findFirst({where:{storeId:a.storeId,AND:[{OR:[{makeupForBookingId:source.id},{requestKey:{startsWith:`sports-makeup:${source.id}:`}}]}],OR:[{status:{not:"CANCELLED"}},{absenceKind:{in:["STUDENT_LEAVE","TEACHER_ABSENT"]}}]}}))throw new AppError("CONFLICT","這次缺課已安排補課");
  const target=await tx.courseSession.findFirst({where:{id:d.sessionId,storeId:a.storeId,cancelledAt:null,releasedAt:null,templateId:source.session.templateId,startsAt:{gt:source.session.startsAt}},include:{bookings:{where:{status:{not:"CANCELLED"}}}}});
  if(!target||target.startsAt<new Date()||target.bookings.length>=target.capacity)throw new AppError("VALIDATION","請選擇尚有名額的未來同課程");
  if(target.bookings.some(b=>b.customerId===source.customerId))throw new AppError("CONFLICT","學員已在本堂課名單");
  const overlap=await tx.courseBooking.findFirst({where:{storeId:a.storeId,customerId:source.customerId,status:{not:"CANCELLED"},session:{cancelledAt:null,releasedAt:null,startsAt:{lt:target.endsAt},endsAt:{gt:target.startsAt}}}});if(overlap)throw new AppError("CONFLICT","學員同時段已有課程");
  if(source.status==="NO_SHOW"){
   const card=await tx.coursePointCard.findUnique({where:{storeId_requestKey:{storeId:a.storeId,requestKey:`no-show-makeup:${source.id}`}}});if(!card||card.closedAt||card.remaining<=0)throw new AppError("VALIDATION","原缺課沒有可用補課券");
   const b=await reserveCourseInTransaction(tx,a,{sessionId:target.id,customerId:source.customerId,cardId:card.id,requestKey:d.requestKey},null);
   await tx.courseBooking.update({where:{id:b.id},data:{makeupForBookingId:source.id}});
  }else await tx.courseBooking.create({data:{storeId:a.storeId,sessionId:target.id,customerId:source.customerId,customerName:source.customerName,bookingKind:"UNPAID",pointCost:0,requestKey:`sports-makeup:${source.id}:${target.id}:${d.requestKey}`,operatorUserId:a.userId,operatorName:a.name}});
 });return {success:true as const};
 }catch(e){return handleActionError(e);}}
export async function stopSportsSeries(input:unknown){try{
 const d=z.object({seriesId:z.string().min(1),effectiveDate:date,expectedSessionIds:z.array(z.string()).max(2000).optional(),expectedBookingIds:z.array(z.string()).max(10000).optional()}).parse(input),a=await actor("booking.update");
 if(d.effectiveDate<toLocalDateStr())throw new AppError("VALIDATION","結束日期不能早於今天");
 await courseTransaction(a.storeId,async tx=>{
  const s=(await readSportsSeries(tx,a.storeId)).find(r=>r.id===d.seriesId);if(!s)throw new AppError("NOT_FOUND","固定課不存在");
  const sessions=await tx.courseSession.findMany({where:{storeId:a.storeId,requestKey:s.requestKey,startsAt:{gte:parseTaipeiDateTime(d.effectiveDate,"00:00")!},cancelledAt:null},include:{bookings:{where:{status:{not:"CANCELLED"}}}}});
  if(d.expectedSessionIds&&(sessions.map(s=>s.id).sort().join(",")!==[...d.expectedSessionIds].sort().join(",")||sessions.flatMap(s=>s.bookings.map(b=>b.id)).sort().join(",")!==[...(d.expectedBookingIds??[])].sort().join(",")))throw new AppError("CONFLICT","課程或名單已變動，請重新核對取消範圍");
  if(sessions.some(s=>s.bookings.some(b=>b.status!=="RESERVED")))throw new AppError("CONFLICT","結束日期後已有點名，請先核對");
  for(const s of sessions){for(const b of s.bookings)await settleCourseBooking(tx,a,b.id,"CANCELLED");await tx.courseSession.update({where:{id:s.id},data:{cancelledAt:new Date()}});await cancelCourseWaitlistForSession(tx,a.storeId,s.id);}
  await tx.$executeRaw`UPDATE ${sportsSeriesTable(a.storeId)} SET "untilDate"=${addTaiwanDuration(d.effectiveDate,-1,"DAY")}::date,"updatedAt"=NOW() WHERE id=${s.id} AND "storeId"=${a.storeId}`;
 });return {success:true as const};
 }catch(e){return handleActionError(e);}}

/** Authoritative cancellation preview, including the current day and the ongoing rule. */
export async function previewSportsCourseCancellation(sessionId:string){try{
 const a=await actor("booking.read");z.string().min(1).max(100).parse(sessionId);
 const source=await coursePrisma.courseSession.findFirst({where:{storeId:a.storeId,id:sessionId,cancelledAt:null},include:{bookings:{where:{status:{not:"CANCELLED"}},select:{id:true,status:true}}}});
 if(!source)throw new AppError("NOT_FOUND","課程已取消或不存在，請返回課表核對");
 const effectiveDate=toLocalDateStr(source.startsAt);
 const series=(await readSportsSeries(coursePrisma,a.storeId)).find(s=>s.requestKey===source.requestKey&&!s.cancelledAt);
 const sessions=series?await coursePrisma.courseSession.findMany({where:{storeId:a.storeId,requestKey:series.requestKey,startsAt:{gte:parseTaipeiDateTime(effectiveDate,"00:00")!},cancelledAt:null},include:{bookings:{where:{status:{not:"CANCELLED"}},select:{id:true,status:true}}}}):[];
 return {success:true as const,data:{effectiveDate,seriesId:series?.id??null,canStop:!!series&&effectiveDate>=toLocalDateStr(),currentPeople:source.bookings.length,currentBlocked:source.bookings.some(b=>b.status!=="RESERVED"),sessionIds:sessions.map(s=>s.id),bookingIds:sessions.flatMap(s=>s.bookings.map(b=>b.id)),futureBlocked:sessions.some(s=>s.bookings.some(b=>b.status!=="RESERVED"))}};
 }catch(e){return handleActionError(e);}}
