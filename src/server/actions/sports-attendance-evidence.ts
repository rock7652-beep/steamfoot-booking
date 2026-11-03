"use server";
import {z} from "zod";
import {courseManagerRead} from "@/server/services/course-access";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import {coursePrisma} from "@/lib/course-db";
import {prisma} from "@/lib/db";
import {dayRange,parseTaipeiDateTime} from "@/lib/date-utils";
import {AppError,handleActionError} from "@/lib/errors";
export async function loadSportsAttendanceEvidence(input:unknown){try{
 const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input);
 if(!parseTaipeiDateTime(day,"00:00"))throw new AppError("VALIDATION","日期不正確");
 const {storeId}=await courseManagerRead("booking.read");
 if(!(await sportsNativePreview(storeId))||!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.fitness",status:"ENABLED"}}))throw new AppError("FORBIDDEN","此店尚未開放運動新版");
 const range=dayRange(day);
 const bookings=await coursePrisma.courseBooking.findMany({where:{storeId,session:{startsAt:{gte:range.start,lte:range.end}},OR:[{status:"NO_SHOW"},{status:"CANCELLED",absenceKind:{in:["STUDENT_LEAVE","GROUP_LEAVE_FORFEITED"]}}]},select:{id:true,status:true,pointCost:true,card:{select:{unit:true}}},take:1000});
 if(!bookings.length)return {success:true as const,data:[]};
 const ids=bookings.map(b=>b.id);
 const records=await prisma.$queryRaw<Array<{targetId:string;action:string;name:string|null;at:Date}>>`
 SELECT "targetId",action,name,at FROM (
  SELECT "targetId",action,"actorNameSnapshot" AS name,"createdAt" AS at FROM "AuditLog" WHERE "storeId"=${storeId} AND "targetType"='CourseBooking' AND "targetId"=ANY(${ids}::text[]) AND action IN ('NO_SHOW','STUDENT_LEAVE')
  UNION ALL
  SELECT payload->>'targetId',payload->>'action',payload->>'actorNameSnapshot',"createdAt" FROM "OperationAuditOutbox" WHERE payload->>'storeId'=${storeId} AND payload->>'targetType'='CourseBooking' AND payload->>'targetId'=ANY(${ids}::text[]) AND payload->>'action' IN ('NO_SHOW','STUDENT_LEAVE')
 ) evidence ORDER BY at DESC LIMIT 5000`;
 return {success:true as const,data:bookings.map(b=>{const r=records.find(r=>r.targetId===b.id&&r.action===(b.status==="NO_SHOW"?"NO_SHOW":"STUDENT_LEAVE"));return {id:b.id,name:r?.name??null,at:r?.at.toISOString()??null,cost:b.pointCost,unit:b.card?.unit??"POINT"};})};
 }catch(e){return handleActionError(e);}}
