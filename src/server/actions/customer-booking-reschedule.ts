"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requireCustomerBookingEligibility } from "@/lib/customer-booking-eligibility";
import { parseTaipeiDateTime, parseTaiwanDateToDbDate, toLocalDateStr } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import { applySlotOverrides, loadDayBusinessHoursContext } from "@/lib/business-hours-resolver";
import { isDutySchedulingEnabled, resolveBookableUntilDate } from "@/lib/shop-config";
import { isStoreBookable } from "@/lib/store-operating-status";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";
import {
  acquireBookingSlotLocks,
  bookingSlotTimeVariants,
  canonicalizeBookingSlotTime,
} from "@/server/services/booking-slot-lock";

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
  bookingType: "PACKAGE_SESSION" | "SINGLE";
  isMakeup: boolean;
  customerPlanWallet: {
    status: string;
    expiryDate: Date | null;
  } | null;
  walletSessions: Array<{
    wallet: {
      status: string;
      expiryDate: Date | null;
    };
  }>;
};

function startsAt(date: string, slotTime: string): Date | null {
  try {
    return parseTaipeiDateTime(date, canonicalizeBookingSlotTime(slotTime));
  } catch {
    return null;
  }
}

function sameSlotTime(left: string, right: string): boolean {
  try {
    return canonicalizeBookingSlotTime(left) === canonicalizeBookingSlotTime(right);
  } catch {
    return false;
  }
}

function isValidRescheduleDate(date: string): boolean {
  return parseTaipeiDateTime(date, "00:00") !== null;
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
      isMakeup: true,
      customerPlanWallet: {
        select: { status: true, expiryDate: true },
      },
      walletSessions: {
        where: { status: "RESERVED" },
        select: {
          wallet: { select: { status: true, expiryDate: true } },
        },
      },
      customerRescheduleCount: true,
    },
  });
  if (!booking || !CUSTOMER_RESCHEDULABLE_TYPES.includes(booking.bookingType as (typeof CUSTOMER_RESCHEDULABLE_TYPES)[number])) {
    return null;
  }
  if (user.role !== "CUSTOMER") return null;
  const eligibility = await requireCustomerBookingEligibility(user);
  if (eligibility.customerId !== booking.customerId || eligibility.storeId !== booking.storeId) return null;
  return booking as AuthorizedBooking;
}

async function storeAllowsReschedule(storeId: string): Promise<boolean> {
  const [bookable, blocked] = await Promise.all([
    isStoreBookable(storeId),
    isStoreSubscriptionWriteBlocked(storeId),
  ]);
  return bookable && !blocked;
}

async function storeBookingHorizonAllows(storeId: string, date: string): Promise<boolean> {
  const config = await prisma.shopConfig.findUnique({
    where: { storeId },
    select: { bookableUntilDate: true },
  });
  return date <= resolveBookableUntilDate(config?.bookableUntilDate);
}

function bookingCanReschedule(booking: AuthorizedBooking, now: Date): boolean {
  return (
    PENDING_STATUSES.includes(booking.bookingStatus as (typeof PENDING_STATUSES)[number]) &&
    booking.customerRescheduleCount < CUSTOMER_RESCHEDULE_LIMIT &&
    outsideCutoff(booking.bookingDate.toISOString().slice(0, 10), booking.slotTime, now)
  );
}

function entitlementCoversDate(
  booking: {
    bookingType: string;
    isMakeup: boolean;
    customerPlanWallet: AuthorizedBooking["customerPlanWallet"];
    walletSessions: AuthorizedBooking["walletSessions"];
  },
  date: string,
): boolean {
  if (booking.bookingType === "SINGLE") return true;
  // Makeup bookings may consume multiple credits with independent expiry
  // dates. Keep that exceptional flow store-assisted until it has a dedicated
  // multi-credit reschedule contract.
  if (booking.isMakeup) return false;
  const targetDate = parseTaiwanDateToDbDate(date);
  const reservedWallets = booking.walletSessions.map((session) => session.wallet);
  // Historical bookings may predate WalletSession allocation. In that case,
  // retain the primary-wallet check; current multi-person bookings must prove
  // every actually reserved wallet covers the new service date.
  const wallets = reservedWallets.length > 0
    ? reservedWallets
    : booking.customerPlanWallet
      ? [booking.customerPlanWallet]
      : [];
  return wallets.length > 0 && wallets.every(
    (wallet) => wallet.status === "ACTIVE" && (!wallet.expiryDate || wallet.expiryDate >= targetDate),
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
    !isValidRescheduleDate(date) ||
    date < toLocalDateStr(now) ||
    !entitlementCoversDate(booking, date) ||
    !(await storeBookingHorizonAllows(booking.storeId, date)) ||
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
  const used = new Map<string, number>();
  for (const row of grouped) {
    const canonical = canonicalizeBookingSlotTime(row.slotTime);
    used.set(canonical, (used.get(canonical) ?? 0) + (row._sum.people ?? 0));
  }
  const duty = new Set(dutyRows.map((row) => row.slotTime));
  return applySlotOverrides(ctx.rule, ctx.slotOverrides)
    .filter((slot) =>
      slot.isEnabled &&
      !(date === booking.bookingDate.toISOString().slice(0, 10) && sameSlotTime(slot.startTime, booking.slotTime)) &&
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
    !isValidRescheduleDate(date) ||
    date < toLocalDateStr(now) ||
    !entitlementCoversDate(booking, date) ||
    !(await storeBookingHorizonAllows(booking.storeId, date)) ||
    !outsideCutoff(date, slotTime, now) ||
    (date === booking.bookingDate.toISOString().slice(0, 10) && sameSlotTime(slotTime, booking.slotTime)) ||
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
      await acquireBookingSlotLocks(tx, [
        {
          storeId: booking.storeId,
          bookingDate: booking.bookingDate.toISOString().slice(0, 10),
          slotTime: booking.slotTime,
        },
        { storeId: booking.storeId, bookingDate: date, slotTime },
      ]);
      const current = await tx.booking.findUnique({
        where: { id: booking.id },
        select: {
          storeId: true,
          customerId: true,
          bookingType: true,
          isMakeup: true,
          customerPlanWallet: {
            select: { status: true, expiryDate: true },
          },
          walletSessions: {
            where: { status: "RESERVED" },
            select: {
              wallet: { select: { status: true, expiryDate: true } },
            },
          },
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
        current.bookingDate.getTime() !== booking.bookingDate.getTime() ||
        !sameSlotTime(current.slotTime, booking.slotTime) ||
        !entitlementCoversDate(current, date) ||
        (date === current.bookingDate.toISOString().slice(0, 10) && sameSlotTime(slotTime, current.slotTime)) ||
        !outsideCutoff(current.bookingDate.toISOString().slice(0, 10), current.slotTime, now)
      ) return "unavailable";
      const config = await tx.shopConfig.findUnique({
        where: { storeId: booking.storeId },
        select: { bookableUntilDate: true },
      });
      if (date > resolveBookableUntilDate(config?.bookableUntilDate)) return "unavailable";
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
          slotTime: { in: bookingSlotTimeVariants(slotTime) },
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
