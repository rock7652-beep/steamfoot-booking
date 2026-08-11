"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/normalize";
import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";
import { PENDING_STATUSES } from "@/lib/booking-constants";
import {
  applySlotOverrides,
  enumerateMonthDates,
  loadDayBusinessHoursContext,
  loadMonthBusinessHoursContext,
} from "@/lib/business-hours-resolver";
import {
  checkBookingLimit,
  checkCustomerLimit,
  getTrialSettings,
  isDutySchedulingEnabled,
} from "@/lib/shop-config";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";
import { isStoreBookable } from "@/lib/store-operating-status";
import { notifyManagerOfPublicTrialBooking } from "@/server/services/public-trial-manager-notification";
import { ensureTrialPlan } from "@/server/services/trial-plan";
import { resolveTrialBookingChatLink } from "@/server/services/trial-booking-chat-link";
import type { SlotAvailability } from "@/types";

const STORE_SLUG = "zhubei";

const InputSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(50),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^09\d{8}$/, "請輸入正確手機號碼")),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  people: z.coerce.number().int().min(1, "預約人數至少 1 人").max(2, "單次最多預約 2 人"),
  website: z.string().max(0).optional().default(""),
  entry: z.string().max(512).optional(),
});

export type PublicTrialDayStatus =
  | "open"
  | "closed"
  | "training"
  | "full"
  | "no_duty"
  | "past"
  | "store_unavailable";

export type PublicTrialCalendarDay = {
  date: string;
  status: PublicTrialDayStatus;
  availableSlots: number;
};

export type PublicTrialBookingResult =
  | { status: "ok"; bookingId: string; bookingDate: string; slotTime: string; people: number; expectedAmount: number }
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

export async function fetchPublicTrialMonth(year: number, month: number): Promise<{
  days: PublicTrialCalendarDay[];
}> {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return { days: [] };

  const store = await resolvePublicStore();
  const dates = enumerateMonthDates(year, month);
  if (!store || !(await isStoreBookable(store.id)) || (await isStoreSubscriptionWriteBlocked(store.id))) {
    return { days: dates.map(({ dateStr }) => ({ date: dateStr, status: "store_unavailable", availableSlots: 0 })) };
  }

  const context = await loadMonthBusinessHoursContext(store.id, year, month);
  const dutyEnabled = await isDutySchedulingEnabled(store.id);
  const [bookings, dutyRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["bookingDate", "slotTime"],
      where: {
        storeId: store.id,
        bookingDate: { gte: context.start, lte: context.end },
        bookingStatus: { in: [...PENDING_STATUSES] },
      },
      _sum: { people: true },
    }),
    dutyEnabled
      ? prisma.dutyAssignment.findMany({
          where: { storeId: store.id, date: { gte: context.start, lte: context.end } },
          select: { date: true, slotTime: true },
          distinct: ["date", "slotTime"],
        })
      : Promise.resolve([]),
  ]);

  const bookingMap = new Map(
    bookings.map((row) => [`${row.bookingDate.toISOString().slice(0, 10)}|${row.slotTime}`, row._sum.people ?? 0]),
  );
  const dutySet = new Set(dutyRows.map((row) => `${row.date.toISOString().slice(0, 10)}|${row.slotTime}`));
  const overridesByDate = new Map<string, typeof context.slotOverrides>();
  for (const override of context.slotOverrides) {
    const date = override.date.toISOString().slice(0, 10);
    const list = overridesByDate.get(date) ?? [];
    list.push(override);
    overridesByDate.set(date, list);
  }

  const today = toLocalDateStr();
  const now = getNowTaipeiHHmm();
  const days: PublicTrialCalendarDay[] = [];

  for (const { dateStr } of dates) {
    if (dateStr < today) {
      days.push({ date: dateStr, status: "past", availableSlots: 0 });
      continue;
    }

    const rule = context.rules.get(dateStr);
    if (!rule || rule.closed) {
      days.push({
        date: dateStr,
        status: rule?.status === "training" ? "training" : "closed",
        availableSlots: 0,
      });
      continue;
    }

    const resolved = applySlotOverrides(rule, overridesByDate.get(dateStr) ?? []).filter((slot) => slot.isEnabled);
    const bookableSlots = resolved.filter((slot) => !dutyEnabled || dutySet.has(`${dateStr}|${slot.startTime}`));
    if (bookableSlots.length === 0) {
      days.push({ date: dateStr, status: dutyEnabled ? "no_duty" : "closed", availableSlots: 0 });
      continue;
    }

    const availableSlots = bookableSlots.filter((slot) => {
      if (dateStr === today && slot.startTime <= now) return false;
      const booked = bookingMap.get(`${dateStr}|${slot.startTime}`) ?? 0;
      return booked < slot.capacity;
    }).length;

    days.push({
      date: dateStr,
      status: availableSlots > 0 ? "open" : "full",
      availableSlots,
    });
  }

  return { days };
}

