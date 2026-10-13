import "server-only";
import {z} from "zod";
import type { Prisma } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";
import { musicCourseExpiry } from "@/lib/music-course-products";
import { reserveCourseInTransaction, type CourseActor } from "./course-booking";

/** Each person keeps their own plan; future reservations can outlive the paid period. */
export async function reserveScheduledMusicLearner(tx:Prisma.TransactionClient,actor:CourseActor,input:{sessionId:string;customerId:string;cardId:string|null;requestKey:string},limit:number|null) {
  const session=await tx.courseSession.findFirst({where:{id:input.sessionId,storeId:actor.storeId},select:{startsAt:true,templateId:true}});
  if(!session)throw new AppError("NOT_FOUND","找不到本店課程");
  let usableCardId:string|null=null;
  if(input.cardId){
    const card=await tx.coursePointCard.findFirst({where:{id:input.cardId,storeId:actor.storeId},include:{members:true}});
    if(!card||card.closedAt||card.unit!=="SESSION"||!card.members.some(member=>member.customerId===input.customerId)||card.templateIds.length&&!card.templateIds.includes(session.templateId)||card.termSessionIds.length&&!card.termSessionIds.includes(input.sessionId))throw new AppError("VALIDATION","請使用此學員適用的個人方案");
    const held=await tx.courseBooking.aggregate({where:{storeId:actor.storeId,cardId:card.id,status:"RESERVED"},_sum:{pointCost:true}});
    const first=await tx.courseBooking.findFirst({where:{storeId:actor.storeId,cardId:card.id,status:"RESERVED"},orderBy:{session:{startsAt:"asc"}},select:{session:{select:{startsAt:true}}}});
    const expiry=card.musicValidityDays&&!card.musicActivatedAt?musicCourseExpiry(first?.session.startsAt??session.startsAt,card.musicValidityDays):card.expiresAt;
    const join=card.musicJoinSessionId?await tx.courseSession.findFirst({where:{id:card.musicJoinSessionId,storeId:actor.storeId},select:{startsAt:true}}):null;
    if(card.remaining-(held._sum.pointCost??0)>0&&card.expiresAt>=new Date()&&session.startsAt<=expiry&&(!card.musicJoinSessionId||join&&session.startsAt>=join.startsAt))usableCardId=card.id;
  }
  return reserveCourseInTransaction(tx,actor,{...input,cardId:usableCardId,deferredPayment:!usableCardId},limit);
}

/** Attach a newly purchased plan without changing the learner's booking identity. */
export async function attachUnpaidMusicBookings(tx:Prisma.TransactionClient,actor:CourseActor,cardId:string,customerId:string,bookingId:string) {
  const source=await tx.courseBooking.findFirst({where:{id:bookingId,storeId:actor.storeId,customerId},include:{session:true}});
  if(!source)throw new AppError("NOT_FOUND","找不到這位學員的本店預約");
  if(source.bookingKind!=="UNPAID"||!["RESERVED","ATTENDED","NO_SHOW"].includes(source.status))return;
  const card=await tx.coursePointCard.findFirst({where:{id:cardId,storeId:actor.storeId},include:{members:true}});
  if(!card||card.unit!=="SESSION"||card.closedAt||!card.members.some(person=>person.customerId===customerId)||card.templateIds.length&&!card.templateIds.includes(source.session.templateId))throw new AppError("VALIDATION","新方案不適用本堂課");
  const rows=await tx.courseBooking.findMany({where:{storeId:actor.storeId,customerId,bookingKind:"UNPAID",status:{in:["RESERVED","ATTENDED","NO_SHOW"]},session:{requestKey:source.session.requestKey,cancelledAt:null,startsAt:{gte:source.session.startsAt}}},include:{session:true},orderBy:{session:{startsAt:"asc"}}});
  const held=await tx.courseBooking.aggregate({where:{storeId:actor.storeId,cardId,status:"RESERVED"},_sum:{pointCost:true}});
  let available=card.remaining-(held._sum.pointCost??0);
  const expiry=card.musicValidityDays&&!card.musicActivatedAt?musicCourseExpiry(source.session.startsAt,card.musicValidityDays):card.expiresAt;
  for(const row of rows){
    if(available<1||row.session.startsAt>expiry)break;
    if(card.termSessionIds.length&&!card.termSessionIds.includes(row.sessionId))continue;
    await tx.courseBooking.update({where:{id:row.id},data:{cardId,bookingKind:"CARD",pointCost:1}});
    const consumed=row.status==="ATTENDED"||row.status==="NO_SHOW";
    await tx.coursePointEntry.create({data:{storeId:actor.storeId,cardId,bookingId:row.id,kind:consumed?"DEBIT":"RESERVE",points:1,actorUserId:actor.userId}});
    if(consumed)await tx.coursePointCard.update({where:{id:cardId},data:{remaining:{decrement:1},...(card.musicValidityDays&&!card.musicActivatedAt?{musicActivatedAt:source.session.startsAt,expiresAt:expiry}:{})}});
    available--;
  }
  const series=await tx.courseScheduleSeries.findUnique({where:{storeId_requestKey:{storeId:actor.storeId,requestKey:source.session.requestKey}}});
  if(series&&!series.cancelledAt){
    const learners=z.array(z.object({customerId:z.string(),cardId:z.string().nullable().optional(),stopDate:z.string().optional()})).parse(series.learnerSnapshot);
    await tx.courseScheduleSeries.update({where:{id:series.id},data:{learnerSnapshot:learners.map(learner=>learner.customerId===customerId?{...learner,cardId}:learner)}});
  }
}
