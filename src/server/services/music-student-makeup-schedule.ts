import "server-only";
import {createHash} from "node:crypto";
import type {Prisma} from "../../../generated/course-client";
import type {CourseActor} from "./course-booking";
import {reserveCourseInTransaction} from "./course-booking";
import {AppError} from "@/lib/errors";
import {parseTaipeiDateTime,formatTWDateTime,toLocalDateStr} from "@/lib/date-utils";
import {assertCourseResources} from "./course-resources";
import {assertCourseSessionsFitHours} from "./course-business-hours";
import {assertMusicCourseAvailability} from "./course-availability";
import {assertCourseDutyCoverage} from "./course-duty";
import {assertCourseSchedulingMode} from "./course-scheduling-modes";
import {findFixedSeriesConflicts} from "@/lib/course-series";
import {captureTeachingTuitionFees} from "./music-teaching-item";
import {isMusicOpeningMakeupBooking} from "@/lib/music-opening-runtime";

export type StudentMakeupSchedule={sourceId:string;customerId:string;cardId:string;date:string;time:string;roomId:string;coachId:string;requestKey:string};
/** Caller holds the same store lock as normal scheduling. Session and reservation commit together. */
export async function scheduleMusicStudentMakeup(tx:Prisma.TransactionClient,actor:CourseActor,input:StudentMakeupSchedule,limit:number|null){
 const {storeId}=actor;
 const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 const previous=await tx.courseSession.findFirst({where:{storeId,requestKey:input.requestKey}});
 if(previous){
  const booking=await tx.courseBooking.findUnique({where:{storeId_requestKey:{storeId,requestKey:`student-makeup:${input.requestKey}`}}});
  if(previous.enrollmentFingerprint!==fingerprint||previous.createdById!==actor.userId||previous.cancelledAt||!booking||booking.sessionId!==previous.id||booking.status==="CANCELLED")throw new AppError("CONFLICT","這次安排已送出或內容已變更，請重新查看補課紀錄");
  return {sessionId:previous.id,bookingId:booking.id};
 }
 const source=await tx.courseBooking.findFirst({where:{id:input.sourceId,storeId,customerId:input.customerId,status:"CANCELLED",absenceKind:"STUDENT_LEAVE",bookingKind:"CARD"},include:{session:true,card:true}});
 if(!source?.card||isMusicOpeningMakeupBooking(source))throw new AppError("VALIDATION","找不到此學員可安排的原請假紀錄");
 const coupon=await tx.coursePointCard.findFirst({where:{storeId,closedAt:null,requestKey:{in:[`yjy-pilot-makeup:${source.id}`,`music-leave-makeup:${source.id}`]}}});
 const separate=source.card.requestKey.startsWith("yjy-pilot-card:")||!!coupon;
 if((separate?coupon?.id:source.cardId)!==input.cardId)throw new AppError("CONFLICT","補課方案已變更，請重新查看補課紀錄");
 if(await tx.courseBooking.findFirst({where:{storeId,...(separate?{cardId:input.cardId}:{makeupForBookingId:source.id}),OR:[{status:{not:"CANCELLED"}},{absenceKind:"STUDENT_LEAVE"}]}}))throw new AppError("CONFLICT","這次請假已安排補課，請重新查看");
 const startsAt=parseTaipeiDateTime(input.date,input.time);
 if(!startsAt||startsAt<=new Date()||startsAt<=source.session.startsAt)throw new AppError("VALIDATION","請選擇原請假課程之後的未來時段");
 const duration=source.session.endsAt.getTime()-source.session.startsAt.getTime();
 if(duration<=0||duration>480*60000)throw new AppError("VALIDATION","原課程時長需先核對");
 const endsAt=new Date(startsAt.getTime()+duration),range={startsAt,endsAt};
 const rule=await tx.courseBookingRule.findUnique({where:{storeId}});
 assertCourseSchedulingMode(rule,"ASSIGNED");
 await assertCourseResources(tx,storeId,{templateId:source.session.templateId,roomId:input.roomId,coachId:input.coachId,capacity:1,requireMusicSubject:true});
 await assertCourseSessionsFitHours(tx,storeId,[range]);
 await assertMusicCourseAvailability(tx,storeId,input.coachId,[range]);
 await assertCourseDutyCoverage(tx,storeId,[{...range,coachId:input.coachId}]);
 const conflict=await tx.courseSession.findFirst({where:{storeId,cancelledAt:null,releasedAt:null,startsAt:{lt:endsAt},endsAt:{gt:startsAt},OR:[{roomId:input.roomId},{coachId:input.coachId}]}});
 if(conflict)throw new AppError("CONFLICT",`${formatTWDateTime(conflict.startsAt)} 教室或教師已有課程`);
 const series=await tx.courseScheduleSeries.findMany({where:{storeId,cancelledAt:null,startsAt:{lt:endsAt},OR:[{untilDate:null},{untilDate:{gte:new Date(`${toLocalDateStr(startsAt)}T00:00:00.000Z`)}}]}});
 const seriesConflict=findFixedSeriesConflicts(series,[range],{roomId:input.roomId,coachId:input.coachId})[0];
 if(seriesConflict)throw new AppError("CONFLICT",`${seriesConflict.date}・${seriesConflict.reason}`);
 if(await tx.courseRental.findFirst({where:{storeId,roomId:input.roomId,cancelledAt:null,occupiedStartsAt:{lt:endsAt},occupiedEndsAt:{gt:startsAt}}}))throw new AppError("CONFLICT","教室已有租借，請選其他時段");
 const session=await tx.courseSession.create({data:{storeId,templateId:source.session.templateId,nameSnapshot:source.session.nameSnapshot,roomId:input.roomId,coachId:input.coachId,startsAt,endsAt,pointCost:source.session.pointCost,capacity:1,bookingAudience:"ASSIGNED",enrollmentMode:"ASSIGNED",scheduleType:"SINGLE",scheduleFrequency:"NONE",requestKey:input.requestKey,requestIndex:0,enrollmentFingerprint:fingerprint,createdById:actor.userId}});
 const booking=await reserveCourseInTransaction(tx,actor,{sessionId:session.id,customerId:input.customerId,cardId:input.cardId,makeupForBookingId:separate?null:source.id,requestKey:`student-makeup:${input.requestKey}`},limit);
 if(source.session.templateId.startsWith("teaching:"))await captureTeachingTuitionFees(tx,storeId,input.requestKey);
 return {sessionId:session.id,bookingId:booking.id};
}
