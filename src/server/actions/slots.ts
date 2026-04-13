"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";
import { generateSlots } from "@/lib/slot-generator";
import { getStoreFilter } from "@/lib/manager-visibility";
import { currentStoreId } from "@/lib/store";
import type { SlotAvailability } from "@/types";

// ============================================================
// 共用：取得某天的有效營業規則（規則即時運算，不查 BookingSlot）
// ============================================================

interface DayRule {
  closed: boolean;
  reason: string | null;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number;
  defaultCapacity: number;
}

/**
 * 計算某天的營業規則
 * 優先順序：SpecialBusinessDay > BusinessHours > 無設定（視為不營業）
 */
function getDayRule(
  dateStr: string,
  dow: number,
  specialDayMap: Map<string, {
    type: string; reason: string | null;
    openTime: string | null; closeTime: string | null;
    slotInterval: number | null; defaultCapacity: number | null;
  }>,
  businessHoursMap: Map<number, {
    isOpen: boolean; openTime: string | null; closeTime: string | null;
    slotInterval: number; defaultCapacity: number;
  }>
): DayRule {
  const bh = businessHoursMap.get(dow);

  // 1. 特殊日期優先
  const special = specialDayMap.get(dateStr);
  if (special) {
    if (special.type === "closed" || special.type === "training") {
      return {
        closed: true,
        reason: special.reason ?? (special.type === "training" ? "進修日" : "公休"),
        openTime: null, closeTime: null,
        slotInterval: bh?.slotInterval ?? 60,
        defaultCapacity: bh?.defaultCapacity ?? 6,
      };
    }
    // custom: 營業但時段受限，interval/capacity 可覆寫
    return {
      closed: false, reason: null,
      openTime: special.openTime,
      closeTime: special.closeTime,
      slotInterval: special.slotInterval ?? bh?.slotInterval ?? 60,
      defaultCapacity: special.defaultCapacity ?? bh?.defaultCapacity ?? 6,
    };
  }

  // 2. 固定營業時間
  if (bh && !bh.isOpen) {
    return {
      closed: true, reason: "固定公休",
      openTime: null, closeTime: null,
      slotInterval: bh.slotInterval, defaultCapacity: bh.defaultCapacity,
    };
  }
  if (bh) {
    return {
      closed: false, reason: null,
      openTime: bh.openTime, closeTime: bh.closeTime,
      slotInterval: bh.slotInterval, defaultCapacity: bh.defaultCapacity,
    };
  }

  // 3. 無設定 → 不營業
  return {
    closed: true, reason: "尚未設定營業時間",
    openTime: null, closeTime: null,
    slotInterval: 60, defaultCapacity: 6,
  };
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

export async function fetchMonthAvailability(
  year: number,
  month: number // 1-based
): Promise<{
  days: Record<string, { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] }>;
}> {
  const user = await requireSession();

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));

  const storeId = currentStoreId(user);

  // 並行取得營業時間 + 特殊日期 + 時段覆寫 + 值班安排
  const [businessHoursRows, specialDaysRows, slotOverrideRows, dutyAssignmentRows] = await Promise.all([
    prisma.businessHours.findMany({ where: { storeId } }),
    prisma.specialBusinessDay.findMany({
      where: { storeId, date: { gte: startDate, lte: endDate } },
    }),
    prisma.slotOverride.findMany({
      where: { storeId, date: { gte: startDate, lte: endDate } },
    }),
    prisma.dutyAssignment.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { date: true, slotTime: true },
      distinct: ["date", "slotTime"],
    }),
  ]);

  // 值班時段 Set（date|slotTime）
  const dutySlotKeys = new Set(
    dutyAssignmentRows.map((d) => `${d.date.toISOString().slice(0, 10)}|${d.slotTime}`)
  );
  const { isDutySchedulingEnabled } = await import("@/lib/shop-config");
  const dutyFeatureActive = await isDutySchedulingEnabled();

  // 建立查詢 map
  const businessHoursMap = new Map(businessHoursRows.map((b) => [b.dayOfWeek, {
    isOpen: b.isOpen, openTime: b.openTime, closeTime: b.closeTime,
    slotInterval: b.slotInterval, defaultCapacity: b.defaultCapacity,
  }]));
  const specialDayMap = new Map(specialDaysRows.map((s) => [
    s.date.toISOString().slice(0, 10),
    {
      type: s.type, reason: s.reason,
      openTime: s.openTime, closeTime: s.closeTime,
      slotInterval: s.slotInterval, defaultCapacity: s.defaultCapacity,
    },
  ]));
  const slotOverrideMap = new Map(slotOverrideRows.map((o) => [
    `${o.date.toISOString().slice(0, 10)}|${o.startTime}`, o,
  ]));

  // 查該月所有 active 預約
  const bookings = await prisma.booking.groupBy({
    by: ["bookingDate", "slotTime"],
    where: {
      bookingDate: { gte: startDate, lte: endDate },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      ...getStoreFilter(user),
    },
    _sum: { people: true },
  });

  const bookedMap = new Map<string, number>();
  for (const b of bookings) {
    bookedMap.set(`${b.bookingDate.toISOString().slice(0, 10)}|${b.slotTime}`, b._sum.people ?? 0);
  }

  const todayStr = toLocalDateStr();
  const nowHHmm = getNowTaipeiHHmm();

  // 建立每天的摘要
  const days: Record<string, { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] }> = {};
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dow = cursor.getUTCDay();
    const isToday = dateStr === todayStr;

    const rule = getDayRule(dateStr, dow, specialDayMap, businessHoursMap);
    if (rule.closed || !rule.openTime || !rule.closeTime) {
      days[dateStr] = { totalCapacity: 0, totalBooked: 0, slots: [] };
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }

    // 用規則生成時段
    const generated = generateSlots(rule.openTime, rule.closeTime, rule.slotInterval, rule.defaultCapacity);

    let totalCap = 0;
    let totalBooked = 0;
    const slotInfos: MonthSlotInfo[] = [];

    for (const s of generated) {
      const overrideKey = `${dateStr}|${s.startTime}`;
      const override = slotOverrideMap.get(overrideKey);

      if (override?.type === "disabled") continue;

      const slotCapacity = override?.type === "capacity_change" && override.capacity != null
        ? override.capacity : s.capacity;

      const booked = bookedMap.get(overrideKey) ?? 0;
      const isPast = isToday && s.startTime <= nowHHmm;
      const effectiveCap = isPast ? booked : slotCapacity;

      totalCap += slotCapacity;
      totalBooked += isPast ? slotCapacity : booked;
      slotInfos.push({ startTime: s.startTime, capacity: effectiveCap, booked });
    }

    // 檢查是否有 "enabled" 覆寫要強制加入（不在生成範圍內的時段）
    for (const [key, override] of slotOverrideMap) {
      if (!key.startsWith(dateStr + "|") || override.type !== "enabled") continue;
      const startTime = key.split("|")[1];
      if (slotInfos.some((s) => s.startTime === startTime)) continue; // 已在列表中
      const booked = bookedMap.get(key) ?? 0;
      const cap = override.capacity ?? rule.defaultCapacity;
      const isPast = isToday && startTime <= nowHHmm;
      totalCap += cap;
      totalBooked += isPast ? cap : booked;
      slotInfos.push({ startTime, capacity: isPast ? booked : cap, booked });
    }

    // 排序
    slotInfos.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // 值班安排過濾：只保留有值班人員的時段
    if (dutyFeatureActive) {
      const filteredSlots = slotInfos.filter((s) => dutySlotKeys.has(`${dateStr}|${s.startTime}`));
      const filteredCap = filteredSlots.reduce((sum, s) => sum + s.capacity, 0);
      const filteredBooked = filteredSlots.reduce((sum, s) => sum + s.booked, 0);
      days[dateStr] = { totalCapacity: filteredCap, totalBooked: filteredBooked, slots: filteredSlots };
    } else {
      days[dateStr] = { totalCapacity: totalCap, totalBooked, slots: slotInfos };
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { days };
}

