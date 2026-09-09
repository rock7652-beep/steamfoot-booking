"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { requireStaffSession } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { PENDING_STATUSES } from "@/lib/booking-constants";

export interface CustomerBookedDate {
  date: string;
  time: string;
  people: number;
}

/** Read-only, current-store STEAMFOOT hint. Never used to reject a booking. */
export async function fetchCustomerBookedDates(
  customerId: string,
  firstDate: string,
  lastDate: string,
): Promise<CustomerBookedDate[]> {
  await requirePermission("booking.create");
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
  if (!customerId || !validDate(firstDate) || !validDate(lastDate)
    || firstDate > lastDate || Date.parse(lastDate) - Date.parse(firstDate) > 366 * 86400000) {
    throw new Error("無法讀取已預約日期");
  }
  const user = await requireStaffSession();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || await getStoreIndustryModule(storeId) === "spa") return [];
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...getManagerCustomerWhere(user.role, user.staffId, storeId) },
    select: { id: true },
  });
  if (!customer) return [];
  const bookings = await prisma.booking.findMany({
    where: {
      storeId, customerId,
      bookingStatus: { in: [...PENDING_STATUSES] },
      bookingDate: { gte: new Date(firstDate), lte: new Date(lastDate) },
    },
    select: { bookingDate: true, slotTime: true, people: true },
    orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
  });
  return bookings.map((booking) => ({
    date: booking.bookingDate.toISOString().slice(0, 10),
    time: booking.slotTime, people: booking.people,
  }));
}
