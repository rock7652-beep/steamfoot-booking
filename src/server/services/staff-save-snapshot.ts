import "server-only";
import {prisma} from "@/lib/db";
import {spaPrisma} from "@/lib/spa-db";
import {getStoreIndustryModule} from "@/lib/industry-module-server";
import {isSpaCompensationSchemaReady,isSpaOperationalSchemaReady} from "@/lib/spa-schema-readiness";
import {ALL_PERMISSIONS,ROLE_LABELS} from "@/lib/permissions";
import {canManageStaffRole} from "@/lib/staff-role-policy";
import {getEffectiveActorRole} from "@/lib/hq-store-view-context";
import {parseTaiwanDateToDbDate,toLocalDateStr} from "@/lib/date-utils";
import {spaSkillKeyFromId} from "@/lib/spa-store-identifiers";
import {AppError} from "@/lib/errors";
import type {UserRole} from "@prisma/client";
export async function readSavedStaff(storeId:string,staffId:string,user:{id:string;role:UserRole;staffId:string|null}){
 const staff=await prisma.staff.findFirst({where:{storeId,id:staffId},include:{user:{select:{id:true,name:true,email:true,phone:true,role:true}},permissions:{where:{granted:true},select:{permission:true}},_count:{select:{assignedCustomers:true}}}});
 if(!staff)throw new AppError("NOT_FOUND","找不到本店人員");
 const spa=await getStoreIndustryModule(storeId)==="spa";
 const ready=spa&&await isSpaOperationalSchemaReady();
 const [skills,weekly,exceptions,compensations]=await Promise.all([
  ready?spaPrisma.spaStaffSkill.findMany({where:{storeId,staffId},include:{skill:{select:{id:true}}}}):[],
  ready?spaPrisma.spaStaffAvailability.findMany({where:{storeId,staffId,isActive:true},orderBy:[{dayOfWeek:"asc"},{startTime:"asc"}]}):[],
  ready?spaPrisma.spaStaffAvailabilityException.findMany({where:{storeId,staffId,date:{gte:parseTaiwanDateToDbDate(toLocalDateStr())}},orderBy:{date:"asc"}}):[],
  spa&&await isSpaCompensationSchemaReady()?spaPrisma.spaStaffCompensation.findMany({where:{storeId,staffId,isActive:true}}):[],
 ]);
 const compensation=compensations[0];
 const canEdit=staff.user.id!==user.id&&canManageStaffRole(getEffectiveActorRole(user),staff.user.role);
 return {id:staff.id,updatedAt:staff.updatedAt.toISOString(),userId:staff.user.id,role:staff.user.role,permissions:["OWNER","ADMIN"].includes(staff.user.role)?[...ALL_PERMISSIONS]:staff.permissions.map(p=>p.permission),displayName:staff.displayName,legalName:staff.user.name,roleLabel:ROLE_LABELS[staff.user.role],email:staff.user.email??"尚未設定",phone:staff.phone||staff.user.phone,colorCode:staff.colorCode,status:staff.status,customerCount:staff._count.assignedCustomers,specialties:staff.isOwner?"門店營運管理":"尚未設定專業項目",specialtyKeys:skills.map(r=>spaSkillKeyFromId(r.skill.id)).filter((key):key is NonNullable<typeof key>=>key!==null),emergencyContact:null,weeklyAvailability:weekly.map(({dayOfWeek,startTime,endTime})=>({dayOfWeek,startTime,endTime})),scheduleExceptions:exceptions.map(r=>({date:r.date.toISOString().slice(0,10),label:r.type==="UNAVAILABLE"?(r.startTime&&r.endTime?`請假 ${r.startTime}–${r.endTime}${r.reason?`・${r.reason}`:""}`:r.reason||"個人休假"):`臨時加班 ${r.startTime}–${r.endTime}${r.reason?`・${r.reason}`:""}`,tone:r.type==="UNAVAILABLE"?"leave" as const:"extra" as const,startTime:r.startTime,endTime:r.endTime,reason:r.reason})),canEdit,canResetPassword:canEdit&&staff.user.role!=="ADMIN",compensationMode:compensation?.mode==="PERCENTAGE"||compensation?.mode==="FIXED"?compensation.mode:null,compensationValue:compensation?Number(compensation.value):null};
}