// ============================================================
// fetchDaySlots — 單日時段查詢（前台 + 後台共用）
// ============================================================

export async function fetchDaySlots(date: string): Promise<{
  slots: SlotAvailability[];
}> {
  const user = await requireSession();

  const dateObj = new Date(date + "T00:00:00Z");
  const dayOfWeek = dateObj.getUTCDay();
  const storeId = currentStoreId(user);

  // 查營業狀態
  const [specialDay, businessHour, slotOverrides, existingBookings, dutySlots] = await Promise.all([
    prisma.specialBusinessDay.findFirst({ where: { storeId, date: dateObj } }),
    prisma.businessHours.findFirst({ where: { storeId, dayOfWeek } }),
    prisma.slotOverride.findMany({ where: { storeId, date: dateObj } }),
    prisma.booking.groupBy({
      by: ["slotTime"],
      where: {
        bookingDate: dateObj,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        ...getStoreFilter(user),
      },
      _sum: { people: true },
    }),
    // 值班安排：查有哪些時段有人值班
    prisma.dutyAssignment.findMany({
      where: { date: dateObj },
      select: { slotTime: true },
      distinct: ["slotTime"],
    }),
  ]);
  const dutySlotSet = new Set(dutySlots.map((d) => d.slotTime));

  // 公休 / 進修
  if (specialDay && (specialDay.type === "closed" || specialDay.type === "training")) {
    return { slots: [] };
  }
  if (!specialDay && businessHour && !businessHour.isOpen) {
    return { slots: [] };
  }

  // 取得有效營業規則
  const openTime = specialDay?.type === "custom" ? specialDay.openTime : (businessHour?.openTime ?? null);
  const closeTime = specialDay?.type === "custom" ? specialDay.closeTime : (businessHour?.closeTime ?? null);
  const interval = (specialDay?.type === "custom" ? specialDay.slotInterval : null) ?? businessHour?.slotInterval ?? 60;
  const capacity = (specialDay?.type === "custom" ? specialDay.defaultCapacity : null) ?? businessHour?.defaultCapacity ?? 6;

  if (!openTime || !closeTime) return { slots: [] };

  // 用規則生成時段
  const generated = generateSlots(openTime, closeTime, interval, capacity);

  const bookedMap = new Map(existingBookings.map((b) => [b.slotTime, b._sum.people ?? 0]));
  const overrideMap = new Map(slotOverrides.map((o) => [o.startTime, o]));

  const todayStr = toLocalDateStr();
  const isToday = date === todayStr;
  const nowHHmm = isToday ? getNowTaipeiHHmm() : null;

  const result: SlotAvailability[] = [];

  for (const s of generated) {
    const override = overrideMap.get(s.startTime);
    if (override?.type === "disabled") continue;

    const slotCap = override?.type === "capacity_change" && override.capacity != null
      ? override.capacity : s.capacity;
    const booked = bookedMap.get(s.startTime) ?? 0;
    const isPast = isToday && nowHHmm !== null && s.startTime <= nowHHmm;

    result.push({
      startTime: s.startTime,
      capacity: slotCap,
      bookedCount: booked,
      available: isPast ? 0 : Math.max(0, slotCap - booked),
      isEnabled: true,
      isPast,
    });
  }

  // 檢查 "enabled" 覆寫（強制加入不在範圍內的時段）
  for (const [startTime, override] of overrideMap) {
    if (override.type !== "enabled") continue;
    if (result.some((r) => r.startTime === startTime)) continue;
    const cap = override.capacity ?? capacity;
    const booked = bookedMap.get(startTime) ?? 0;
    const isPast = isToday && nowHHmm !== null && startTime <= nowHHmm;
    result.push({
      startTime,
      capacity: cap,
      bookedCount: booked,
      available: isPast ? 0 : Math.max(0, cap - booked),
      isEnabled: true,
      isPast,
    });
  }

  result.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // 值班安排過濾：只保留有值班人員的時段
  // 判斷該日是否有任何值班安排
  // 若該日完全無值班 → 該日所有時段不可預約（前台）
  // 但若全系統都沒有任何 DutyAssignment（功能尚未使用），則不過濾
  const { isDutySchedulingEnabled } = await import("@/lib/shop-config");
  const dutyFeatureInUse = await isDutySchedulingEnabled();
  if (dutyFeatureInUse) {
    const filtered = result.filter((s) => dutySlotSet.has(s.startTime));
    return { slots: filtered };
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

  const [slotResult, bookings] = await Promise.all([
    fetchDaySlots(date),
    prisma.booking.findMany({
      where: {
        ...getStoreFilter(user),
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
