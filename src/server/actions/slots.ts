"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";

/**
 * 判斷某日期的營業狀態
 * closed = 全天不可預約
 * openTime / closeTime = 該日允許的時段範圍（用來過濾 BookingSlot）
 */
interface DayBusinessStatus {
  closed: boolean;
  reason: string | null;
  /** 該日有效營業開始時間（null = 使用預設 slot 定義） */
  openTime: string | null;
  /** 該日有效營業結束時間（null = 使用預設 slot 定義） */
  closeTime: string | null;
}

function getDayBusinessStatus(
  dateStr: string,
  dow: number,
  specialDayMap: Map<string, { type: string; reason: string | null; openTime: string | null; closeTime: string | null }>,
  businessHoursMap: Map<number, { isOpen: boolean; openTime: string | null; closeTime: string | null }>
): DayBusinessStatus {
  // 1. 特殊日期優先
  const special = specialDayMap.get(dateStr);
  if (special) {
    if (special.type === "closed" || special.type === "training") {
      return { closed: true, reason: special.reason ?? (special.type === "training" ? "進修日" : "公休"), openTime: null, closeTime: null };
    }
    // custom: 營業但時段受限
    return { closed: false, reason: null, openTime: special.openTime, closeTime: special.closeTime };
  }

  // 2. 固定營業時間
  const bh = businessHoursMap.get(dow);
  if (bh && !bh.isOpen) {
    return { closed: true, reason: "固定公休", openTime: null, closeTime: null };
  }
  // 營業中，回傳固定時段（若有）用於 slot 過濾
  return { closed: false, reason: null, openTime: bh?.openTime ?? null, closeTime: bh?.closeTime ?? null };
}

/** 判斷 slot 時段是否在營業範圍內 */
function isSlotInRange(slotTime: string, openTime: string | null, closeTime: string | null): boolean {
  if (!openTime || !closeTime) return true; // 無限制
  return slotTime >= openTime && slotTime < closeTime;
}

/** 單一時段摘要 */
export interface MonthSlotInfo {
  startTime: string;
  capacity: number;
  booked: number;
}

/** 月曆用：取得整月每天的可預約概覽（含時段級明細） */
export async function fetchMonthAvailability(
  year: number,
  month: number // 1-based
): Promise<{
  days: Record<string, { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] }>;
}> {
  await requireSession();

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0)); // last day of month

  // 並行取得時段 + 營業時間 + 特殊日期 + 時段覆寫
  const [allSlots, businessHoursRows, specialDaysRows, slotOverrideRows] = await Promise.all([
    prisma.bookingSlot.findMany({
      where: { isEnabled: true },
      select: { dayOfWeek: true, startTime: true, capacity: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.businessHours.findMany(),
    prisma.specialBusinessDay.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    }),
    prisma.slotOverride.findMany({
      where: { date: { gte: startDate, lte: endDate } },
    }),
  ]);

  // 建立 slot override map: "YYYY-MM-DD|HH:mm" → override
  const slotOverrideMap = new Map(
    slotOverrideRows.map((o) => [
      `${o.date.toISOString().slice(0, 10)}|${o.startTime}`,
      o,
    ])
  );

  // 建立快速查詢 map
  const businessHoursMap = new Map(businessHoursRows.map((b) => [b.dayOfWeek, { isOpen: b.isOpen, openTime: b.openTime, closeTime: b.closeTime }]));
  const specialDayMap = new Map(
    specialDaysRows.map((s) => [
      s.date.toISOString().slice(0, 10),
      { type: s.type, reason: s.reason, openTime: s.openTime, closeTime: s.closeTime },
    ])
  );

  // dayOfWeek → slot list
  const dowSlots = new Map<number, { startTime: string; capacity: number }[]>();
  for (const slot of allSlots) {
    const list = dowSlots.get(slot.dayOfWeek) ?? [];
    list.push({ startTime: slot.startTime, capacity: slot.capacity });
    dowSlots.set(slot.dayOfWeek, list);
  }

  // 查該月所有 active 預約的 people 加總 by (date, slotTime)
  const bookings = await prisma.booking.groupBy({
    by: ["bookingDate", "slotTime"],
    where: {
      bookingDate: { gte: startDate, lte: endDate },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
    _sum: { people: true },
  });

  // "YYYY-MM-DD|HH:mm" → booked people
  const bookedMap = new Map<string, number>();
  for (const b of bookings) {
    const key = `${b.bookingDate.toISOString().slice(0, 10)}|${b.slotTime}`;
    bookedMap.set(key, b._sum.people ?? 0);
  }

  // P0-1: 同日已過時段標記
  const todayStr = toLocalDateStr();
  const nowHHmm = getNowTaipeiHHmm();

  // 建立每天的摘要
  const days: Record<string, { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] }> = {};
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const dow = cursor.getUTCDay();
    const isToday = dateStr === todayStr;

    // 檢查營業狀態（公休 / 特殊時段 / 正常）
    const status = getDayBusinessStatus(dateStr, dow, specialDayMap, businessHoursMap);
    if (status.closed) {
      // 關閉日：totalCapacity = 0 → 前台顯示「公休」
      days[dateStr] = { totalCapacity: 0, totalBooked: 0, slots: [] };
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      continue;
    }

    const daySlots = dowSlots.get(dow) ?? [];
    let totalCap = 0;
    let totalBooked = 0;
    const slotInfos: MonthSlotInfo[] = [];

    for (const s of daySlots) {
      const overrideKey = `${dateStr}|${s.startTime}`;
      const override = slotOverrideMap.get(overrideKey);

      // SlotOverride 優先：disabled → 跳過；enabled → 強制納入
      if (override?.type === "disabled") continue;

      const inRange = isSlotInRange(s.startTime, status.openTime, status.closeTime);
      // 如果不在營業範圍且沒有 "enabled" 覆寫，跳過
      if (!inRange && override?.type !== "enabled") continue;

      const slotCapacity = override?.type === "capacity_change" && override.capacity != null
        ? override.capacity
        : s.capacity;

      const booked = bookedMap.get(overrideKey) ?? 0;
      // 同日已過時段：capacity 視為 0（已滿），讓前端月曆正確顯示
      const isPast = isToday && s.startTime <= nowHHmm;
      const effectiveCap = isPast ? booked : slotCapacity; // 讓 available = 0
      totalCap += slotCapacity;
      totalBooked += isPast ? slotCapacity : booked;
      slotInfos.push({ startTime: s.startTime, capacity: effectiveCap, booked });
    }

    days[dateStr] = { totalCapacity: totalCap, totalBooked, slots: slotInfos };
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { days };
}

