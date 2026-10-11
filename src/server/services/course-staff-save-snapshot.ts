import "server-only";
import {prisma} from "@/lib/db";
import {coursePrisma} from "@/lib/course-db";
import {canMusicFinance,isMusicFinanceStore} from "./music-finance-access";
import {ALL_PERMISSIONS} from "@/lib/permissions";
import type {courseManager} from "./course-access";
export async function readSavedCourseStaff(storeId:string,staffId:string,user:Awaited<ReturnType<typeof courseManager>>["user"],relatedIds:string[]=[]){
 const links=await prisma.courseStaffPersonLink.findMany({where:{storeId,OR:[{managerStaffId:staffId},{instructorStaffId:staffId}]}});
 const ids=[...new Set([staffId,...relatedIds,...links.flatMap(l=>[l.managerStaffId,l.instructorStaffId])])];
 const people=await prisma.staff.findMany({where:{storeId,id:{in:ids}},include:{user:{select:{id:true,role:true,email:true}},permissions:{where:{granted:true},select:{permission:true}},memberLink:{include:{user:{select:{status:true}}}}}});
 const handover=await coursePrisma.courseSession.findMany({where:{storeId,coachId:{in:ids},cancelledAt:null,endsAt:{gt:new Date()}},select:{id:true,coachId:true,nameSnapshot:true,startsAt:true,endsAt:true,capacity:true,_count:{select:{bookings:{where:{status:{not:"CANCELLED"}}}}}},orderBy:{startsAt:"asc"}});
 const members=people.flatMap(p=>p.memberLink?[p.memberLink.userId]:[]);
 const customers=await prisma.customer.findMany({where:{storeId,mergedIntoCustomerId:null,OR:[{userId:{in:members}},{identityLinks:{some:{userId:{in:members}}}}]},select:{id:true,userId:true,identityLinks:{select:{userId:true}}}});
 const financeRows=await isMusicFinanceStore(storeId)?await prisma.$queryRaw<Array<{staffId:string;teacherIds:string[]|null}>>`SELECT "staffId","teacherIds" FROM "CourseTeacherFinanceScope" WHERE "storeId"=${storeId} AND "staffId"=ANY(${ids}::text[])`:[];
 return {rows:await Promise.all(people.map(async s=>{
  const linked=links.find(l=>l.managerStaffId===s.id||l.instructorStaffId===s.id),other=linked?(linked.managerStaffId===s.id?linked.instructorStaffId:linked.managerStaffId):"";
  const canReadFees=await canMusicFinance(user,storeId,"teacher.compensation.read",s.id);
  return {id:s.id,name:s.displayName,kind:s.user.role==="CUSTOMER"?"coach" as const:"manager" as const,role:s.user.role,canEdit:user.role!=="MANAGER"||["STAFF","PARTNER"].includes(s.user.role),linkedStaffId:other,linkedStaffName:people.find(p=>p.id===other)?.displayName??"",financeTeacherIds:financeRows.find(f=>f.staffId===s.id)?.teacherIds??null,
   coachLoginReady:!!s.memberLink&&!s.memberLink.revokedAt&&s.memberLink.user.status==="ACTIVE"&&s.status==="ACTIVE"&&s.courseCoachEnabled,coachEnabled:s.courseCoachEnabled,defaultClassFee:canReadFees?s.courseDefaultClassFee?.toString()??"":"",qualificationIds:s.courseQualifiedTemplateIds,qualificationsConfirmed:s.courseQualificationsConfirmed,updatedAt:s.updatedAt.toISOString(),birthday:s.courseBirthday?.toISOString().slice(0,10)??"",emergencyContactRelation:s.emergencyContactRelation,emergencyContactName:s.emergencyContactName,emergencyContactPhone:s.emergencyContactPhone,
   assignments:handover.filter(h=>h.coachId===s.id).map(h=>({id:h.id,name:h.nameSnapshot,startsAt:h.startsAt.toISOString(),endsAt:h.endsAt.toISOString(),capacity:h.capacity,bookedCount:h._count.bookings})),email:s.user.email??"",contactEmail:s.user.email??"",notificationsEnabled:!!s.memberLink&&!s.memberLink.revokedAt,phone:s.phone,active:s.status==="ACTIVE",memberEnabled:s.memberLink?.courseMemberEnabled??true,permissions:["OWNER","ADMIN"].includes(s.user.role)?[...ALL_PERMISSIONS]:s.permissions.map(p=>p.permission),customerId:customers.find(c=>c.userId===s.memberLink?.userId||c.identityLinks.some(l=>l.userId===s.memberLink?.userId))?.id??""};
 }))};
}
