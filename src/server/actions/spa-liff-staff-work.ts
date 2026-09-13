"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaPrisma } from "@/lib/spa-db";
import { requireSession } from "@/lib/session";
import {
  bookingMonthRange,
  parseTaiwanDateToDbDate,
  toLocalDateStr,
} from "@/lib/date-utils";
import { resolveActiveStaffMemberForStore } from "@/server/services/staff-member-access";
import { resolveMemberRequestStoreId } from "@/server/services/member-request-store";

const dateSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

export type LiffStaffWorkRow = {
  id: string;
  startTime: string;
  endTime: string;
  customerName: string;
  serviceName: string;
  locationName: string;
  status: string;
  note: string | null;
};

export type FetchLiffStaffWorkResult =
  | { status: "ok"; staffName: string; selectedDate: string; rows: LiffStaffWorkRow[]; monthCounts: Record<string, number> }
  | { status: "no_access" }
  | { status: "service_unavailable" };

export async function fetchLiffStaffWork(input?: { date?: string }): Promise<FetchLiffStaffWorkResult> {
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_access" };
  }
  try {
    const storeId = await resolveMemberRequestStoreId(user.storeId);
    if (!storeId) return { status: "no_access" };
    const access = await resolveActiveStaffMemberForStore(user.id, storeId);
    if (!access) return { status: "no_access" };

    const selectedDate = input?.date && dateSchema.safeParse(input.date).success ? input.date : toLocalDateStr();
    const [year, month] = selectedDate.split("-").map(Number);
    const monthRange = bookingMonthRange(year, month);
    const [bookings, monthBookings] = await Promise.all([
      spaPrisma.spaBooking.findMany({
        where: {
          storeId: access.storeId,
          serviceStaffId: access.staffId,
          bookingDate: parseTaiwanDateToDbDate(selectedDate),
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        },
        select: {
          id: true,
          customerId: true,
          startTime: true,
          endTime: true,
          status: true,
          serviceNameSnapshot: true,
          notes: true,
          serviceLocation: { select: { name: true } },
          items: { select: { treatmentNameSnapshot: true }, orderBy: { sortOrder: "asc" } },
        },
        orderBy: { startTime: "asc" },
      }),
      spaPrisma.spaBooking.findMany({
        where: {
          storeId: access.storeId,
          serviceStaffId: access.staffId,
          bookingDate: { gte: monthRange.start, lte: monthRange.end },
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        },
        select: { bookingDate: true },
      }),
    ]);
    const customers = await prisma.customer.findMany({
      where: { storeId: access.storeId, id: { in: [...new Set(bookings.map((booking) => booking.customerId))] } },
      select: { id: true, name: true },
    });
    const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
    const monthCounts: Record<string, number> = {};
    for (const booking of monthBookings) {
      const key = booking.bookingDate.toISOString().slice(0, 10);
      monthCounts[key] = (monthCounts[key] ?? 0) + 1;
    }
    return {
      status: "ok",
      staffName: access.staffName,
      selectedDate,
      monthCounts,
      rows: bookings.map((booking) => ({
        id: booking.id,
        startTime: booking.startTime,
        endTime: booking.endTime,
        customerName: customerNames.get(booking.customerId) ?? "顧客",
        serviceName: booking.items.map((item) => item.treatmentNameSnapshot).filter(Boolean).join("、") || booking.serviceNameSnapshot || "服務項目",
        locationName: booking.serviceLocation?.name ?? "待安排位置",
        status: booking.status,
        // Booking notes are customer-facing booking notes. Customer.serviceNote is never queried here.
        note: booking.notes,
      })),
    };
  } catch (error) {
    console.error("[fetchLiffStaffWork] failed", error);
    return { status: "service_unavailable" };
  }
}
