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
import { effectiveShifts } from "@/lib/spa-roster";
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
  items: Array<{
    name: string;
    variant: string | null;
    serviceMinutes: number;
    bufferMinutes: number;
  }>;
};

export type LiffStaffWorkCalendarDay = {
  date: string;
  bookingCount: number;
  isLeave: boolean;
};

export type FetchLiffStaffWorkResult =
  | { status: "ok"; staffName: string; selectedDate: string; rows: LiffStaffWorkRow[]; calendarDays: LiffStaffWorkCalendarDay[] }
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
    const [bookings, monthBookings, weeklyAvailability, monthExceptions] = await Promise.all([
      spaPrisma.spaBooking.findMany({
        where: {
          storeId: access.storeId,
          serviceStaffId: access.staffId,
          bookingDate: parseTaiwanDateToDbDate(selectedDate),
          status: { not: "CANCELLED" },
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
          items: {
            select: {
              treatmentNameSnapshot: true,
              variantSnapshot: true,
              serviceMinutes: true,
              bufferMinutes: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { startTime: "asc" },
      }),
      spaPrisma.spaBooking.findMany({
        where: {
          storeId: access.storeId,
          serviceStaffId: access.staffId,
          bookingDate: { gte: monthRange.start, lte: monthRange.end },
          status: { not: "CANCELLED" },
        },
        select: { bookingDate: true },
      }),
      spaPrisma.spaStaffAvailability.findMany({
        where: { storeId: access.storeId, staffId: access.staffId, isActive: true },
        select: { dayOfWeek: true, startTime: true, endTime: true, isActive: true },
      }),
      spaPrisma.spaStaffAvailabilityException.findMany({
        where: {
          storeId: access.storeId,
          staffId: access.staffId,
          date: { gte: monthRange.start, lte: monthRange.end },
        },
        select: { date: true, type: true, startTime: true, endTime: true },
      }),
    ]);
    const customers = await prisma.customer.findMany({
      where: { storeId: access.storeId, id: { in: [...new Set(bookings.map((booking) => booking.customerId))] } },
      select: { id: true, name: true },
    });
    const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
    const monthCounts = new Map<string, number>();
    for (const booking of monthBookings) {
      const key = booking.bookingDate.toISOString().slice(0, 10);
      monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
    }
    const exceptionsByDate = new Map<string, typeof monthExceptions>();
    for (const exception of monthExceptions) {
      const key = exception.date.toISOString().slice(0, 10);
      exceptionsByDate.set(key, [...(exceptionsByDate.get(key) ?? []), exception]);
    }
    const calendarDays: LiffStaffWorkCalendarDay[] = [];
    for (let day = 1; day <= monthRange.end.getUTCDate(); day += 1) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayOfWeek = parseTaiwanDateToDbDate(date).getUTCDay();
      const regular = weeklyAvailability.find((availability) => availability.dayOfWeek === dayOfWeek) ?? null;
      const exceptions = exceptionsByDate.get(date) ?? [];
      calendarDays.push({
        date,
        bookingCount: monthCounts.get(date) ?? 0,
        isLeave: effectiveShifts(regular, exceptions).length === 0,
      });
    }
    return {
      status: "ok",
      staffName: access.staffName,
      selectedDate,
      calendarDays,
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
        items: booking.items.map((item) => ({
          name: item.treatmentNameSnapshot,
          variant: item.variantSnapshot,
          serviceMinutes: item.serviceMinutes,
          bufferMinutes: item.bufferMinutes,
        })),
      })),
    };
  } catch (error) {
    console.error("[fetchLiffStaffWork] failed", error);
    return { status: "service_unavailable" };
  }
}
