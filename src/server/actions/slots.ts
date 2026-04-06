"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getNowTaipeiHHmm, toLocalDateStr } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";

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

  // 取得所有啟用時段的 dayOfWeek → [{startTime, capacity}]
  const allSlots = await prisma.bookingSlot.findMany({
    where: { isEnabled: true },
    select: { dayOfWeek: true, startTime: true, capacity: true },
    orderBy: { startTime: "asc" },
  });

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
    const daySlots = dowSlots.get(dow) ?? [];
    const isToday = dateStr === todayStr;

    let totalCap = 0;
    let totalBooked = 0;
    const slotInfos: MonthSlotInfo[] = [];

    for (const s of daySlots) {
      const booked = bookedMap.get(`${dateStr}|${s.startTime}`) ?? 0;
      // 同日已過時段：capacity 視為 0（已滿），讓前端月曆正確顯示
      const isPast = isToday && s.startTime <= nowHHmm;
      const effectiveCap = isPast ? booked : s.capacity; // 讓 available = 0
      totalCap += s.capacity;
      totalBooked += isPast ? s.capacity : booked;
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

  // ⚡ 兩個查詢並行
  const [slots, existingBookings] = await Promise.all([
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
  ]);

  if (slots.length === 0) return { slots: [] };

  const bookedMap = new Map(
    existingBookings.map((b) => [b.slotTime, b._sum.people ?? 0])
  );

  // P0-1: 判斷同日已過時段
  const todayStr = toLocalDateStr();
  const isToday = date === todayStr;
  const nowHHmm = isToday ? getNowTaipeiHHmm() : null;

  return {
    slots: slots.map((slot) => {
      const booked = bookedMap.get(slot.startTime) ?? 0;
      const isPast = isToday && nowHHmm !== null && slot.startTime <= nowHHmm;
      return {
        startTime: slot.startTime,
        capacity: slot.capacity,
        bookedCount: booked,
        available: isPast ? 0 : Math.max(0, slot.capacity - booked),
        isEnabled: slot.isEnabled,
        isPast,
      };
    }),
  };
}
