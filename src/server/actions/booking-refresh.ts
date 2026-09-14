"use server";

import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead, validateStoreAccess } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { getCachedMonthScheduleSummary } from "@/lib/query-cache";
import { fetchDaySlots } from "@/server/actions/slots";
import { AppError } from "@/lib/errors";

/** Reuse the complete calendar DTO, including wallets, notes and collections. */
export async function refreshBookingManagement(input: {
  year: number;
  month: number;
  storeId?: string;
  date: string | null;
}) {
  const user = await requirePermission("booking.read");
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100 ||
      !Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw new AppError("VALIDATION", "月份無效");
  }
  const prefix = `${input.year}-${String(input.month).padStart(2, "0")}-`;
  if (input.date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !input.date.startsWith(prefix) || Number(input.date.slice(8)) < 1 ||
      Number(input.date.slice(8)) > new Date(Date.UTC(input.year, input.month, 0)).getUTCDate())) {
    throw new AppError("VALIDATION", "日期無效");
  }
  const activeStoreId = await getActiveStoreForRead(user);
  const storeId = input.storeId
    ? await validateStoreAccess(user, input.storeId, "read")
    : activeStoreId;
  if (storeId && await getStoreIndustryModule(storeId) !== "steamfoot") {
    throw new AppError("FORBIDDEN", "此更新僅適用蒸足預約管理");
  }
  // Slots still resolve their scope from the session. Do not combine a
  // notification's explicit store with slots from a different active store.
  const [monthData, monthSchedule, slotResult] = await Promise.all([
    getMonthBookingSummary(input.year, input.month, storeId),
    storeId ? getCachedMonthScheduleSummary(storeId, input.year, input.month) : Promise.resolve({}),
    input.date && storeId && storeId === activeStoreId
      ? fetchDaySlots(input.date)
      : Promise.resolve(null),
  ]);
  return { monthData, monthSchedule, slots: slotResult?.slots ?? null };
}
