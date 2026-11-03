import "server-only";
import { prisma } from "@/lib/db";

import { ALL_PERMISSIONS, ROLE_LABELS } from "@/lib/permissions";
import { canManageStaffRole } from "@/lib/staff-role-policy";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";

import { AppError } from "@/lib/errors";
import type { UserRole } from "@prisma/client";
export async function readSavedStaff(storeId:string,staffId:string,user:{id:string;role:UserRole;staffId:string|null}){
 const staff=await prisma.staff.findFirst({where:{storeId,id:staffId},include:{user:{select:{id:true,name:true,email:true,phone:true,role:true}},permissions:{where:{granted:true},select:{permission:true}},_count:{select:{assignedCustomers:true}}}});
 if(!staff)throw new AppError("NOT_FOUND","找不到本店人員");
 const canEdit=staff.user.id!==user.id&&canManageStaffRole(getEffectiveActorRole(user),staff.user.role);
 return {birthday:staff.courseBirthday?.toISOString().slice(0,10)??"",emergencyContactName:staff.emergencyContactName??"",emergencyContactPhone:staff.emergencyContactPhone??"",emergencyContactRelation:staff.emergencyContactRelation??"",id:staff.id,updatedAt:staff.updatedAt.toISOString(),userId:staff.user.id,role:staff.user.role,permissions:["OWNER","ADMIN"].includes(staff.user.role)?[...ALL_PERMISSIONS]:staff.permissions.map(p=>p.permission),displayName:staff.displayName,legalName:staff.user.name,roleLabel:ROLE_LABELS[staff.user.role],email:staff.user.email??"尚未設定",phone:staff.phone||staff.user.phone,colorCode:staff.colorCode,status:staff.status,customerCount:staff._count.assignedCustomers,specialties:staff.isOwner?"門店營運管理":"尚未設定專業項目",specialtyKeys:[],emergencyContact:null,weeklyAvailability:[],scheduleExceptions:[],canEdit,canResetPassword:canEdit&&staff.user.role!=="ADMIN",compensationMode:null,compensationValue:null};
}
