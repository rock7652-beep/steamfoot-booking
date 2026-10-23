"use server";
import { z } from "zod";
import { courseManagerRead, courseManager, courseTransaction } from "@/server/services/course-access";
import { coursePrisma } from "@/lib/course-db";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { musicLessonSlots } from "@/lib/music-lesson-periods";
import { fixedMusicPeriodsEnabled, readMusicLessonAssignments } from "@/server/services/music-lesson-periods";
import { enqueueOperationAudit } from "@/server/services/operation-audit-outbox";
import { checkPermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
const id = z.string().min(1).max(200);
export async function loadMusicPeriods(customerId: string) {
 try {
  const {storeId,user}=await courseManagerRead("booking.read");
  if(!fixedMusicPeriodsEnabled(storeId))throw new AppError("FORBIDDEN","此功能僅供音樂預覽驗收");
  await courseManagerRead("customer.read");
  const customer=await prisma.customer.findFirst({where:{id:id.parse(customerId),storeId},select:{id:true}});
  if(!customer)throw new AppError("NOT_FOUND","找不到本店學員");
  const cards=await coursePrisma.coursePointCard.findMany({where:{storeId,members:{some:{storeId,customerId}}},select:{id:true,nameSnapshot:true,musicTermSizes:true,musicBonusLessons:true,musicOpeningStateRequired:true,requestKey:true,closedAt:true}});
  const bookings=await coursePrisma.courseBooking.findMany({where:{storeId,customerId,cardId:{in:cards.map(c=>c.id)}},select:{id:true,cardId:true,status:true,absenceKind:true,makeupForBookingId:true,entries:{select:{id:true,kind:true,points:true,createdAt:true},orderBy:{createdAt:"asc"}},session:{select:{id:true,startsAt:true,nameSnapshot:true,coachId:true,cancelledAt:true}}},orderBy:[{session:{startsAt:"asc"}},{id:"asc"}]});
  const [assignments,teachers,canCorrect,purchases]=await Promise.all([readMusicLessonAssignments(coursePrisma,storeId,bookings.map(b=>b.id)),prisma.staff.findMany({where:{storeId,id:{in:[...new Set(bookings.map(b=>b.session.coachId))]}},select:{id:true,displayName:true}}),checkPermission(user.role,user.staffId,"booking.update"),checkPermission(user.role,user.staffId,"transaction.read").then(allowed=>allowed?coursePrisma.coursePurchase.findMany({where:{storeId,customerId,cardId:{in:cards.map(c=>c.id)},status:{in:["CONFIRMED","REFUNDED"]}},select:{cardId:true,price:true},orderBy:{createdAt:"asc"}}):[])]);
  return {success:true as const,data:cards.filter(card=>!card.requestKey.startsWith("music-leave-makeup:")).map(({requestKey,...card})=>({...card,tuition:purchases.filter(p=>p.cardId===card.id).length===1?purchases.find(p=>p.cardId===card.id)!.price:null,slots:musicLessonSlots(card.musicTermSizes,card.musicBonusLessons),bookings:bookings.filter(b=>(assignments.find(a=>a.bookingId===b.id)?.cardId??b.cardId)===card.id).map(b=>({id:b.id,date:b.session.startsAt.toISOString(),sessionId:b.session.id,name:b.session.nameSnapshot,teacher:teachers.find(t=>t.id===b.session.coachId)?.displayName??"教師資料保留",status:b.status,absenceKind:b.absenceKind,makeupForBookingId:b.makeupForBookingId,ledger:b.entries.map(e=>({...e,date:e.createdAt.toISOString(),createdAt:undefined})),assignment:assignments.find(a=>a.bookingId===b.id)??null}))})),canCorrect};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"讀取失敗":r.error};}
}
export async function confirmMusicLessonPeriod(input: unknown) {
 try {
  const d=z.object({customerId:id,bookingId:id,period:z.number().int().min(1).max(1000),ordinal:z.number().int().min(1).max(1000),expected:z.object({period:z.number().int(),ordinal:z.number().int()}).nullable(),reason:z.string().trim().min(2).max(500)}).parse(input);
  const {storeId,user}=await courseManager("booking.update");
  await courseManagerRead("customer.read");
  if(!fixedMusicPeriodsEnabled(storeId))throw new AppError("FORBIDDEN","此功能僅供音樂預覽驗收");
  await courseTransaction(storeId,async tx=>{
   const b=await tx.courseBooking.findFirst({where:{storeId,id:d.bookingId,customerId:d.customerId},include:{card:true}});
   if(!b?.card || b.card.musicOpeningStateRequired)throw new AppError("VALIDATION","此課堂無法更正期別");
   if(b.makeupForBookingId)throw new AppError("VALIDATION","補課沿用原堂歸屬，請更正原堂");
   if(!musicLessonSlots(b.card.musicTermSizes,b.card.musicBonusLessons).some(s=>s.period===d.period&&s.ordinal===d.ordinal))throw new AppError("VALIDATION","所選堂次不在購課範圍內");
   const previous=(await readMusicLessonAssignments(tx,storeId,[b.id]))[0];
   if(JSON.stringify(previous?{period:previous.period,ordinal:previous.ordinal}:null)!==JSON.stringify(d.expected))throw new AppError("CONFLICT","期別已更新，請重新讀取後核對");
   const occupied=await tx.$queryRaw<Array<{bookingId:string}>>`SELECT "bookingId" FROM "CourseMusicLessonAssignment" WHERE "storeId"=${storeId} AND "cardId"=${b.card.id} AND "customerId"=${d.customerId} AND period=${d.period} AND ordinal=${d.ordinal} AND kind='REGULAR' AND "releasedAt" IS NULL AND "bookingId"<>${b.id}`;
   if(occupied.length && !(b.status==='CANCELLED'&&!b.absenceKind))throw new AppError("CONFLICT","此堂次已有課堂，請先核對原歸屬");
   if(previous)await tx.$executeRaw`UPDATE "CourseMusicLessonAssignment" SET period=${d.period},ordinal=${d.ordinal},"updatedAt"=now() WHERE "storeId"=${storeId} AND "bookingId"=${b.id}`;
   else await tx.$executeRaw`INSERT INTO "CourseMusicLessonAssignment" ("bookingId","storeId","cardId","customerId",period,ordinal,kind) VALUES (${b.id},${storeId},${b.card.id},${d.customerId},${d.period},${d.ordinal},'REGULAR')`;
   await tx.$executeRaw`UPDATE "CourseMusicLessonAssignment" SET period=${d.period},ordinal=${d.ordinal},"updatedAt"=now() WHERE "storeId"=${storeId} AND "sourceBookingId"=${b.id}`;
   await enqueueOperationAudit({actorUserId:user.id,actorNameSnapshot:user.name,storeId,module:"COURSE",targetType:"CourseBooking",targetId:b.id,action:"CONFIRM_MUSIC_PERIOD",summary:"確認／更正固定期別與堂次",before:{assignment:previous??null},after:{period:d.period,ordinal:d.ordinal,reason:d.reason,linkedMakeupsRetained:true}},tx);
  });
  revalidatePath("/dashboard/courses");return {success:true as const};
 }catch(e){const r=handleActionError(e);return {success:false as const,error:r.success?"儲存失敗":r.error};}
}
