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

  // 並行查詢（含 slot override）
  const [slots, specialDay, businessHour, slotOverrides] = await Promise.all([
    prisma.bookingSlot.findMany({
      where: { dayOfWeek: dow },
      select: { startTime: true, capacity: true, isEnabled: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.specialBusinessDay.findUnique({ where: { date: dateObj } }),
    prisma.businessHours.findUnique({ where: { dayOfWeek: dow } }),
    prisma.slotOverride.findMany({
      where: { date: dateObj },
      orderBy: { startTime: "asc" },
    }),
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

  // 建立 slot override map
  const overrideMap = new Map(slotOverrides.map((o) => [o.startTime, o]));

  // 篩選出該日可用的時段（套用 override）
  const filteredSlots = slots.map((s) => {
    const inRange = !openTime || !closeTime || (s.startTime >= openTime && s.startTime < closeTime);
    const override = overrideMap.get(s.startTime);

    let effectiveEnabled = s.isEnabled && inRange;
    let effectiveCapacity = s.capacity;
    let overrideType: string | null = null;
    let overrideReason: string | null = null;

    if (override) {
      overrideType = override.type;
      overrideReason = override.reason;
      if (override.type === "disabled") {
        effectiveEnabled = false;
      } else if (override.type === "enabled") {
        // 強制開放（即使超出營業範圍）
        effectiveEnabled = true;
      } else if (override.type === "capacity_change") {
        effectiveCapacity = override.capacity ?? s.capacity;
      }
    }

    return {
      startTime: s.startTime,
      capacity: effectiveCapacity,
      templateCapacity: s.capacity,
      isEnabled: effectiveEnabled,
      inRange,
      override: overrideType,
      overrideReason,
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

// ============================================================
// SlotOverride — 單日時段覆寫
// ============================================================

/** 取得某天的所有 slot override */
export async function getDaySlotOverrides(dateStr: string) {
  const dateObj = new Date(dateStr + "T00:00:00Z");
  return prisma.slotOverride.findMany({
    where: { date: dateObj },
    orderBy: { startTime: "asc" },
  });
}

/** 切換單一時段的開/關（toggle） */
export async function toggleSlotOverride(input: {
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  action: "disable" | "enable" | "remove"; // disable=關閉, enable=強制開放, remove=回復預設
  reason?: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");

    const dateObj = new Date(input.date + "T00:00:00Z");

    if (input.action === "remove") {
      await prisma.slotOverride.deleteMany({
        where: { date: dateObj, startTime: input.startTime },
      });
    } else {
      await prisma.slotOverride.upsert({
        where: { date_startTime: { date: dateObj, startTime: input.startTime } },
        update: {
          type: input.action === "disable" ? "disabled" : "enabled",
          reason: input.reason ?? null,
        },
        create: {
          date: dateObj,
          startTime: input.startTime,
          type: input.action === "disable" ? "disabled" : "enabled",
          reason: input.reason ?? null,
        },
      });
    }

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 更新單一時段容量覆寫 */
export async function overrideSlotCapacity(input: {
  date: string;
  startTime: string;
  capacity: number;
  reason?: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");

    if (input.capacity < 0 || input.capacity > 99) {
      throw new AppError("VALIDATION", "容量需在 0-99 之間");
    }

    const dateObj = new Date(input.date + "T00:00:00Z");
    await prisma.slotOverride.upsert({
      where: { date_startTime: { date: dateObj, startTime: input.startTime } },
      update: {
        type: "capacity_change",
        capacity: input.capacity,
        reason: input.reason ?? null,
      },
      create: {
        date: dateObj,
        startTime: input.startTime,
        type: "capacity_change",
        capacity: input.capacity,
        reason: input.reason ?? null,
      },
    });

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
