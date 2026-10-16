"use server";
import { canOperateCourseMonthly } from "@/lib/course-monthly-access";
import { musicDataSeparationEnabled } from "@/server/services/music-data-scope";
import {requireMusicFinance} from "@/server/services/music-finance-access";
import { revalidatePath } from "next/cache";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { AppError, handleActionError } from "@/lib/errors";
import { settlementConfirmInput, settlementSettingsInput } from "@/lib/course-monthly-settlement";
import { readSettlementSettings } from "@/server/services/course-monthly-settlement";
import { confirmCourseMonth } from "@/server/services/confirm-course-month";
import { recordCourseProfitPayment, voidCourseProfitPayment } from "@/server/services/course-profit-payment";
import type { PermissionCode } from "@/lib/permissions";
async function actor(permission:PermissionCode){
 const a=await courseManager(permission);
 if(!canOperateCourseMonthly(a.user.role,musicDataSeparationEnabled(a.storeId)))throw new AppError("FORBIDDEN","僅店長可處理課程月結");
 await requireStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);
 await assertStoreSubscriptionWritable(a.storeId);
 return a;
}
function refresh(){revalidatePath("/dashboard","layout");}
export async function saveCourseSettlementSettings(input:unknown){try{
 const d=settlementSettingsInput.parse(input),a=await actor("staff.manage");
 await requireMusicFinance(a.user,a.storeId,"teacher.settlement.confirm");
 await courseTransaction(a.storeId,async tx=>{
  const current=await readSettlementSettings(tx,a.storeId);
  if(current.revision!==d.revision)throw new AppError("CONFLICT","設定已變更，請重新整理");
  const next={...d,personalIncomeEnabled:d.personalIncomeEnabled??current.personalIncomeEnabled};
  await tx.$executeRaw`INSERT INTO "CourseSettlementSetting" ("storeId","profitEnabled","feeEnabled","personalIncomeEnabled",revision) VALUES (${a.storeId},${d.profitEnabled},${d.feeEnabled},${next.personalIncomeEnabled},1) ON CONFLICT ("storeId") DO UPDATE SET "profitEnabled"=EXCLUDED."profitEnabled","feeEnabled"=EXCLUDED."feeEnabled","personalIncomeEnabled"=EXCLUDED."personalIncomeEnabled",revision="CourseSettlementSetting".revision+1`;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${a.user.id},'CourseSettlementSetting',${a.storeId},'UPDATE',${JSON.stringify(current)}::jsonb,${JSON.stringify(next)}::jsonb,NOW())`;
 });refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function confirmCourseMonthlySettlement(input:unknown){try{
 const d=settlementConfirmInput.parse(input),a=await actor("report.read");
 await requireMusicFinance(a.user,a.storeId,"teacher.settlement.confirm");
 await courseTransaction(a.storeId,tx=>confirmCourseMonth(tx,{storeId:a.storeId,userId:a.user.id},d));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function payCourseProfit(input:unknown){try{
 const a=await actor("cashbook.create");await courseTransaction(a.storeId,tx=>recordCourseProfitPayment(tx,{storeId:a.storeId,userId:a.user.id},input));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function correctCourseProfit(input:unknown){try{
 const a=await actor("cashbook.create");await courseTransaction(a.storeId,tx=>voidCourseProfitPayment(tx,{storeId:a.storeId,userId:a.user.id},input));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
