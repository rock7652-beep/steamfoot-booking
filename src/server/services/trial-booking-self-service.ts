import { loadSelectedBookingServices, selectedBookingServiceName, selectedServicesCoverDate } from "./booking-service-selection";
import { acquireBookingSlotLocks } from "./booking-slot-lock";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseTaipeiDateTime, parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { isDutySchedulingEnabled } from "@/lib/shop-config";
import { isStoreBookable } from "@/lib/store-operating-status";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";

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
  return parseTaipeiDateTime(booking.bookingDate.toISOString().slice(0, 10), booking.slotTime) ?? new Date(Number.NaN);
}

const SELF_SERVICE_CUTOFF_MS = 12 * 60 * 60 * 1000;

function selfServiceAllowed(booking: { bookingDate: Date; slotTime: string }, now: Date): boolean {
  return bookingStartsAt(booking).getTime() - now.getTime() >= SELF_SERVICE_CUTOFF_MS;
}

export function isTrialRescheduleTargetAllowed(date: string, slotTime: string, now: Date): boolean {
  const startsAt = parseTaipeiDateTime(date, slotTime);
  return startsAt !== null && startsAt.getTime() - now.getTime() >= SELF_SERVICE_CUTOFF_MS;
}

function isValidTrialRescheduleDate(date: string): boolean {
  return parseTaipeiDateTime(date, "00:00") !== null;
}

async function loadAuthorizedBooking(token: string, now = new Date()) {
  const verified = verifyTrialBookingActionToken(token, now);
  if (!verified) return null;
  return prisma.booking.findFirst({
    where: { id: verified.bookingId, storeId: verified.storeId, bookingType: "FIRST_TRIAL" },
    select: { id: true, storeId: true, bookingDate: true, slotTime: true, people: true, bookingStatus: true, customerRescheduleCount: true, customerConfirmedAt: true },
  });
}

/** Minimal signed-link projection for the self-service page; no customer data. */
export async function getTrialBookingManagementStatus(token: string, now = new Date()): Promise<{
  bookingDate: string;
  slotTime: string;
  customerRescheduleCount: number;
  bookingStatus: string;
  serviceName: string;
} | null> {
  const booking = await loadAuthorizedBooking(token, now);
  if (!booking) return null;
  const services = await loadSelectedBookingServices(booking);
  return {
    serviceName: selectedBookingServiceName(services, "FIRST_TRIAL"),
    bookingDate: booking.bookingDate.toISOString().slice(0, 10),
    slotTime: booking.slotTime,
    customerRescheduleCount: booking.customerRescheduleCount,
    bookingStatus: booking.bookingStatus,
  };
}

async function isRescheduleStoreWritable(storeId: string): Promise<boolean> {
  const [bookable, subscriptionWriteBlocked] = await Promise.all([
    isStoreBookable(storeId),
    isStoreSubscriptionWriteBlocked(storeId),
  ]);
  return bookable && !subscriptionWriteBlocked;
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
  const services = await loadSelectedBookingServices(booking);
  if (services.some(person => person.service === "PACKAGE_SESSION")) return "unavailable";
  const updated = await prisma.booking.updateMany({
    where: { id: booking.id, storeId: booking.storeId, bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
    data: { bookingStatus: "CANCELLED", customerCancelledAt: now, customerCancelledSource: "CHAT_SELF_SERVICE" },
  });
  return updated.count ? "cancelled" : "already_cancelled";
}

export async function listTrialRescheduleSlots(token: string, date: string, now = new Date()) {
  const booking = await loadAuthorizedBooking(token, now);
  if (
    !booking ||
    booking.customerRescheduleCount >= 1 ||
    !selfServiceAllowed(booking, now) ||
    !isValidTrialRescheduleDate(date) ||
    date < toLocalDateStr(now)
  ) return [];
  if (!(await isRescheduleStoreWritable(booking.storeId))) return [];
  if (!selectedServicesCoverDate(await loadSelectedBookingServices(booking), date)) return [];
  const ctx = await loadDayBusinessHoursContext(booking.storeId, date);
  if (ctx.rule.closed) return [];
  const dutyEnabled = await isDutySchedulingEnabled(booking.storeId);
  const [grouped, dutyRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["slotTime"],
      where: { storeId: booking.storeId, bookingDate: ctx.dateObj, bookingStatus: { in: [...PENDING_STATUSES] }, NOT: { id: booking.id } },
      _sum: { people: true },
    }),
    dutyEnabled
      ? prisma.dutyAssignment.findMany({
          where: { storeId: booking.storeId, date: ctx.dateObj },
          select: { slotTime: true },
          distinct: ["slotTime"],
        })
      : Promise.resolve([]),
  ]);
  const used = new Map(grouped.map(row => [row.slotTime, row._sum.people ?? 0]));
  const duty = new Set(dutyRows.map(row => row.slotTime));
  return applySlotOverrides(ctx.rule, ctx.slotOverrides)
    .filter(slot =>
      slot.isEnabled &&
      !(date === booking.bookingDate.toISOString().slice(0, 10) && slot.startTime === booking.slotTime) &&
      isTrialRescheduleTargetAllowed(date, slot.startTime, now) &&
      (!dutyEnabled || duty.has(slot.startTime)) &&
      (slot.capacity - (used.get(slot.startTime) ?? 0)) >= booking.people
    )
    .map(slot => slot.startTime);
}

