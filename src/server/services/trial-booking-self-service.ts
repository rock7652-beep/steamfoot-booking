import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";

const TOKEN_TTL_DAYS = 7;
function tokenSignature(value: string): string {
  const secret = process.env.TRIAL_BOOKING_ACTION_SECRET;
  if (!secret) throw new Error("TRIAL_BOOKING_ACTION_SECRET_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

/** Opaque signed token; it carries IDs and expiry only, never customer data. */
export function createTrialBookingActionToken(booking: { id: string; storeId: string }, now = new Date()): string {
  const expiresAt = Math.floor((now.getTime() + TOKEN_TTL_DAYS * 86400_000) / 1000);
  const payload = `${booking.id}.${booking.storeId}.${expiresAt}`;
  return `${payload}.${tokenSignature(payload)}`;
}

export function verifyTrialBookingActionToken(token: string, now = new Date()): { bookingId: string; storeId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [bookingId, storeId, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!bookingId || !storeId || !Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now.getTime()) return null;
  try {
    const expected = Buffer.from(tokenSignature(`${bookingId}.${storeId}.${expiresAtRaw}`));
    const received = Buffer.from(signature);
    return expected.length === received.length && timingSafeEqual(expected, received) ? { bookingId, storeId } : null;
  } catch { return null; }
}

function bookingStartsAt(booking: { bookingDate: Date; slotTime: string }): Date {
  return new Date(`${booking.bookingDate.toISOString().slice(0, 10)}T${booking.slotTime}:00+08:00`);
}

function selfServiceAllowed(booking: { bookingDate: Date; slotTime: string }, now: Date): boolean {
  return bookingStartsAt(booking).getTime() - now.getTime() > 2 * 60 * 60 * 1000;
}

async function loadAuthorizedBooking(token: string, now = new Date()) {
  const verified = verifyTrialBookingActionToken(token, now);
  if (!verified) return null;
  return prisma.booking.findFirst({
    where: { id: verified.bookingId, storeId: verified.storeId, bookingType: "FIRST_TRIAL" },
    select: { id: true, storeId: true, bookingDate: true, slotTime: true, people: true, bookingStatus: true, customerRescheduleCount: true, customerConfirmedAt: true },
  });
}

export async function confirmTrialBooking(token: string, now = new Date()): Promise<"confirmed" | "already_confirmed" | "unavailable"> {
  const booking = await loadAuthorizedBooking(token, now);
  if (!booking || booking.bookingStatus === "CANCELLED" || !selfServiceAllowed(booking, now)) return "unavailable";
  if (booking.customerConfirmedAt) return "already_confirmed";
  const updated = await prisma.booking.updateMany({
    where: { id: booking.id, storeId: booking.storeId, customerConfirmedAt: null, bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
    data: { customerConfirmedAt: now },
  });
  return updated.count ? "confirmed" : "already_confirmed";
}

export async function cancelTrialBooking(token: string, now = new Date()): Promise<"cancelled" | "already_cancelled" | "unavailable"> {
  const booking = await loadAuthorizedBooking(token, now);
  if (!booking || !selfServiceAllowed(booking, now)) return "unavailable";
  if (booking.bookingStatus === "CANCELLED") return "already_cancelled";
  const updated = await prisma.booking.updateMany({
    where: { id: booking.id, storeId: booking.storeId, bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
    data: { bookingStatus: "CANCELLED", customerCancelledAt: now, customerCancelledSource: "CHAT_SELF_SERVICE" },
  });
  return updated.count ? "cancelled" : "already_cancelled";
}

export async function listTrialRescheduleSlots(token: string, date: string, now = new Date()) {
  const booking = await loadAuthorizedBooking(token, now);
  if (!booking || booking.customerRescheduleCount >= 1 || !selfServiceAllowed(booking, now) || date < toLocalDateStr(now)) return [];
  const ctx = await loadDayBusinessHoursContext(booking.storeId, date);
  if (ctx.rule.closed) return [];
  const grouped = await prisma.booking.groupBy({
    by: ["slotTime"],
    where: { storeId: booking.storeId, bookingDate: ctx.dateObj, bookingStatus: { in: [...PENDING_STATUSES] } },
    _sum: { people: true },
  });
  const used = new Map(grouped.map(row => [row.slotTime, row._sum.people ?? 0]));
  return applySlotOverrides(ctx.rule, ctx.slotOverrides)
    .filter(slot => slot.isEnabled && (slot.capacity - (used.get(slot.startTime) ?? 0)) >= booking.people)
    .map(slot => slot.startTime);
}

export async function rescheduleTrialBooking(token: string, date: string, slotTime: string, now = new Date()): Promise<"rescheduled" | "unavailable" | "slot_full"> {
  const booking = await loadAuthorizedBooking(token, now);
  if (!booking || booking.customerRescheduleCount >= 1 || !selfServiceAllowed(booking, now) || date < toLocalDateStr(now)) return "unavailable";
  const ctx = await loadDayBusinessHoursContext(booking.storeId, date);
  const slot = !ctx.rule.closed && applySlotOverrides(ctx.rule, ctx.slotOverrides).find(item => item.isEnabled && item.startTime === slotTime);
  if (!slot) return "unavailable";
  try {
    return await prisma.$transaction(async tx => {
      const current = await tx.booking.findFirst({ where: { id: booking.id, storeId: booking.storeId }, select: { bookingStatus: true, customerRescheduleCount: true } });
      if (!current || !["PENDING", "CONFIRMED"].includes(current.bookingStatus) || current.customerRescheduleCount >= 1) return "unavailable";
      const occupied = await tx.booking.aggregate({ where: { storeId: booking.storeId, bookingDate: ctx.dateObj, slotTime, bookingStatus: { in: [...PENDING_STATUSES] } }, _sum: { people: true } });
      if ((occupied._sum.people ?? 0) + booking.people > slot.capacity) return "slot_full";
      await tx.booking.update({ where: { id: booking.id }, data: {
        originalBookingDate: booking.bookingDate, originalSlotTime: booking.slotTime,
        bookingDate: parseTaiwanDateToDbDate(date), slotTime, customerRescheduleCount: { increment: 1 }, customerRescheduledAt: now, customerConfirmedAt: null,
      } });
      return "rescheduled";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return "slot_full";
    throw error;
  }
}
