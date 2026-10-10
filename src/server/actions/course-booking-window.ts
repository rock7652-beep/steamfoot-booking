"use server";
import { courseBookingWindowInput, courseBookingWindowSaveInput, bookingWindowRevision, type SavedBookingWindow } from "@/lib/course-booking-window-save";
import { settingsSaveUncertain } from "@/server/services/settings-save-error";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { parseTaipeiDateTime, toLocalDateStr, formatTWDateTime } from "@/lib/date-utils";
import { resolveCustomerBookingWindow } from "@/lib/shop-config";
import { revalidateShopConfig, revalidateShopConfigInRoute } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";
import { courseManager } from "@/server/services/course-access";
import type { ActionResult } from "@/types";
export async function saveCourseBookingWindow(input: unknown): Promise<ActionResult<void>> {
  const result=await saveWindow(input);
  return result.success ? {success:true,data:undefined} : result;
}

export async function saveCourseBookingWindowConfirmed(input: unknown) {
  try {
    const {values,...receipt}=courseBookingWindowSaveInput.parse(input);
    return await saveWindow(values,receipt);
  } catch(error) { return {...handleActionError(error),uncertain:settingsSaveUncertain(error)}; }
}

async function saveWindow(input:unknown,receipt?:Omit<ReturnType<typeof courseBookingWindowSaveInput.parse>,"values">) {
  try {
    const {storeId}=await courseManager("business_hours.manage");
    if(receipt && receipt.expectedStoreId!==storeId) throw new AppError("VALIDATION","門市已切換，請重新開啟設定");
    const value=courseBookingWindowInput.parse(input), now=new Date();
    if(value.mode==="fixed" && (!parseTaipeiDateTime(value.date,"00:00") || value.date<toLocalDateStr(now))) throw new AppError("VALIDATION","請選擇今天或之後的有效日期");
    const config=value.mode==="fixed" ? {bookableUntilDate:new Date(`${value.date}T00:00:00Z`),bookingOpensAt:null} : {bookableUntilDate:null,bookingOpensAt:null,bookingWindowDays:value.days};
    const window=resolveCustomerBookingWindow(config,now);
    const data=await prisma.$transaction(async tx=>{
      const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='COURSE' FOR UPDATE`;
      if(receipt&&!locked.length) throw new AppError("VALIDATION","課程門市不存在");
      const normalize=(row:{bookableUntilDate:Date|null;bookingWindowDays:number;bookingOpensAt:Date|null}|null):SavedBookingWindow=>({date:row?.bookableUntilDate?.toISOString().slice(0,10)??null,days:row?.bookingWindowDays??14,opensAt:row?.bookingOpensAt?.toISOString()??null});
      const previous=receipt?await tx.shopConfig.findUnique({where:{storeId}}):null;
      if(receipt) {
        const current=normalize(previous);
        const desired={date:value.mode==="fixed"?value.date:null,days:value.mode==="rolling"?value.days:current.days,opensAt:null};
        // A lost response may be retried after commit; confirming never repeats writes.
        if(bookingWindowRevision(current)===bookingWindowRevision(desired)) return current;
        if(bookingWindowRevision(current)!==receipt.expectedRevision) throw new AppError("VALIDATION","預約期限已被修改，請重新開啟後再編輯");
      }
      const affected=await tx.$queryRaw<Array<{startsAt:Date}>>`SELECT s."startsAt" FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId" WHERE b."storeId"=${storeId} AND b.status::text='RESERVED' AND s."cancelledAt" IS NULL AND s."startsAt">${window.closesAt} ORDER BY s."startsAt" LIMIT 1`;
      if(affected.length) throw new AppError("BUSINESS_RULE",`${formatTWDateTime(affected[0].startsAt)} 已有課程預約，請將開放截止設在該預約之後`);
      if(receipt&&previous) {
        const changed=await tx.shopConfig.updateMany({where:{storeId,updatedAt:previous.updatedAt},data:config});
        if(changed.count!==1) throw new AppError("VALIDATION","預約期限已被修改，請重新開啟後再編輯");
        return normalize(await tx.shopConfig.findUnique({where:{storeId}}));
      }
      const saved=await tx.shopConfig.upsert({where:{storeId},create:{storeId,...config},update:config});
      return receipt?normalize(saved):undefined;
    });
    let syncWarning=false;
    try {
      if(receipt) revalidateShopConfigInRoute(); else revalidateShopConfig();
      revalidatePath("/dashboard/courses/hours"); revalidatePath("/book");
    } catch(error) { if(!receipt) throw error; syncWarning=true; }
    return {success:true as const,storeId,data,syncWarning};
  } catch(error) {return {...handleActionError(error),uncertain:!!receipt&&settingsSaveUncertain(error)};}
}
