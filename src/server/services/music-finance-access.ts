import "server-only";
import {cache} from "react";
import {prisma} from "@/lib/db";
import {checkPermission,type PermissionCode} from "@/lib/permissions";
import {AppError} from "@/lib/errors";
import type {UserRole} from "@prisma/client";
export const isMusicFinanceStore=cache(async(storeId:string)=>!!await prisma.storeFeatureEntitlement.findFirst({where:{storeId,featureKey:"business.music",status:"ENABLED"},select:{storeId:true}}));
export async function canMusicFinance(user:{role:UserRole;staffId:string|null},storeId:string,permission:PermissionCode) {
  return !await isMusicFinanceStore(storeId) || await checkPermission(user.role,user.staffId,permission);
}
export async function requireMusicFinance(user:{role:UserRole;staffId:string|null},storeId:string,permission:PermissionCode) {
  if(!await canMusicFinance(user,storeId,permission))throw new AppError("FORBIDDEN","尚未授權此教師財務操作");
}