export async function fetchPublicTrialSlots(date: string): Promise<{
  slots: SlotAvailability[];
  dayStatus: PublicTrialDayStatus;
}> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { slots: [], dayStatus: "past" };
  const store = await resolvePublicStore();
  if (!store || !(await isStoreBookable(store.id))) return { slots: [], dayStatus: "store_unavailable" };
  if (await isStoreSubscriptionWriteBlocked(store.id)) return { slots: [], dayStatus: "store_unavailable" };

  const today = toLocalDateStr();
  if (date < today) return { slots: [], dayStatus: "past" };

  const ctx = await loadDayBusinessHoursContext(store.id, date);
  if (ctx.rule.closed) {
    return { slots: [], dayStatus: ctx.rule.status === "training" ? "training" : "closed" };
  }

  const resolved = applySlotOverrides(ctx.rule, ctx.slotOverrides).filter((slot) => slot.isEnabled);
  if (resolved.length === 0) return { slots: [], dayStatus: "closed" };

  const dutyEnabled = await isDutySchedulingEnabled(store.id);
  const [bookings, dutyRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["slotTime"],
      where: { storeId: store.id, bookingDate: ctx.dateObj, bookingStatus: { in: [...PENDING_STATUSES] } },
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

  const slots = resolved
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
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (slots.length === 0) return { slots: [], dayStatus: dutyEnabled ? "no_duty" : "closed" };
  if (slots.every((slot) => slot.available <= 0 || slot.isPast)) return { slots, dayStatus: "full" };
  return { slots, dayStatus: "open" };
}

export async function submitPublicTrialBooking(input: unknown): Promise<PublicTrialBookingResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid_input", message: parsed.error.issues[0]?.message ?? "資料格式不正確" };
  }

  const data = parsed.data;
  try {
    const chatLink = data.entry ? await resolveTrialBookingChatLink(data.entry) : null;
    // A supplied invalid/expired link is rejected rather than silently falling
    // back to the public form; otherwise a forwarded link could bind wrongly.
    if (data.entry && !chatLink) return { status: "invalid_input", message: "此預約連結已失效，請回到原本的聊天視窗重新取得連結。" };
    const store = chatLink
      ? await prisma.store.findUnique({ where: { id: chatLink.storeId }, select: { id: true, slug: true } })
      : await resolvePublicStore();
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
    if (data.bookingDate === today && data.slotTime <= getNowTaipeiHHmm()) return { status: "slot_unavailable" };

    if (await isDutySchedulingEnabled(store.id)) {
      const duty = await prisma.dutyAssignment.findFirst({
        where: { storeId: store.id, date: ctx.dateObj, slotTime: data.slotTime },
        select: { id: true },
      });
      if (!duty) return { status: "slot_unavailable" };
    }

    const trialPlan = await ensureTrialPlan(store.id, settings.trialDefaultPrice);

    let customer = await prisma.customer.findFirst({
      where: chatLink?.channel === "LINE"
        ? { storeId: store.id, lineUserId: chatLink.chatIdentity, mergedIntoCustomerId: null }
        : { storeId: store.id, phone: data.phone, mergedIntoCustomerId: null },
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
            ...(chatLink?.channel === "LINE" ? { lineUserId: chatLink.chatIdentity, lineLinkStatus: "LINKED" as const, lineLinkedAt: new Date() } : {}),
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

    const expectedAmount = settings.trialDefaultPrice * data.people;
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
        if ((aggregate._sum.people ?? 0) + data.people > slot.capacity) return null;

        const created = await tx.booking.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            bookingDate: ctx.dateObj,
            slotTime: data.slotTime,
            bookedByType: "CUSTOMER",
            bookingType: "FIRST_TRIAL",
            bookingStatus: "PENDING",
            servicePlanId: trialPlan.id,
            people: data.people,
            expectedAmount,
            revenueStaffId: customer.assignedStaffId,
            notes: "公開快速體驗預約",
            ...(chatLink ? { trialBookingChannel: chatLink.channel } : {}),
          },
          select: { id: true },
        });
        if (chatLink) {
          const claimed = await tx.trialBookingLink.updateMany({
            where: { id: chatLink.linkId, storeId: store.id, consumedAt: null, expiresAt: { gt: new Date() } },
            data: { consumedAt: new Date(), bookingId: created.id },
          });
          // Throw so the freshly-created booking is rolled back if another
          // request has consumed this opaque link first.
          if (claimed.count !== 1) throw new Error("TRIAL_BOOKING_LINK_CONSUMED");
        }
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (!booking) return { status: "slot_full" };
    await notifyManagerOfPublicTrialBooking({
      storeId: store.id,
      storeSlug: store.slug,
      bookingId: booking.id,
      customerName: data.name,
      phone: data.phone,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
      people: data.people,
      expectedAmount,
    });
    return {
      status: "ok",
      bookingId: booking.id,
      bookingDate: data.bookingDate,
      slotTime: data.slotTime,
      people: data.people,
      expectedAmount,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return { status: "slot_full" };
    console.error("[public-trial-booking] submit failed", error);
    return { status: "service_unavailable" };
  }
}
