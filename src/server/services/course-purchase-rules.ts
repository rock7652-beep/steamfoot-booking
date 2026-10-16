import "server-only";
import { musicCheckoutQuote } from "@/lib/music-course-products";
import type { CourseCheckoutInput } from "@/lib/course-checkout";
import type { Prisma, CoursePointPlan } from "../../../generated/course-client";
import { AppError } from "@/lib/errors";

/** Sports does not accept music period, joining or gift options. */
export function validateFitnessPurchase(data: CourseCheckoutInput) {
  if (data.musicJoinSessionId || data.musicManualBonus || data.musicPurchaseTerms || data.musicValidityDays)
    throw new AppError("VALIDATION", "此方案不適用音樂課程設定");
}

/** Music owns period pricing and joining validation; caller retains payment and locks. */
export async function quoteMusicPurchase(
  tx: Prisma.TransactionClient, storeId: string, plan: CoursePointPlan, data: CourseCheckoutInput,
) {
  let musicQuote=musicCheckoutQuote(plan,data.musicPurchaseTerms,data.musicManualBonus??0,undefined,data.musicValidityDays);
  if(data.musicJoinSessionId) {
    const first=await tx.courseSession.findFirst({where:{id:data.musicJoinSessionId,storeId,cancelledAt:null},include:{template:true}});
    if(!first || first.template.classType!=="GROUP" || !plan.templateIds.includes(first.templateId))throw new AppError("VALIDATION","請選擇本方案適用的團班課次");
    const size=first.template.musicTermLessons;
    if(!size)throw new AppError("VALIDATION","團班尚未設定每期堂數");
    const end=(Math.floor(first.requestIndex/size)+1)*size;
    const remaining=await tx.courseSession.count({where:{storeId,templateId:first.templateId,requestKey:first.requestKey,cancelledAt:null,requestIndex:{gte:first.requestIndex,lt:end}}});
    if(remaining!==end-first.requestIndex)throw new AppError("VALIDATION","本期課次尚未排齊，請先核對課表再辦理插班");
    musicQuote=musicCheckoutQuote(plan,data.musicPurchaseTerms,data.musicManualBonus??0,remaining,data.musicValidityDays);
  }
  return musicQuote;
}

/** Both member purchase and manager confirmation enforce the same unit boundary. */
export function assertCoursePurchaseUnit(music: boolean, unit: string, message: string) {
  if (music && unit !== "SESSION") throw new AppError("VALIDATION", message);
}
