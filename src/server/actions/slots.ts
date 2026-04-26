"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";
import { getStoreFilter } from "@/lib/manager-visibility";
import { currentStoreId, getActiveStoreForRead } from "@/lib/store";
import { AppError } from "@/lib/errors";
import {
  applySlotOverrides,
  enumerateMonthDates,
  loadDayBusinessHoursContext,
  loadMonthBusinessHoursContext,
} from "@/lib/business-hours-resolver";
import type { SlotAvailability } from "@/types";

/**
 * 解析當前讀取視角的 storeId：
 * - ADMIN: 讀 active-store-id cookie（無特定店時拋錯，提示先切店）
 * - 其他角色: 用 user.storeId（缺失則 throw UNAUTHORIZED）
 */
async function resolveReadStoreIdOrThrow(user: { role: string; storeId?: string | null }): Promise<string> {
  if (user.role === "ADMIN") {
    const sid = await getActiveStoreForRead(user);
    if (!sid) {
      throw new AppError("UNAUTHORIZED", "請先從右上角切換到特定店舖");
    }
    return sid;
  }
  return currentStoreId(user);
}

/** 單一時段摘要 */
export interface MonthSlotInfo {
  startTime: string;
  capacity: number;
  booked: number;
}

// ============================================================
// fetchMonthAvailability — 月曆用：整月每天的可預約概覽
// ============================================================
//
// 規則來源：business-hours-resolver（與後台月曆預覽 100% 同源）。
// 額外加上：booking 已預約人數、duty 過濾（前台限定）。

export async function fetchMonthAvailability(
  year: number,
  month: number, // 1-based
): Promise<{
  days: Record<string, { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] }>;
}> {
  const user = await requireSession();
  const storeId = await resolveReadStoreIdOrThrow(user);

  const ctx = await loadMonthBusinessHoursContext(storeId, year, month);

  // duty 排程功能：必須帶該店 storeId（避免讀到 DEFAULT_STORE_ID 設定 + 跨店污染）
  const { isDutySchedulingEnabled } = await import("@/lib/shop-config");
  const dutyFeatureActive = await isDutySchedulingEnabled(storeId);

  // 該月 booking + duty（duty 必須帶 storeId，避免 demo 店污染竹北）
  const [bookings, dutyAssignmentRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["bookingDate", "slotTime"],
      where: {
        bookingDate: { gte: ctx.start, lte: ctx.end },
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        ...getStoreFilter(user),
      },
      _sum: { people: true },
    }),
    dutyFeatureActive
      ? prisma.dutyAssignment.findMany({
          where: { storeId, date: { gte: ctx.start, lte: ctx.end } },
          select: { date: true, slotTime: true },
          distinct: ["date", "slotTime"],
        })
      : Promise.resolve([]),
  ]);

  const bookedMap = new Map<string, number>();
  for (const b of bookings) {
    bookedMap.set(`${b.bookingDate.toISOString().slice(0, 10)}|${b.slotTime}`, b._sum.people ?? 0);
  }

  const dutySlotKeys = new Set(
    dutyAssignmentRows.map((d) => `${d.date.toISOString().slice(0, 10)}|${d.slotTime}`),
  );

  // 該月 slotOverride 依日期分組
  const overridesByDate = new Map<string, typeof ctx.slotOverrides>();
  for (const ov of ctx.slotOverrides) {
    const key = ov.date.toISOString().slice(0, 10);
    const arr = overridesByDate.get(key) ?? [];
    arr.push(ov);
    overridesByDate.set(key, arr);
  }

  const todayStr = toLocalDateStr();
  const nowHHmm = getNowTaipeiHHmm();

  const days: Record<string, { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] }> = {};

  for (const { dateStr } of enumerateMonthDates(year, month)) {
    const rule = ctx.rules.get(dateStr)!;
    if (rule.closed) {
      days[dateStr] = { totalCapacity: 0, totalBooked: 0, slots: [] };
      continue;
    }

    const resolvedSlots = applySlotOverrides(rule, overridesByDate.get(dateStr) ?? []);
    const isToday = dateStr === todayStr;

    let totalCap = 0;
    let totalBooked = 0;
    const slotInfos: MonthSlotInfo[] = [];

    for (const s of resolvedSlots) {
      if (!s.isEnabled) continue; // disabled override 不計入
      const booked = bookedMap.get(`${dateStr}|${s.startTime}`) ?? 0;
      const isPast = isToday && s.startTime <= nowHHmm;
      const effectiveCap = isPast ? booked : s.capacity;

      totalCap += s.capacity;
      totalBooked += isPast ? s.capacity : booked;
      slotInfos.push({ startTime: s.startTime, capacity: effectiveCap, booked });
    }

    // duty 過濾：只保留有值班的時段（已用正確 storeId）
    if (dutyFeatureActive) {
      const filtered = slotInfos.filter((s) => dutySlotKeys.has(`${dateStr}|${s.startTime}`));
      const filteredCap = filtered.reduce((sum, s) => sum + s.capacity, 0);
      const filteredBooked = filtered.reduce((sum, s) => sum + s.booked, 0);
      days[dateStr] = { totalCapacity: filteredCap, totalBooked: filteredBooked, slots: filtered };
    } else {
      days[dateStr] = { totalCapacity: totalCap, totalBooked, slots: slotInfos };
    }
  }

  return { days };
}