export async function rescheduleTrialBooking(token: string, date: string, slotTime: string, now = new Date()): Promise<"rescheduled" | "unavailable" | "slot_full"> {
  const booking = await loadAuthorizedBooking(token, now);
  if (
    !booking ||
    booking.customerRescheduleCount >= 1 ||
    !selfServiceAllowed(booking, now) ||
    !isTrialRescheduleTargetAllowed(date, slotTime, now) ||
    (date === booking.bookingDate.toISOString().slice(0, 10) && slotTime === booking.slotTime) ||
    date < toLocalDateStr(now)
  ) return "unavailable";
  if (!(await isRescheduleStoreWritable(booking.storeId))) return "unavailable";
  if (!selectedServicesCoverDate(await loadSelectedBookingServices(booking), date)) return "unavailable";
  const ctx = await loadDayBusinessHoursContext(booking.storeId, date);
  const slot = !ctx.rule.closed
    ? applySlotOverrides(ctx.rule, ctx.slotOverrides).find(item => item.isEnabled && item.startTime === slotTime)
    : undefined;
  if (!slot) return "unavailable";
  const dutyEnabled = await isDutySchedulingEnabled(booking.storeId);
  // Re-check immediately before opening the write transaction. A customer may
  // keep an old reminder page open while the store is paused or becomes
  // read-only after availability was loaded.
  if (!(await isRescheduleStoreWritable(booking.storeId))) return "unavailable";
  try {
    return await prisma.$transaction(async tx => {
      await acquireBookingSlotLocks(tx, [
        { storeId: booking.storeId, bookingDate: booking.bookingDate.toISOString().slice(0, 10), slotTime: booking.slotTime },
        { storeId: booking.storeId, bookingDate: date, slotTime },
      ]);
      if (process.env.BOOKING_PARTICIPANTS_ENABLED === "true") {
        await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${booking.id} AND "storeId" = ${booking.storeId} FOR UPDATE`;
      }
      const current = await tx.booking.findFirst({
        where: { id: booking.id, storeId: booking.storeId },
        select: { bookingStatus: true, customerRescheduleCount: true, bookingDate: true, slotTime: true, people: true, bookingType: true },
      });
      if (!current || current.bookingType !== "FIRST_TRIAL" || !["PENDING", "CONFIRMED"].includes(current.bookingStatus) || current.customerRescheduleCount >= 1) return "unavailable";
      if (current.bookingDate.getTime() !== booking.bookingDate.getTime() || current.slotTime !== booking.slotTime ||
        !selfServiceAllowed(current, now) || !selectedServicesCoverDate(await loadSelectedBookingServices(booking, tx), date)) return "unavailable";
      if (date === current.bookingDate.toISOString().slice(0, 10) && slotTime === current.slotTime) return "unavailable";
      if (!isTrialRescheduleTargetAllowed(date, slotTime, now)) return "unavailable";
      if (dutyEnabled) {
        const duty = await tx.dutyAssignment.findFirst({
          where: { storeId: booking.storeId, date: ctx.dateObj, slotTime },
          select: { id: true },
        });
        if (!duty) return "unavailable";
      }
      const occupied = await tx.booking.aggregate({ where: { storeId: booking.storeId, bookingDate: ctx.dateObj, slotTime, bookingStatus: { in: [...PENDING_STATUSES] }, NOT: { id: booking.id } }, _sum: { people: true } });
      if ((occupied._sum.people ?? 0) + current.people > slot.capacity) return "slot_full";
      await tx.booking.update({ where: { id: booking.id }, data: {
        originalBookingDate: current.bookingDate, originalSlotTime: current.slotTime,
        bookingDate: parseTaiwanDateToDbDate(date), slotTime, customerRescheduleCount: { increment: 1 }, customerRescheduledAt: now, customerConfirmedAt: null,
      } });
      return "rescheduled";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return "slot_full";
    throw error;
  }
}
