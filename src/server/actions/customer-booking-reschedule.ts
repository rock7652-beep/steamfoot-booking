"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";
import { parseTaipeiDateTime, parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { isDutySchedulingEnabled } from "@/lib/shop-config";
import { isStoreBookable } from "@/lib/store-operating-status";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";

const CUSTOMER_RESCHEDULE_CUTOFF_MS = 12 * 60 * 60 * 1000;
const CUSTOMER_RESCHEDULE_LIMIT = 1;
const CUSTOMER_RESCHEDULABLE_TYPES = ["PACKAGE_SESSION", "SINGLE"] as const;

type AuthorizedBooking = {
  id: string;
  storeId: string;
  bookingDate: Date;
  slotTime: string;
  people: number;
  bookingStatus: string;
  customerRescheduleCount: number;
};

function startsAt(date: string, slotTime: string): Date | null {
  return parseTaipeiDateTime(date, slotTime);
}

function outsideCutoff(date: string, slotTime: string, now: Date): boolean {
  const value = startsAt(date, slotTime);
  return value !== null && value.getTime() - now.getTime() >= CUSTOMER_RESCHEDULE_CUTOFF_MS;
}

async function loadAuthorizedBooking(bookingId: string): Promise<AuthorizedBooking | null> {
  const user = await requireSession();
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      storeId: true,
      customerId: true,
      bookingDate: true,
      slotTime: true,
      people: true,
      bookingStatus: true,
      bookingType: true,
      customerRescheduleCount: true,
    },
  });
  if (!booking || !CUSTOMER_RESCHEDULABLE_TYPES.includes(booking.bookingType as (typeof CUSTOMER_RESCHEDULABLE_TYPES)[number])) {
    return null;
  }
  const customerId = await getCanonicalCustomerIdForSession({
    id: user.id,
    customerId: user.customerId ?? null,
    email: user.email ?? null,
    storeId: user.storeId ?? booking.storeId,
  });
  if (customerId !== booking.customerId) return null;
  return booking;
}

async function storeAllowsReschedule(storeId: string): Promise<boolean> {
  const [bookable, blocked] = await Promise.all([
    isStoreBookable(storeId),
    isStoreSubscriptionWriteBlocked(storeId),
  ]);
  return bookable && !blocked;
}

function bookingCanReschedule(booking: AuthorizedBooking, now: Date): boolean {
  return (
    PENDING_STATUSES.includes(booking.bookingStatus as (typeof PENDING_STATUSES)[number]) &&
    booking.customerRescheduleCount < CUSTOMER_RESCHEDULE_LIMIT &&
    outsideCutoff(booking.bookingDate.toISOString().slice(0, 10), booking.slotTime, now)
  );
}

export async function getCustomerBookingRescheduleStatus(bookingId: string) {
  const booking = await loadAuthorizedBooking(bookingId);
  if (!booking) return null;
  return {
    bookingDate: booking.bookingDate.toISOString().slice(0, 10),
    slotTime: booking.slotTime,
    bookingStatus: booking.bookingStatus,
    customerRescheduleCount: booking.customerRescheduleCount,
    canReschedule: bookingCanReschedule(booking, new Date()),
  };
}

export async function listCustomerBookingRescheduleSlots(bookingId: string, date: string): Promise<string[]> {
  const now = new Date();
  const booking = await loadAuthorizedBooking(bookingId);
  if (
    !booking ||
    !bookingCanReschedule(booking, now) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < toLocalDateStr(now) ||
    !(await storeAllowsReschedule(booking.storeId))
  ) return [];

  const ctx = await loadDayBusinessHoursContext(booking.storeId, date);
  if (ctx.rule.closed) return [];
  const dutyEnabled = await isDutySchedulingEnabled(booking.storeId);
  const [grouped, dutyRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["slotTime"],
      where: {
        storeId: booking.storeId,
        bookingDate: ctx.dateObj,
        bookingStatus: { in: [...PENDING_STATUSES] },
        NOT: { id: booking.id },
      },
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
  const used = new Map(grouped.map((row) => [row.slotTime, row._sum.people ?? 0]));
  const duty = new Set(dutyRows.map((row) => row.slotTime));
  return applySlotOverrides(ctx.rule, ctx.slotOverrides)
    .filter((slot) =>
      slot.isEnabled &&
      !(date === booking.bookingDate.toISOString().slice(0, 10) && slot.startTime === booking.slotTime) &&
      outsideCutoff(date, slot.startTime, now) &&
      (!dutyEnabled || duty.has(slot.startTime)) &&
      slot.capacity - (used.get(slot.startTime) ?? 0) >= booking.people
    )
    .map((slot) => slot.startTime);
}

export async function rescheduleCustomerBooking(
  bookingId: string,
  date: string,
  slotTime: string,
): Promise<"rescheduled" | "unavailable" | "slot_full"> {
  const now = new Date();
  const booking = await loadAuthorizedBooking(bookingId);
  if (
    !booking ||
    !bookingCanReschedule(booking, now) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < toLocalDateStr(now) ||
    !outsideCutoff(date, slotTime, now) ||
    (date === booking.bookingDate.toISOString().slice(0, 10) && slotTime === booking.slotTime) ||
    !(await storeAllowsReschedule(booking.storeId))
  ) return "unavailable";

  const ctx = await loadDayBusinessHoursContext(booking.storeId, date);
  const slot = ctx.rule.closed
    ? undefined
    : applySlotOverrides(ctx.rule, ctx.slotOverrides).find((item) => item.isEnabled && item.startTime === slotTime);
  if (!slot || !(await storeAllowsReschedule(booking.storeId))) return "unavailable";
  const dutyEnabled = await isDutySchedulingEnabled(booking.storeId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({
        where: { id: booking.id },
        select: {
          storeId: true,
          customerId: true,
          bookingType: true,
          bookingStatus: true,
          customerRescheduleCount: true,
          bookingDate: true,
          slotTime: true,
          people: true,
        },
      });
      if (
        !current ||
        current.storeId !== booking.storeId ||
        !CUSTOMER_RESCHEDULABLE_TYPES.includes(current.bookingType as (typeof CUSTOMER_RESCHEDULABLE_TYPES)[number]) ||
        !PENDING_STATUSES.includes(current.bookingStatus as (typeof PENDING_STATUSES)[number]) ||
        current.customerRescheduleCount >= CUSTOMER_RESCHEDULE_LIMIT ||
        !outsideCutoff(current.bookingDate.toISOString().slice(0, 10), current.slotTime, now)
      ) return "unavailable";
      if (dutyEnabled) {
        const duty = await tx.dutyAssignment.findFirst({
          where: { storeId: booking.storeId, date: ctx.dateObj, slotTime },
          select: { id: true },
        });
        if (!duty) return "unavailable";
      }
      const occupied = await tx.booking.aggregate({
        where: {
          storeId: booking.storeId,
          bookingDate: ctx.dateObj,
          slotTime,
          bookingStatus: { in: [...PENDING_STATUSES] },
          NOT: { id: booking.id },
        },
        _sum: { people: true },
      });
      if ((occupied._sum.people ?? 0) + current.people > slot.capacity) return "slot_full";
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          originalBookingDate: current.bookingDate,
          originalSlotTime: current.slotTime,
          bookingDate: parseTaiwanDateToDbDate(date),
          slotTime,
          customerRescheduleCount: { increment: 1 },
          customerRescheduledAt: now,
          customerConfirmedAt: null,
        },
      });
      return "rescheduled";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result === "rescheduled") {
      revalidatePath("/my-bookings");
    }
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return "slot_full";
    throw error;
  }
}