// ============================================================
// fetchDaySlots — 單日時段查詢（前台預約用，含 duty 過濾）
// ============================================================

export async function fetchDaySlots(date: string): Promise<{ slots: SlotAvailability[] }> {
  const user = await requireSession();
  const storeId = await resolveReadStoreIdOrThrow(user);

  const ctx = await loadDayBusinessHoursContext(storeId, date);

  if (ctx.rule.closed) return { slots: [] };

  const resolvedSlots = applySlotOverrides(ctx.rule, ctx.slotOverrides);
  if (resolvedSlots.length === 0) return { slots: [] };

  const { isDutySchedulingEnabled } = await import("@/lib/shop-config");
  const dutyFeatureInUse = await isDutySchedulingEnabled(storeId);

  const [existingBookings, dutySlots] = await Promise.all([
    prisma.booking.groupBy({
      by: ["slotTime"],
      where: {
        bookingDate: ctx.dateObj,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        storeId,
      },
      _sum: { people: true },
    }),
    dutyFeatureInUse
      ? prisma.dutyAssignment.findMany({
          where: { storeId, date: ctx.dateObj },
          select: { slotTime: true },
          distinct: ["slotTime"],
        })
      : Promise.resolve([]),
  ]);

  const bookedMap = new Map(existingBookings.map((b) => [b.slotTime, b._sum.people ?? 0]));
  const dutySlotSet = new Set(dutySlots.map((d) => d.slotTime));

  const todayStr = toLocalDateStr();
  const isToday = date === todayStr;
  const nowHHmm = isToday ? getNowTaipeiHHmm() : null;

  const result: SlotAvailability[] = [];
  for (const s of resolvedSlots) {
    if (!s.isEnabled) continue;
    const booked = bookedMap.get(s.startTime) ?? 0;
    const isPast = isToday && nowHHmm !== null && s.startTime <= nowHHmm;
    result.push({
      startTime: s.startTime,
      capacity: s.capacity,
      bookedCount: booked,
      available: isPast ? 0 : Math.max(0, s.capacity - booked),
      isEnabled: true,
      isPast,
    });
  }

  result.sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (dutyFeatureInUse) {
    return { slots: result.filter((s) => dutySlotSet.has(s.startTime)) };
  }
  return { slots: result };
}

// ============================================================
// fetchDayDetail — 單日完整資料（bookings + slots），供前端 inline 展開
// ============================================================

export async function fetchDayDetail(date: string) {
  const { requireStaffSession } = await import("@/lib/session");
  const user = await requireStaffSession();

  const dateObj = new Date(date + "T00:00:00Z");
  // ADMIN 要依 active-store-id cookie 篩選，避免跨店 bookings 污染當日詳情
  const activeStoreId = user.role === "ADMIN" ? await getActiveStoreForRead(user) : null;

  const [slotResult, bookings] = await Promise.all([
    fetchDaySlots(date),
    prisma.booking.findMany({
      where: {
        ...getStoreFilter(user, activeStoreId),
        bookingDate: dateObj,
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            assignedStaff: { select: { id: true, displayName: true, colorCode: true } },
          },
        },
        revenueStaff: { select: { id: true, displayName: true, colorCode: true } },
        serviceStaff: { select: { id: true, displayName: true } },
        servicePlan: { select: { name: true } },
      },
      orderBy: { slotTime: "asc" },
    }),
  ]);

  return {
    slots: slotResult.slots,
    bookings: bookings.map((b) => ({
      id: b.id,
      slotTime: b.slotTime,
      people: b.people,
      isMakeup: b.isMakeup,
      isCheckedIn: b.isCheckedIn,
      bookingStatus: b.bookingStatus,
      customer: b.customer,
      revenueStaff: b.revenueStaff,
      serviceStaff: b.serviceStaff,
      servicePlan: b.servicePlan,
    })),
  };
}
