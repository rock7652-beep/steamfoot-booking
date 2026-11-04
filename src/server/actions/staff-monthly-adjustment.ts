"use server";
import { canManageStaffRole } from "@/lib/staff-role-policy";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { requireMusicFinance } from "@/server/services/music-finance-access";
import { adjustmentInput, adjustmentMonth } from "@/lib/staff-monthly-adjustment";
import { assertAdjustmentMonthOpen, readMonthlyAdjustments, readAdjustmentMonth, setAdjustmentMonthLock } from "@/server/services/staff-monthly-adjustment";
import type { Prisma } from "@prisma/client";
type Saved = z.infer<typeof adjustmentInput> & {deletedAt:Date|null};
async function actor(expectedStoreId:string) {
  const user=await requireWritablePermission("staff.manage");
  if(!["OWNER","ADMIN","MANAGER"].includes(user.role))throw new AppError("FORBIDDEN","需店長管理權限");
  const storeId=await resolveWriteStoreId(user);
  if(storeId!==expectedStoreId)throw new AppError("CONFLICT","目前門市已變更，請重新整理");
  await requireStoreFeature(storeId,FEATURES.SERVICE_FEE_CALCULATOR);
  const industry=await getStoreIndustryModule(storeId);
  if(industry!=="steamfoot"&&industry!=="course"&&industry!=="beauty")throw new AppError("FORBIDDEN","此模組尚未提供月結調整");
  if(industry==="course")await requireMusicFinance(user,storeId,"teacher.settlement.confirm");
  if(industry==="beauty"){
    const beauty=await (await import("@/server/beauty/access")).beautyManager("teacher.settlement.confirm",true);
    if(beauty.storeId!==storeId)throw new AppError("CONFLICT","門市已切換，請重新整理");
  }
  return {user,storeId,industry};
}
async function storeLock(tx:Prisma.TransactionClient,storeId:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "operatingStatus"::text IN ('ACTIVE','TRIAL') FOR UPDATE`;
  if(!rows.length)throw new AppError("FORBIDDEN","門市目前無法操作");
}
async function assertStaffHierarchy(tx:Prisma.TransactionClient,a:Awaited<ReturnType<typeof actor>>,staffId:string) {
  if(a.industry==="beauty")return; // Beauty technicians have independent business identities.
  const target=await tx.staff.findFirst({where:{id:staffId,storeId:a.storeId},select:{user:{select:{role:true}}}});
  if(!target||!canManageStaffRole(getEffectiveActorRole(a.user),target.user.role))throw new AppError("FORBIDDEN","無權調整此人員，請由較高權限管理者處理");
}
async function audit(tx:Prisma.TransactionClient,a:Awaited<ReturnType<typeof actor>>,id:string,action:string,before:unknown,after:unknown) {
  await tx.auditLog.create({data:{actorUserId:a.user.id,storeId:a.storeId,targetType:"StaffMonthlyAdjustment",targetId:id,action,beforeJson:JSON.parse(JSON.stringify(before)),afterJson:JSON.parse(JSON.stringify(after))}});
}
async function snapshot(tx:Prisma.TransactionClient,a:Awaited<ReturnType<typeof actor>>,month:string) {
  const rows=await readMonthlyAdjustments(a.storeId,month,tx);
  const state=await readAdjustmentMonth(a.storeId,month,tx,a.industry);
  return {storeId:a.storeId,month,rows,...state};
}
export async function saveMonthlyAdjustment(input:unknown) {
  try {
    const d=adjustmentInput.extend({viewMonth:adjustmentMonth.optional()}).parse(input),a=await actor(d.expectedStoreId);
    const data=await prisma.$transaction(async tx=>{
      await storeLock(tx,a.storeId);
      const rows=await tx.$queryRaw<Saved[]>`SELECT *,COALESCE("staffId","technicianId") AS "staffId" FROM "StaffMonthlyAdjustment" WHERE id=${d.id} AND "storeId"=${a.storeId}`;
      const old=rows[0];
      // Exact replay of a successful request is harmless, including after confirmation.
      if(old&&!old.deletedAt&&old.revision===d.revision+1&&["staffId","month","date","direction","amount","reason"].every(k=>old[k as keyof Saved]===d[k as keyof typeof d]))return snapshot(tx,a,d.viewMonth??d.month);
      if((old?.revision??0)!==d.revision||old?.deletedAt)throw new AppError("CONFLICT","明細已被修改或刪除，請重新整理");
      await assertAdjustmentMonthOpen(tx,a.storeId,d.month,a.industry);
      if(old)await assertAdjustmentMonthOpen(tx,a.storeId,old.month,a.industry);
      await assertStaffHierarchy(tx,a,d.staffId);
      if(old&&old.staffId!==d.staffId)await assertStaffHierarchy(tx,a,old.staffId);
      const activeOnly=!old||old.staffId!==d.staffId;
      const person=a.industry==="beauty"
        ? (await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "BeautyTechnician" WHERE id=${d.staffId} AND "storeId"=${a.storeId} AND (${!activeOnly} OR active=true)`)[0]
        : await tx.staff.findFirst({where:{id:d.staffId,storeId:a.storeId,...(activeOnly?{status:"ACTIVE" as const}:{})},select:{id:true}});
      if(!person)throw new AppError("FORBIDDEN","請選擇本店有效人員");
      const staffId=a.industry==="beauty"?null:d.staffId,technicianId=a.industry==="beauty"?d.staffId:null;
      if(old)await tx.$executeRaw`UPDATE "StaffMonthlyAdjustment" SET "staffId"=${staffId},"technicianId"=${technicianId},month=${d.month},date=${d.date},direction=${d.direction},amount=${d.amount},reason=${d.reason},revision=revision+1 WHERE id=${d.id} AND "storeId"=${a.storeId}`;
      else await tx.$executeRaw`INSERT INTO "StaffMonthlyAdjustment" (id,"storeId","staffId","technicianId",month,date,direction,amount,reason) VALUES (${d.id},${a.storeId},${staffId},${technicianId},${d.month},${d.date},${d.direction},${d.amount},${d.reason})`;
      await setAdjustmentMonthLock(tx,a.storeId,d.month,false);
      if(old&&old.month!==d.month)await setAdjustmentMonthLock(tx,a.storeId,old.month,false);
      await audit(tx,a,d.id,old?"UPDATE":"CREATE",old??null,d);
      return snapshot(tx,a,d.viewMonth??d.month);
    });
    revalidatePath("/dashboard","layout");return {success:true as const,data};
  }catch(e){return handleActionError(e);}
}
export async function deleteMonthlyAdjustment(input:unknown) {
  try {
    const d=z.object({id:z.string().uuid(),expectedStoreId:z.string(),revision:z.number().int().positive()}).parse(input),a=await actor(d.expectedStoreId);
    const data=await prisma.$transaction(async tx=>{
      await storeLock(tx,a.storeId);
      const rows=await tx.$queryRaw<Saved[]>`SELECT *,COALESCE("staffId","technicianId") AS "staffId" FROM "StaffMonthlyAdjustment" WHERE id=${d.id} AND "storeId"=${a.storeId}`;
      const old=rows[0];if(!old)throw new AppError("NOT_FOUND","找不到明細");
      if(old.deletedAt&&old.revision===d.revision+1)return snapshot(tx,a,old.month);
      if(old.deletedAt||old.revision!==d.revision)throw new AppError("CONFLICT","明細已變更，請重新整理");
      await assertAdjustmentMonthOpen(tx,a.storeId,old.month,a.industry);
      await assertStaffHierarchy(tx,a,old.staffId);
      await tx.$executeRaw`UPDATE "StaffMonthlyAdjustment" SET "deletedAt"=NOW(),revision=revision+1 WHERE id=${d.id} AND "storeId"=${a.storeId}`;
      await setAdjustmentMonthLock(tx,a.storeId,old.month,false);
      await audit(tx,a,d.id,"DELETE",old,null);
      return snapshot(tx,a,old.month);
    });revalidatePath("/dashboard","layout");return {success:true as const,data};
  }catch(e){return handleActionError(e);}
}
export async function changeAdjustmentMonthLock(input:unknown) {
  try {
    const d=z.object({expectedStoreId:z.string(),month:adjustmentMonth,revision:z.number().int().nonnegative(),locked:z.boolean()}).parse(input),a=await actor(d.expectedStoreId);
    // Course completion uses the existing authoritative fingerprint confirmation.
    if(a.industry!=="steamfoot"&&d.locked)throw new AppError("BUSINESS_RULE","請使用確認月結");
    const data=await prisma.$transaction(async tx=>{
      await storeLock(tx,a.storeId);
      const old=await readAdjustmentMonth(a.storeId,d.month,tx,a.industry);
      if(old.revision!==d.revision)throw new AppError("CONFLICT","月結已變更，請重新整理");
      await setAdjustmentMonthLock(tx,a.storeId,d.month,d.locked);
      await audit(tx,a,d.month,d.locked?"CONFIRM_MONTH":"REOPEN_MONTH",old,d);
      return snapshot(tx,a,d.month);
    });revalidatePath("/dashboard","layout");return {success:true as const,data};
  }catch(e){return handleActionError(e);}
}
