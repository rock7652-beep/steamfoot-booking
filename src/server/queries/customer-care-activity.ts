import "server-only";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { spaPrisma } from "@/lib/spa-db";
import { CARE_REASONS, careDisposition, type CareActivity, type CareReason } from "@/lib/customer-care-lifecycle";
import { bookingDateToday, formatTWTime, parseTaipeiDateTime, toLocalDateStr } from "@/lib/date-utils";
import type { IndustryModuleId } from "@/lib/industry-modules";

/** All reads are bounded to the viewed store and its authorized customer scope. */
export async function getCustomerCareActivity(storeId: string, module: IndustryModuleId, staffScope: string | null, year: number, now = new Date()) {
  const customers = await prisma.customer.findMany({
    where: { storeId, ...(staffScope ? { assignedStaffId: staffScope } : {}), mergedIntoCustomerId: null, NOT: { user: { is: { status: "SUSPENDED" } } } },
    select: { id: true, name: true, phone: true, assignedStaff: { select: { displayName: true, storeId: true } } },
  });
  const ids = customers.map(c => c.id);
  if (!ids.length) return { customers, latest: new Map<string, CareActivity>(), nextBookings: new Map<string, string>() };
  const followUps = await prisma.customerFollowUp.findMany({
    where: { storeId, customerId: { in: ids }, careReason: { in: [...CARE_REASONS] } },
    select: { id: true, customerId: true, careReason: true, careYear: true, result: true, note: true, createdAt: true, nextFollowUpDate: true, createdBy: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    distinct: ["customerId", "careReason", "careYear"],
  });
  const latest = new Map<string, CareActivity>();
  for (const row of followUps) {
    const reason = row.careReason as CareReason;
    if (reason === "birthday" && row.careYear !== year) continue;
    const key = `${row.customerId}:${reason}`;
    if (latest.has(key)) continue;
    latest.set(key, { id: row.id, reason, year: row.careYear, result: row.result, note: row.note, date: formatTWTime(row.createdAt), createdAt: row.createdAt.toISOString(), by: row.createdBy.name, nextDate: row.nextFollowUpDate?.toISOString().slice(0, 10) ?? null });
  }
  const nextBookings = new Map<string, string>();
  if (module === "course") {
    const bookings = await coursePrisma.courseBooking.findMany({
      where: { storeId, customerId: { in: ids }, status: "RESERVED", session: { storeId, cancelledAt: null, startsAt: { gt: now } } },
      select: { customerId: true, session: { select: { startsAt: true } } }, orderBy: { session: { startsAt: "asc" } },
    });
    for (const b of bookings) if (b.customerId && !nextBookings.has(b.customerId)) nextBookings.set(b.customerId, formatTWTime(b.session.startsAt));
  } else {
    const bookings = module === "spa"
      ? (await spaPrisma.spaBooking.findMany({ where: { storeId, customerId: { in: ids }, status: { in: ["PENDING", "CONFIRMED"] }, bookingDate: { gte: bookingDateToday() } }, select: { customerId: true, bookingDate: true, startTime: true }, orderBy: [{ bookingDate: "asc" }, { startTime: "asc" }] })).map(b => ({ ...b, time: b.startTime }))
      : (await prisma.booking.findMany({ where: { storeId, customerId: { in: ids }, bookingStatus: { in: ["PENDING", "CONFIRMED"] }, bookingDate: { gte: bookingDateToday() } }, select: { customerId: true, bookingDate: true, slotTime: true }, orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }] })).map(b => ({ ...b, time: b.slotTime }));
    for (const b of bookings) {
      const at = parseTaipeiDateTime(b.bookingDate.toISOString().slice(0, 10), b.time);
      if (at && at > now && !nextBookings.has(b.customerId)) nextBookings.set(b.customerId, formatTWTime(at));
    }
  }
  return { customers, latest, nextBookings };
}

export function getCareItemState(reason: CareReason, year: number, activity: CareActivity | null, nextBooking: string | null) {
  return careDisposition(reason, year, toLocalDateStr(), activity, nextBooking);
}
