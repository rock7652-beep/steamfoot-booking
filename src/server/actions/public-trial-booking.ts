"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import {
  applySlotOverrides,
  loadDayBusinessHoursContext,
} from "@/lib/business-hours-resolver";
import {
  checkBookingLimit,
  checkCustomerLimit,
  getTrialSettings,
  isDutySchedulingEnabled,
} from "@/lib/shop-config";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";
import { isStoreBookable } from "@/lib/store-operating-status";
import { ensureTrialPlan } from "@/server/services/trial-plan";
import type { SlotAvailability } from "@/types";

const STORE_SLUG = "zhubei";

const InputSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(50),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{8}$/, "請輸入正確手機號碼")),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  // 蜜罐欄位：一般顧客看不到；機器人若填值直接拒絕。
  website: z.string().max(0).optional().default(""),
});

export type PublicTrialBookingResult =
  | { status: "ok"; bookingId: string; bookingDate: string; slotTime: string }
  | { status: "invalid_input"; message: string }
  | { status: "already_has_trial"; bookingDate: string; slotTime: string }
  | { status: "slot_full" }
  | { status: "slot_unavailable" }
  | { status: "store_unavailable" }
  | { status: "limit_reached" }
  | { status: "service_unavailable" };

async function resolvePublicStore() {
  return prisma.store.findUnique({
    where: { slug: STORE_SLUG },
    select: { id: true, slug: true },
  });
}

export async function fetchPublicTrialSlots(date: string): Promise<{ slots: SlotAvailability[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slots: [] };
  const store = await resolvePublicStore();
  if (!store || !(await isStoreBookable(store.id))) return { slots: [] };
  if (await isStoreSubscriptionWriteBlocked(store.id)) return { slots: [] };

  const today = toLocalDateStr();
  if (date < today) return { slots: [] };

  const ctx = await loadDayBusinessHoursContext(store.id, date);
  if (ctx.rule.closed) return { slots: [] };

  const resolved = applySlotOverrides(ctx.rule, ctx.slotOverrides).filter((slot) => slot.isEnabled);
  if (resolved.length === 0) return { slots: [] };

  const dutyEnabled = await isDutySchedulingEnabled(store.id);
  const [bookings, dutyRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["slotTime"],
      where: {
        storeId: store.id,
        bookingDate: ctx.dateObj,
        bookingStatus: { in: [...PENDING_STATUSES] },
      },
      _sum: { people: true },
    }),
    dutyEnabled
      ? prisma.dutyAssignment.findMany({
          where: { storeId: store.id, date: ctx.dateObj },
          select: { slotTime: true },
          distinct: ["slotTime"],
        })
      : Promise.resolve([]),
  ]);

  const booked = new Map(bookings.map((row) => [row.slotTime, row._sum.people ?? 0]));
  const duty = new Set(dutyRows.map((row) => row.slotTime));
  const isToday = date === today;
  const now = isToday ? getNowTaipeiHHmm() : null;

  return {
    slots: resolved
      .filter((slot) => !dutyEnabled || duty.has(slot.startTime))
      .map((slot) => {
        const bookedCount = booked.get(slot.startTime) ?? 0;
        const isPast = isToday && now !== null && slot.startTime <= now;
        return {
          startTime: slot.startTime,
          capacity: slot.capacity,
          bookedCount,
          available: isPast ? 0 : Math.max(0, slot.capacity - bookedCount),
          isEnabled: true,
          isPast,
        };
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  };
}

export async function submitPublicTrialBooking(input: unknown): Promise<PublicTrialBookingResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid_input", message: parsed.error.issues[0]?.message ?? "資料格式不正確" };
  }

  const data = parsed.data;
  try {
    const store = await resolvePublicStore();
    if (!store || !(await isStoreBookable(store.id))) return { status: "store_unavailable" };
    if (await isStoreSubscriptionWriteBlocked(store.id)) return { status: "store_unavailable" };

    const [settings, customerLimit, bookingLimit] = await Promise.all([
      getTrialSettings(store.id),
      checkCustomerLimit(store.id),
      checkBookingLimit(store.id),
    ]);
    if (!settings.trialEnabled) return { status: "store_unavailable" };
    if (!customerLimit.allowed || !bookingLimit.allowed) return { status: "limit_reached" };

    const today = toLocalDateStr();
    if (data.bookingDate < today) return { status: "slot_unavailable" };

    const ctx = await loadDayBusinessHoursContext(store.id, data.bookingDate);
    if (ctx.rule.closed) return { status: "slot_unavailable" };
    const slot = applySlotOverrides(ctx.rule, ctx.slotOverrides).find(
      (candidate) => candidate.startTime === data.slotTime && candidate.isEnabled,
    );
    if (!slot) return { status: "slot_unavailable" };
    if (data.bookingDate === today && data.slotTime <= getNowTaipeiHHmm()) {
      return { status: "slot_unavailable" };
    }

    if (await isDutySchedulingEnabled(store.id)) {
      const duty = await prisma.dutyAssignment.findFirst({
        where: { storeId: store.id, date: ctx.dateObj, slotTime: data.slotTime },
        select: { id: true },
      });
      if (!duty) return { status: "slot_unavailable" };
    }

    const trialPlan = await ensureTrialPlan(store.id, settings.trialDefaultPrice);

    let customer = await prisma.customer.findFirst({
      where: { storeId: store.id, phone: data.phone, mergedIntoCustomerId: null },
      select: { id: true, assignedStaffId: true },
    });
    if (!customer) {
      try {
        customer = await prisma.customer.create({
          data: {
            storeId: store.id,
            name: data.name,
            phone: data.phone,
            authSource: "MANUAL",
            customerStage: "LEAD",
            selfBookingEnabled: false,
          },
          select: { id: true, assignedStaffId: true },
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        customer = await prisma.customer.findFirst({
          where: { storeId: store.id, phone: data.phone, mergedIntoCustomerId: null },
          select: { id: true, assignedStaffId: true },
        });
        if (!customer) throw error;
      }
    }

    const existing = await prisma.booking.findFirst({
      where: {
        storeId: store.id,
        customerId: customer.id,
        bookingType: "FIRST_TRIAL",
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      },
      select: { bookingDate: true, slotTime: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        status: "already_has_trial",
        bookingDate: existing.bookingDate.toISOString().slice(0, 10),
        slotTime: existing.slotTime,
      };
    }

    const booking = await prisma.$transaction(
      async (tx) => {
        const aggregate = await tx.booking.aggregate({
          where: {
            storeId: store.id,
            bookingDate: ctx.dateObj,
            slotTime: data.slotTime,
            bookingStatus: { in: [...PENDING_STATUSES] },
          },
          _sum: { people: true },
        });
        if ((aggregate._sum.people ?? 0) >= slot.capacity) return null;

        return tx.booking.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            bookingDate: ctx.dateObj,
            slotTime: data.slotTime,
            bookedByType: "CUSTOMER",
            bookingType: "FIRST_TRIAL",
            bookingStatus: "PENDING",
            servicePlanId: trialPlan.id,
            people: 1,
            expectedAmount: settings.trialDefaultPrice,
            revenueStaffId: customer.assignedStaffId,
            notes: "公開快速體驗預約",
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!booking) return { status: "slot_full" };
    return {
      status: "ok",
      bookingId: booking.id,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { status: "slot_full" };
    }
    console.error("[public-trial-booking] submit failed", error);
    return { status: "service_unavailable" };
  }
}
