"use server";
import { revalidatePath } from "next/cache";
import { courseManager, courseTransaction } from "@/server/services/course-access";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { assertStoreSubscriptionWritable } from "@/lib/subscription-guard";
import { AppError, handleActionError } from "@/lib/errors";
import { settlementConfirmInput, settlementSettingsInput } from "@/lib/course-monthly-settlement";
import { readCourseMonthlySettlement, readSettlementSettings } from "@/server/services/course-monthly-settlement";
import { recordCourseProfitPayment, voidCourseProfitPayment } from "@/server/services/course-profit-payment";
import type { PermissionCode } from "@/lib/permissions";
async function actor(permission:PermissionCode){
 const a=await courseManager(permission);
 if(a.user.role!=="OWNER")throw new AppError("FORBIDDEN","僅店長可處理課程月結");
 await requireStoreFeature(a.storeId,FEATURES.SERVICE_FEE_CALCULATOR);
 await assertStoreSubscriptionWritable(a.storeId);
 return a;
}
function refresh(){revalidatePath("/dashboard","layout");}
export async function saveCourseSettlementSettings(input:unknown){try{
 const d=settlementSettingsInput.parse(input),a=await actor("staff.manage");
 await courseTransaction(a.storeId,async tx=>{
  const current=await readSettlementSettings(tx,a.storeId);
  if(current.revision!==d.revision)throw new AppError("CONFLICT","設定已變更，請重新整理");
  await tx.$executeRaw`INSERT INTO "CourseSettlementSetting" ("storeId","profitEnabled","feeEnabled",revision) VALUES (${a.storeId},${d.profitEnabled},${d.feeEnabled},1) ON CONFLICT ("storeId") DO UPDATE SET "profitEnabled"=EXCLUDED."profitEnabled","feeEnabled"=EXCLUDED."feeEnabled",revision="CourseSettlementSetting".revision+1`;
  await tx.$executeRaw`INSERT INTO "AuditLog" (id,"actorUserId","targetType","targetId",action,"beforeJson","afterJson","createdAt") VALUES (${crypto.randomUUID()},${a.user.id},'CourseSettlementSetting',${a.storeId},'UPDATE',${JSON.stringify(current)}::jsonb,${JSON.stringify(d)}::jsonb,NOW())`;
 });refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function confirmCourseMonthlySettlement(input:unknown){try{
 const d=settlementConfirmInput.parse(input),a=await actor("report.read");
 await courseTransaction(a.storeId,async tx=>{
  const report=await readCourseMonthlySettlement(tx,a.storeId,d.month);
  if(report.fingerprint!==d.fingerprint)throw new AppError("CONFLICT","明細已變更，請重新整理核對");
  const last=report.revisions[0];
  if(last?.fingerprint===report.fingerprint)return;
  if((last?.revision??0)!==d.revision)throw new AppError("CONFLICT","已有新版月結，請重新整理");
  if(report.lines.some(l=>l.issue))throw new AppError("BUSINESS_RULE","仍有待核對明細，不能確認月結");
  await tx.$executeRaw`INSERT INTO "CourseMonthlySettlement" (id,"storeId",month,revision,fingerprint,snapshot,"actorUserId",reason) VALUES (${crypto.randomUUID()},${a.storeId},${d.month},${d.revision+1},${d.fingerprint},${JSON.stringify(report.lines)}::jsonb,${a.user.id},${d.reason})`;
 });refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function payCourseProfit(input:unknown){try{
 const a=await actor("cashbook.create");await courseTransaction(a.storeId,tx=>recordCourseProfitPayment(tx,{storeId:a.storeId,userId:a.user.id},input));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
export async function correctCourseProfit(input:unknown){try{
 const a=await actor("cashbook.create");await courseTransaction(a.storeId,tx=>voidCourseProfitPayment(tx,{storeId:a.storeId,userId:a.user.id},input));refresh();return {success:true as const};
}catch(e){return handleActionError(e);}}
