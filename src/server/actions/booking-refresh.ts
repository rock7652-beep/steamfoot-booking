"use server";

import { OperationTiming } from "@/lib/operation-timing";

import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead, validateStoreAccess } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getMonthBookingSummary } from "@/server/queries/booking";
import { getCachedMonthScheduleSummary } from "@/lib/query-cache";
import { fetchDaySlots } from "@/server/actions/slots";
import { loadBookingRosterLabels } from "@/server/queries/booking-roster-labels";
import { AppError } from "@/lib/errors";

/** Reuse the complete calendar DTO, including wallets, notes and collections. */
export async function refreshBookingManagement(input: {
  year: number;
  month: number;
  storeId?: string;
  date: string | null;
}) {
  // Fixed action label only; no arguments, customer data, or identifiers.
  console.info("[BOOKING_ACTION]", "refreshBookingManagement");
  const timing = new OperationTiming("steamfoot.refresh");
  try {
  if (input.storeId !== undefined && (typeof input.storeId !== "string" || !input.storeId.trim() || input.storeId === "__all__" || input.storeId.length > 100)) throw new AppError("VALIDATION", "門市無效");
  const user = await timing.measure("permission", () => input.storeId
    ? requirePermission("booking.read", undefined, { storeId: input.storeId })
    : requirePermission("booking.read"));
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
  // Explicit reads use their validated scope for both the roster and slots.
  // Only legacy reads need the active route/cookie fallback.
  const [activeStoreId, explicitStoreId] = await Promise.all([
    !input.storeId
      ? timing.measure("activeStore", () => getActiveStoreForRead(user))
      : Promise.resolve(null),
    input.storeId
      ? timing.measure("explicitStore", () => validateStoreAccess(user, input.storeId!, "read"))
      : Promise.resolve(null),
  ]);
  const storeId = input.storeId ? explicitStoreId : activeStoreId;
  if (storeId && await timing.measure("industry", () => getStoreIndustryModule(storeId)) !== "steamfoot") {
    throw new AppError("FORBIDDEN", "此更新僅適用蒸足預約管理");
  }
  // Never combine an explicit roster with another cookie-selected store.
  // The slots action rechecks permission and store access for this exact ID.
  const [monthData, monthSchedule, slotResult] = await Promise.all([
    timing.measure("month", () => getMonthBookingSummary(input.year, input.month, storeId)),
    timing.measure("schedule", () => storeId ? getCachedMonthScheduleSummary(storeId, input.year, input.month) : Promise.resolve({})),
    input.date && storeId
      ? timing.measure("slots", () => input.storeId ? fetchDaySlots(input.date!, storeId) : fetchDaySlots(input.date!))
      : Promise.resolve(null),
  ]);
  const customerLabels=await timing.measure("labels",()=>loadBookingRosterLabels(monthData,storeId));
  return { monthData, monthSchedule, slots: slotResult?.slots ?? null, customerLabels };
  } finally { timing.finish(); }
}
