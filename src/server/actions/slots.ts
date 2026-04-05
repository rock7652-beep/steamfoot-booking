"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import type { SlotAvailability } from "@/types";

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

  return {
    slots: slots.map((slot) => {
      const booked = bookedMap.get(slot.startTime) ?? 0;
      return {
        startTime: slot.startTime,
        capacity: slot.capacity,
        bookedCount: booked,
        available: Math.max(0, slot.capacity - booked),
        isEnabled: slot.isEnabled,
      };
    }),
  };
}
