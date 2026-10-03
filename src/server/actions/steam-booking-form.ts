"use server";

import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { toLocalDateStr } from "@/lib/date-utils";
import { enumerateBookableDates } from "@/lib/bookable-window";
import { resolveBookableUntilDate } from "@/lib/shop-config";
import { AppError, handleActionError } from "@/lib/errors";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { fetchDaySlots } from "./slots";
import { createBooking } from "./booking";

export async function loadSteamBookingForm(date: string) {
  try {
    const user=await requireWritablePermission("booking.create");
    const storeId=await resolveWriteStoreId(user);
    if(await getStoreIndustryModule(storeId)!=="steamfoot") throw new AppError("VALIDATION","此入口僅適用蒸足預約");
    const config=await prisma.shopConfig.findUnique({where:{storeId},select:{bookableUntilDate:true}});
    const todayStr=toLocalDateStr();
    const days=enumerateBookableDates(todayStr,resolveBookableUntilDate(config?.bookableUntilDate));
    const defaultDate=days.includes(date)?date:days[0]??todayStr;
    const initialSlots=(await fetchDaySlots(defaultDate)).slots;
    return {success:true as const,data:{days,todayStr,defaultDate,initialSlots,isAdmin:user.role==="ADMIN"}};
  } catch(error) {const result=handleActionError(error);return {success:false as const,error:!result.success?result.error:"載入失敗"};}
}

/** The same authoritative createBooking validates plans, makeup, capacity and permission. */
export async function submitSteamBookingForm(form: FormData) {
  const customerId=String(form.get("customerId")??"");
  if(!customerId)return {success:false as const,error:"請選擇顧客"};
  const isMakeup=form.get("isMakeup")==="on";
  return createBooking({
    customerId,
    bookingDate:String(form.get("bookingDate")??""),
    slotTime:String(form.get("slotTime")??""),
    bookingType:isMakeup?"PACKAGE_SESSION":String(form.get("bookingType")??"") as "FIRST_TRIAL"|"SINGLE"|"PACKAGE_SESSION",
    people:Number(form.get("people"))||1,
    notes:String(form.get("notes")??"")||undefined,
    customerPlanWalletId:String(form.get("customerPlanWalletId")??"")||undefined,
    servicePlanId:String(form.get("servicePlanId")??"")||undefined,
    skipDutyCheck:form.get("skipDutyCheck")==="on"||undefined,
    ...(isMakeup?{isMakeup:true}:{}),
  },{requestKey:String(form.get("requestKey")??""),source:"staff-booking",assignedStaffId:null});
}
