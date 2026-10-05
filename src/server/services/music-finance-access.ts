import "server-only";
import {cache} from "react";
import {prisma} from "@/lib/db";
import {checkPermission,type PermissionCode} from "@/lib/permissions";
import {AppError} from "@/lib/errors";
import type {UserRole} from "@prisma/client";
type Actor={role:UserRole;staffId:string|null};
export const isMusicFinanceStore=cache(async(storeId:string)=>!!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}));
/** Fresh per request: absent configuration preserves explicit whole-store grants.
 * Missing/inactive/cross-store operators always receive an empty scope. */
export async function readMusicFinanceScope(user:Actor,storeId:string):Promise<string[]|null> {
 if(!await isMusicFinanceStore(storeId) || user.role === "ADMIN")return null;
 const rows=await prisma.$queryRaw<Array<{teacherIds:string[]|null}>>`SELECT CASE WHEN u.role::text='OWNER' THEN NULL ELSE f."teacherIds" END AS "teacherIds" FROM "Staff" s JOIN "User" u ON u.id=s."userId" LEFT JOIN "CourseTeacherFinanceScope" f ON f."staffId"=s.id AND f."storeId"=s."storeId" WHERE s.id=${user.staffId??""} AND s."storeId"=${storeId} AND s.status='ACTIVE'`;
 return rows.length?rows[0].teacherIds:[];
}
export async function canMusicFinance(user:Actor,storeId:string,permission:PermissionCode,target?:string) {
 if(!await isMusicFinanceStore(storeId))return true;
 if(!await checkPermission(user.role,user.staffId,permission))return false;
 const scope=await readMusicFinanceScope(user,storeId);
 return target===undefined ? scope===null || scope.length>0 : scope===null || scope.includes(target);
}
/** Omitting target is deliberately whole-store only for aggregate mutations. */
export async function requireMusicFinance(user:Actor,storeId:string,permission:PermissionCode,target?:string) {
 if(!await canMusicFinance(user,storeId,permission,target) || (target===undefined && await readMusicFinanceScope(user,storeId)!==null))throw new AppError("FORBIDDEN","尚未授權此教師財務操作");
}
