import "server-only";
import {prisma} from "@/lib/db";
import {courseAccount} from "./course-access";
import {AppError} from "@/lib/errors";
import type {Prisma} from "../../../generated/course-client";
export type TeacherChangePermission="teacher.booking.leave"|"teacher.booking.reschedule";
export async function courseTeacherChangeActor(permission:TeacherChangePermission,write=false) {
 const actor=await courseAccount({write});
 const link=await prisma.staffMemberLink.findFirst({where:{userId:actor.user.id,storeId:actor.storeId,revokedAt:null,staff:{status:"ACTIVE",courseCoachEnabled:true,user:{status:"ACTIVE"}}},select:{staffId:true}});
 if(!link || !await prisma.staffPermission.findFirst({where:{staffId:link.staffId,permission}}))throw new AppError("FORBIDDEN","尚未授權此授課操作");
 return {...actor,staffId:link.staffId};
}
/** Recheck both ownership and the grant under the same mutation transaction. */
export async function assertCourseTeacherChange(tx:Prisma.TransactionClient,storeId:string,userId:string,staffId:string,sessionId:string,permission:TeacherChangePermission) {
 const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT s.id FROM "CourseSession" s JOIN "StaffMemberLink" l ON l."staffId"=s."coachId" AND l."storeId"=s."storeId" JOIN "Staff" st ON st.id=l."staffId" AND st."storeId"=l."storeId" JOIN "StaffPermission" p ON p."staffId"=st.id WHERE s.id=${sessionId} AND s."storeId"=${storeId} AND s."coachId"=${staffId} AND l."userId"=${userId} AND l."revokedAt" IS NULL AND st.status::text='ACTIVE' AND st."courseCoachEnabled"=true AND p.permission=${permission}`;
 if(!rows.length)throw new AppError("FORBIDDEN","只能處理自己被授權的課程");
}