// ⚡ 輕量 server action：只查單日時段，不重複驗 session 以外的東西
export async function fetchDaySlots(date: string): Promise<{
  slots: SlotAvailability[];
}> {
  await requireSession();

  const dateObj = new Date(date + "T00:00:00Z");
  const dayOfWeek = dateObj.getDay();

  // 先查營業狀態
  const [specialDay, businessHour] = await Promise.all([
    prisma.specialBusinessDay.findUnique({ where: { date: dateObj } }),
    prisma.businessHours.findUnique({ where: { dayOfWeek } }),
  ]);

  // 特殊日期公休 / 進修
  if (specialDay && (specialDay.type === "closed" || specialDay.type === "training")) {
    return { slots: [] };
  }
  // 固定公休
  if (!specialDay && businessHour && !businessHour.isOpen) {
    return { slots: [] };
  }

  // 計算該日允許的時段範圍（特殊時段 → custom openTime/closeTime，正常 → businessHour）
  const dayOpenTime = specialDay?.type === "custom" ? specialDay.openTime : (businessHour?.openTime ?? null);
  const dayCloseTime = specialDay?.type === "custom" ? specialDay.closeTime : (businessHour?.closeTime ?? null);

  // ⚡ 三個查詢並行
  const [slots, existingBookings, slotOverrides] = await Promise.all([
    prisma.bookingSlot.findMany({
      where: { dayOfWeek, isEnabled: true },
      select: { startTime: true, capacity: true, isEnabled: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.booking.groupBy({
      by: ["slotTime"],
      where: {
        bookingDate: dateObj,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      _sum: { people: true },
    }),
    prisma.slotOverride.findMany({
      where: { date: dateObj },
    }),
  ]);

  if (slots.length === 0) return { slots: [] };

  const bookedMap = new Map(
    existingBookings.map((b) => [b.slotTime, b._sum.people ?? 0])
  );
  const overrideMap = new Map(
    slotOverrides.map((o) => [o.startTime, o])
  );

  // P0-1: 判斷同日已過時段
  const todayStr = toLocalDateStr();
  const isToday = date === todayStr;
  const nowHHmm = isToday ? getNowTaipeiHHmm() : null;

  return {
    slots: slots
      .filter((slot) => {
        const override = overrideMap.get(slot.startTime);
        // SlotOverride: disabled → 移除
        if (override?.type === "disabled") return false;
        // SlotOverride: enabled → 強制納入（即使超出營業範圍）
        if (override?.type === "enabled") return true;
        // 一般邏輯：檢查營業範圍
        return isSlotInRange(slot.startTime, dayOpenTime, dayCloseTime);
      })
      .map((slot) => {
        const booked = bookedMap.get(slot.startTime) ?? 0;
        const isPast = isToday && nowHHmm !== null && slot.startTime <= nowHHmm;
        const override = overrideMap.get(slot.startTime);
        const slotCapacity = override?.type === "capacity_change" && override.capacity != null
          ? override.capacity
          : slot.capacity;
        return {
          startTime: slot.startTime,
          capacity: slotCapacity,
          bookedCount: booked,
          available: isPast ? 0 : Math.max(0, slotCapacity - booked),
          isEnabled: slot.isEnabled,
          isPast,
        };
      }),
  };
}
