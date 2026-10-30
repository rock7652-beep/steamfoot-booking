import "server-only";
import type {Prisma} from "../../../generated/course-client";
import type {CourseActor} from "./course-booking";
import {courseNoticeNeedsFollowup,type CourseNoticeKind} from "@/lib/course-store-notices";
import {toLocalDateStr} from "@/lib/date-utils";

/** Runs inside the booking transaction: no phantom or partial-operation notifications. */
type StoreNoticeInput={
 subjectKey:string;kind:CourseNoticeKind;customerName:string;courseName:string;coachId:string;startsAt:Date;
 previousStartsAt?:Date;previousCoachId?:string;affectedCount?:number;details?:unknown;
};
export async function recordCourseStoreNotice(tx:Prisma.TransactionClient,actor:CourseActor,inputOrLoad:StoreNoticeInput|(()=>Promise<StoreNoticeInput>)) {
 // The store's digital manager keeps receiving events independently of legacy switches.
 const input=typeof inputOrLoad==="function"?await inputOrLoad():inputOrLoad;
 const coaches=await tx.$queryRaw<Array<{id:string;displayName:string}>>`SELECT id,"displayName" FROM "Staff" WHERE "storeId"=${actor.storeId} AND (id=${input.coachId} OR id=${input.previousCoachId??input.coachId})`;
 const coachName=coaches.find(c=>c.id===input.coachId)?.displayName??"未指派";
 const previousCoachName=input.previousCoachId?coaches.find(c=>c.id===input.previousCoachId)?.displayName??"未指派":null;
 const now=new Date();
 const pending=courseNoticeNeedsFollowup(input.kind,!!actor.customerId,toLocalDateStr(input.startsAt)===toLocalDateStr(now));
 const existing=await tx.courseStoreNotice.findUnique({where:{storeId_subjectKey:{storeId:actor.storeId,subjectKey:input.subjectKey}}});
 const data={kind:input.kind,customerName:input.customerName,courseName:input.courseName,coachName,
  previousCoachName:existing?.previousCoachName??previousCoachName,startsAt:input.startsAt,
  previousStartsAt:existing?.kind==="MOVE"&&input.kind==="MOVE" ? existing.previousStartsAt??input.previousStartsAt??null : input.previousStartsAt??null,
  affectedCount:input.affectedCount??1,details:(input.details??{}) as Prisma.InputJsonValue,
  handledAt:pending?null:now,handledById:pending?null:actor.userId,handledByName:pending?null:actor.name};
 await tx.courseStoreNotice.upsert({where:{storeId_subjectKey:{storeId:actor.storeId,subjectKey:input.subjectKey}},
  create:{storeId:actor.storeId,subjectKey:input.subjectKey,...data},update:{...data,revision:{increment:1}}});
}
