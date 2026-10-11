import "server-only";
import { spaPrisma } from "@/lib/spa-db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireSpaStore } from "@/lib/industry-module-server";
import { bookingDateToday, parseTaipeiDateTime, formatDateZh } from "@/lib/date-utils";
import { AppError, handleActionError } from "@/lib/errors";
import { revalidateShopConfigInRoute } from "@/lib/revalidation";
import { revalidatePath } from "next/cache";
import { settingsSaveUncertain } from "./settings-save-error";
import { confirmBookingWindow, parseWindowInput } from "./booking-window-confirmation";
export async function saveSpaBookingWindow(input: unknown) {
  try {
    const user = await requireWritablePermission("business_hours.manage"), storeId = await resolveWriteStoreId(user);
    const value = parseWindowInput(input, storeId);await requireSpaStore(storeId);
    const data = await spaPrisma.$transaction(async tx => {
      // Same lock as SPA booking create/edit; never read Steamfoot Booking rows.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`spa-schedule:${storeId}`}, 0))`;
      const stores = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "Store" WHERE id=${storeId} FOR UPDATE`;
      if (!stores.length) throw new AppError("CONFLICT", "門市不存在");
      return confirmBookingWindow(tx, storeId, value, async cutoff => {
        const bookings = await tx.spaBooking.findMany({where:{storeId,status:{in:["PENDING","CONFIRMED"]},bookingDate:{gte:bookingDateToday()}},select:{bookingDate:true,startTime:true},orderBy:[{bookingDate:"asc"},{startTime:"asc"}]});
        const affected = bookings.find(b => { const starts = parseTaipeiDateTime(b.bookingDate.toISOString().slice(0,10),b.startTime); return starts && starts > cutoff; });
        if (affected) throw new AppError("BUSINESS_RULE", `${formatDateZh(affected.bookingDate.toISOString().slice(0,10))} ${affected.startTime} 已有服務預約，請將開放截止日期設在該預約之後`);
      });
    });
    let syncWarning=false;try{revalidateShopConfigInRoute();revalidatePath("/dashboard/settings/hours");revalidatePath("/book");}catch{syncWarning=true;}
    return {success:true as const,storeId,data,syncWarning};
  }catch(error){return {...handleActionError(error),uncertain:settingsSaveUncertain(error)};}
}
