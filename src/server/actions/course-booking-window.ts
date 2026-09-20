"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { parseTaipeiDateTime, toLocalDateStr, formatTWDateTime } from "@/lib/date-utils";
import { resolveCustomerBookingWindow } from "@/lib/shop-config";
import { revalidateShopConfig } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";
import { courseManager } from "@/server/services/course-access";
import type { ActionResult } from "@/types";
const schema = z.discriminatedUnion("mode", [
  z.object({mode:z.literal("fixed"),date:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/)}),
  z.object({mode:z.literal("rolling"),days:z.number().int().min(1).max(90)}),
]);
export async function saveCourseBookingWindow(input: unknown): Promise<ActionResult<void>> {
  try {
    const {storeId}=await courseManager("business_hours.manage");
    const value=schema.parse(input), now=new Date();
    if(value.mode==="fixed" && (!parseTaipeiDateTime(value.date,"00:00") || value.date<toLocalDateStr(now))) throw new AppError("VALIDATION","請選擇今天或之後的有效日期");
    const config=value.mode==="fixed" ? {bookableUntilDate:new Date(`${value.date}T00:00:00Z`),bookingOpensAt:null} : {bookableUntilDate:null,bookingOpensAt:null,bookingWindowDays:value.days};
    const window=resolveCustomerBookingWindow(config,now);
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id=${storeId} AND "industryModule"::text='COURSE' FOR UPDATE`;
      const affected=await tx.$queryRaw<Array<{startsAt:Date}>>`SELECT s."startsAt" FROM "CourseBooking" b JOIN "CourseSession" s ON s.id=b."sessionId" AND s."storeId"=b."storeId" WHERE b."storeId"=${storeId} AND b.status::text='RESERVED' AND s."cancelledAt" IS NULL AND s."startsAt">${window.closesAt} ORDER BY s."startsAt" LIMIT 1`;
      if(affected.length) throw new AppError("BUSINESS_RULE",`${formatTWDateTime(affected[0].startsAt)} 已有課程預約，請將開放截止設在該預約之後`);
      await tx.shopConfig.upsert({where:{storeId},create:{storeId,...config},update:config});
    });
    revalidateShopConfig(); revalidatePath("/dashboard/courses/hours"); revalidatePath("/book");
    return {success:true,data:undefined};
  } catch(error) {return handleActionError(error);}
}
