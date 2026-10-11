import "server-only";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { bookingDateToday, parseTaipeiDateTime, formatDateZh } from "@/lib/date-utils";
import { AppError, handleActionError } from "@/lib/errors";
import { revalidateShopConfigInRoute } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";
import { settingsSaveUncertain } from "./settings-save-error";
import { confirmBookingWindow, parseWindowInput } from "./booking-window-confirmation";
export async function saveSteamBookingWindow(input: unknown) {
  try {
    const user = await requireWritablePermission("business_hours.manage"), storeId = await resolveWriteStoreId(user);
    const value = parseWindowInput(input, storeId);
    if (await getStoreIndustryModule(storeId) !== "steamfoot") throw new AppError("FORBIDDEN", "請使用此門市專用的預約設定");
    const data = await prisma.$transaction(async tx => {
      const stores = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      if (!stores.length) throw new AppError("CONFLICT", "門市不存在");
      return confirmBookingWindow(tx, storeId, value, async cutoff => {
        const bookings = await tx.booking.findMany({where:{storeId,bookingStatus:{in:["PENDING","CONFIRMED"]},bookingDate:{gte:bookingDateToday()}},select:{bookingDate:true,slotTime:true},orderBy:[{bookingDate:"asc"},{slotTime:"asc"}]});
        const affected = bookings.find(b => { const starts = parseTaipeiDateTime(b.bookingDate.toISOString().slice(0,10),b.slotTime); return starts && starts > cutoff; });
        if (affected) throw new AppError("BUSINESS_RULE", `${formatDateZh(affected.bookingDate.toISOString().slice(0,10))} ${affected.slotTime} 已有預約，請將開放截止日期設在該預約之後`);
      });
    });
    let syncWarning=false;try{revalidateShopConfigInRoute();revalidatePath("/dashboard/settings/hours");revalidatePath("/book");}catch{syncWarning=true;}
    return {success:true as const,storeId,data,syncWarning};
  } catch(error) {return {...handleActionError(error),uncertain:settingsSaveUncertain(error)};}
}
