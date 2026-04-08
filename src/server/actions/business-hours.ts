"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

const DAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

// ============================================================
// 查詢
// ============================================================

/** 取得每週固定營業時間（7 筆，已排序） */
export async function getBusinessHours() {
  const rows = await prisma.businessHours.findMany({
    orderBy: { dayOfWeek: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    dayName: DAY_NAMES[r.dayOfWeek],
  }));
}

/** 取得特殊日期列表（未來 + 最近 30 天） */
export async function getSpecialDays() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return prisma.specialBusinessDay.findMany({
    where: { date: { gte: thirtyDaysAgo } },
    orderBy: { date: "asc" },
  });
}

/** 取得指定月份的特殊日期 map */
export async function getMonthSpecialDays(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // last day

  const rows = await prisma.specialBusinessDay.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    type: r.type,
    reason: r.reason,
    openTime: r.openTime,
    closeTime: r.closeTime,
  }));
}

/** 取得某天的可預約時段（根據 BookingSlot 模板 + 營業時間過濾） */
export async function getDaySlotDetails(dateStr: string) {
  const dateObj = new Date(dateStr + "T00:00:00Z");
  const dow = dateObj.getUTCDay();

  // 並行查詢
  const [slots, specialDay, businessHour] = await Promise.all([
    prisma.bookingSlot.findMany({
      where: { dayOfWeek: dow },
      select: { startTime: true, capacity: true, isEnabled: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.specialBusinessDay.findUnique({ where: { date: dateObj } }),
    prisma.businessHours.findUnique({ where: { dayOfWeek: dow } }),
  ]);

  // 決定該日狀態
  let status: "open" | "closed" | "training" | "custom" = "open";
  let openTime: string | null = null;
  let closeTime: string | null = null;
  let reason: string | null = null;
  let specialDayId: string | null = null;

  if (specialDay) {
    specialDayId = specialDay.id;
    if (specialDay.type === "closed") {
      status = "closed";
      reason = specialDay.reason;
    } else if (specialDay.type === "training") {
      status = "training";
      reason = specialDay.reason;
    } else {
      status = "custom";
      openTime = specialDay.openTime;
      closeTime = specialDay.closeTime;
      reason = specialDay.reason;
    }
  } else if (businessHour) {
    if (!businessHour.isOpen) {
      status = "closed";
      reason = "固定公休";
    } else {
      openTime = businessHour.openTime;
      closeTime = businessHour.closeTime;
    }
  }

  // 篩選出該日可用的時段
  const filteredSlots = slots.map((s) => {
    const inRange = !openTime || !closeTime || (s.startTime >= openTime && s.startTime < closeTime);
    return {
      startTime: s.startTime,
      capacity: s.capacity,
      isEnabled: s.isEnabled && inRange,
      inRange,
    };
  });

  return {
    status,
    openTime,
    closeTime,
    reason,
    specialDayId,
    dayOfWeek: dow,
    dayName: DAY_NAMES[dow],
    slots: filteredSlots,
    hasWeeklyDefault: !!businessHour,
    weeklyDefault: businessHour ? {
      isOpen: businessHour.isOpen,
      openTime: businessHour.openTime,
      closeTime: businessHour.closeTime,
    } : null,
  };
}

/** 判斷指定日期是否營業，回傳 { open, openTime, closeTime, reason } */
export async function getDayStatus(date: Date): Promise<{
  open: boolean;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}> {
  const dateOnly = new Date(date.toISOString().slice(0, 10));
  const special = await prisma.specialBusinessDay.findUnique({
    where: { date: dateOnly },
  });
  if (special) {
    if (special.type === "closed" || special.type === "training") {
      return { open: false, openTime: null, closeTime: null, reason: special.reason ?? (special.type === "training" ? "進修日" : "公休") };
    }
    return { open: true, openTime: special.openTime, closeTime: special.closeTime, reason: special.reason };
  }

  const dayOfWeek = date.getDay();
  const hours = await prisma.businessHours.findUnique({
    where: { dayOfWeek },
  });
  if (!hours || !hours.isOpen) {
    return { open: false, openTime: null, closeTime: null, reason: "固定公休" };
  }
  return { open: true, openTime: hours.openTime, closeTime: hours.closeTime, reason: null };
}

// ============================================================
// 更新固定營業時間
// ============================================================

export async function updateBusinessHours(
  dayOfWeek: number,
  input: { isOpen: boolean; openTime: string | null; closeTime: string | null }
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");

    await prisma.businessHours.upsert({
      where: { dayOfWeek },
      update: {
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
      },
      create: {
        dayOfWeek,
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
      },
    });

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// 特殊日期管理
// ============================================================

export async function addSpecialDay(input: {
  date: string; // YYYY-MM-DD
  type: "closed" | "training" | "custom";
  reason?: string;
  openTime?: string;
  closeTime?: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");

    const dateObj = new Date(input.date);

    await prisma.specialBusinessDay.upsert({
      where: { date: dateObj },
      update: {
        type: input.type,
        reason: input.reason ?? null,
        openTime: input.type === "custom" ? (input.openTime ?? null) : null,
        closeTime: input.type === "custom" ? (input.closeTime ?? null) : null,
      },
      create: {
        date: dateObj,
        type: input.type,
        reason: input.reason ?? null,
        openTime: input.type === "custom" ? (input.openTime ?? null) : null,
        closeTime: input.type === "custom" ? (input.closeTime ?? null) : null,
      },
    });

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function removeSpecialDay(id: string): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");

    await prisma.specialBusinessDay.delete({ where: { id } });

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 移除指定日期的特殊設定（回復為每週預設） */
export async function removeSpecialDayByDate(dateStr: string): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");

    const dateObj = new Date(dateStr);
    await prisma.specialBusinessDay.deleteMany({ where: { date: dateObj } });

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// 複製設定到未來 N 週
// ============================================================

export async function copySettingsToFutureWeeks(input: {
  sourceDate: string;  // YYYY-MM-DD
  type: "closed" | "training" | "custom";
  reason?: string;
  openTime?: string;
  closeTime?: string;
  weeks: number;       // 複製到未來幾週（1-12）
}): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requirePermission("business_hours.manage");

    if (input.weeks < 1 || input.weeks > 12) {
      throw new AppError("VALIDATION", "複製週數需在 1-12 之間");
    }

    const sourceDate = new Date(input.sourceDate + "T00:00:00Z");
    const dates: Date[] = [];

    for (let i = 1; i <= input.weeks; i++) {
      const d = new Date(sourceDate);
      d.setUTCDate(d.getUTCDate() + 7 * i);
      dates.push(d);
    }

    // 批次 upsert
    const upserts = dates.map((d) =>
      prisma.specialBusinessDay.upsert({
        where: { date: d },
        update: {
          type: input.type,
          reason: input.reason ?? null,
          openTime: input.type === "custom" ? (input.openTime ?? null) : null,
          closeTime: input.type === "custom" ? (input.closeTime ?? null) : null,
        },
        create: {
          date: d,
          type: input.type,
          reason: input.reason ?? null,
          openTime: input.type === "custom" ? (input.openTime ?? null) : null,
          closeTime: input.type === "custom" ? (input.closeTime ?? null) : null,
        },
      })
    );

    await prisma.$transaction(upserts);

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: { count: dates.length } };
  } catch (e) {
    return handleActionError(e);
  }
}
