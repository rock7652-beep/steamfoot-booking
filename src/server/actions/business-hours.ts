"use server";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import { generateSlots, validateTimeRange } from "@/lib/slot-generator";
import { toLocalDateStr } from "@/lib/date-utils";
import { revalidateBusinessHours, revalidateSpecialDays } from "@/lib/revalidation";
import {
  applySlotOverrides,
  enumerateMonthDates,
  loadDayBusinessHoursContext,
  loadMonthBusinessHoursContext,
  type DayStatus,
} from "@/lib/business-hours-resolver";
import type { ActionResult } from "@/types";

const DAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

// ============================================================
// 查詢
// ============================================================

/**
 * 解析當前讀取視角的 storeId。
 * - ADMIN: 優先用 active-store-id cookie
 * - 其他員工: user.storeId
 * 回傳 null 代表 ADMIN 選了「全部分店」視角（業務上需由呼叫端阻擋）
 */
async function resolveReadStoreId(user: { role: string; storeId?: string | null }): Promise<string | null> {
  if (user.role === "ADMIN") {
    const { getActiveStoreForRead } = await import("@/lib/store");
    return getActiveStoreForRead(user);
  }
  return user.storeId ?? null;
}

/** 取得每週固定營業時間（7 筆，已排序） */
export async function getBusinessHours() {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) return [];
  const rows = await prisma.businessHours.findMany({
    where: { storeId },
    orderBy: { dayOfWeek: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    dayName: DAY_NAMES[r.dayOfWeek],
  }));
}

/** 取得特殊日期列表（未來 + 最近 30 天） */
export async function getSpecialDays() {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) return [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return prisma.specialBusinessDay.findMany({
    where: { storeId, date: { gte: thirtyDaysAgo } },
    orderBy: { date: "asc" },
  });
}

/** 取得指定月份的特殊日期 map */
export async function getMonthSpecialDays(year: number, month: number) {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) return [];
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0)); // last day

  const rows = await prisma.specialBusinessDay.findMany({
    where: { storeId, date: { gte: start, lte: end } },
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

/** 取得整月每日營業摘要（月曆格用，與前台同源 resolver） */
export async function getMonthScheduleSummary(year: number, month: number) {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) {
    // ADMIN 全部分店模式：沒有特定店可匯總，回傳空摘要
    return {};
  }

  const ctx = await loadMonthBusinessHoursContext(storeId, year, month);

  // 按日聚合 override 數量（後台需顯示「該日有 N 個時段覆寫」徽章）
  const overrideCounts = new Map<string, number>();
  for (const o of ctx.slotOverrides) {
    const key = o.date.toISOString().slice(0, 10);
    overrideCounts.set(key, (overrideCounts.get(key) ?? 0) + 1);
  }

  const days: Record<
    string,
    {
      status: DayStatus;
      openTime: string | null;
      closeTime: string | null;
      slotCount: number;
      overrideCount: number;
    }
  > = {};

  for (const { dateStr } of enumerateMonthDates(year, month)) {
    const rule = ctx.rules.get(dateStr)!;
    const slotCount = rule.openTime && rule.closeTime
      ? generateSlots(rule.openTime, rule.closeTime, rule.slotInterval, 1).length
      : 0;
    days[dateStr] = {
      status: rule.status,
      openTime: rule.openTime,
      closeTime: rule.closeTime,
      slotCount,
      overrideCount: overrideCounts.get(dateStr) ?? 0,
    };
  }

  return days;
}

/** 取得某天的可預約時段（與前台同源 resolver；額外帶後台需要的欄位） */
export async function getDaySlotDetails(dateStr: string) {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) {
    throw new AppError("UNAUTHORIZED", "請先從右上角切換到特定店舖");
  }
  const dateObj = new Date(dateStr + "T00:00:00Z");
  const dow = dateObj.getUTCDay();

  // 後台額外需要的原始 row（供 weeklyDefault / specialDayId 等回傳用）
  const [specialDay, businessHour, ctx] = await Promise.all([
    prisma.specialBusinessDay.findFirst({ where: { storeId, date: dateObj } }),
    prisma.businessHours.findFirst({ where: { storeId, dayOfWeek: dow } }),
    loadDayBusinessHoursContext(storeId, dateStr),
  ]);

  const rule = ctx.rule;
  const resolvedSlots = applySlotOverrides(rule, ctx.slotOverrides);

  // 後台需要 templateCapacity（覆寫前的容量），故沿用 generateSlots 計算原始容量做對照
  const templateMap = new Map<string, number>();
  if (rule.openTime && rule.closeTime) {
    for (const g of generateSlots(rule.openTime, rule.closeTime, rule.slotInterval, rule.defaultCapacity)) {
      templateMap.set(g.startTime, g.capacity);
    }
  }

  const filteredSlots = resolvedSlots.map((s) => ({
    startTime: s.startTime,
    capacity: s.capacity,
    templateCapacity: templateMap.get(s.startTime) ?? rule.defaultCapacity,
    isEnabled: s.isEnabled,
    inRange: s.inRange,
    override: s.override,
    overrideReason: s.overrideReason,
  }));

  return {
    status: rule.status,
    openTime: rule.openTime,
    closeTime: rule.closeTime,
    reason: rule.reason,
    specialDayId: specialDay?.id ?? null,
    dayOfWeek: dow,
    dayName: DAY_NAMES[dow],
    slotInterval: rule.slotInterval,
    defaultCapacity: rule.defaultCapacity,
    slots: filteredSlots,
    hasWeeklyDefault: !!businessHour,
    weeklyDefault: businessHour ? {
      isOpen: businessHour.isOpen,
      openTime: businessHour.openTime,
      closeTime: businessHour.closeTime,
      slotInterval: businessHour.slotInterval,
      defaultCapacity: businessHour.defaultCapacity,
    } : null,
  };
}

/** 判斷指定日期是否營業，回傳 { open, openTime, closeTime, reason }（共用 resolver） */
export async function getDayStatus(storeId: string, date: Date): Promise<{
  open: boolean;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}> {
  const dateStr = date.toISOString().slice(0, 10);
  const ctx = await loadDayBusinessHoursContext(storeId, dateStr);
  return {
    open: !ctx.rule.closed,
    openTime: ctx.rule.openTime,
    closeTime: ctx.rule.closeTime,
    reason: ctx.rule.reason,
  };
}

// ============================================================
// 更新固定營業時間
// ============================================================

export async function updateBusinessHours(
  dayOfWeek: number,
  input: {
    isOpen: boolean;
    openTime: string | null;
    closeTime: string | null;
    slotInterval?: number;
    defaultCapacity?: number;
  }
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = user.storeId!;

    // 基本規則驗證（時間範圍、間隔、名額）
    if (input.isOpen) {
      const v = validateTimeRange({
        openTime: input.openTime,
        closeTime: input.closeTime,
        slotInterval: input.slotInterval,
        defaultCapacity: input.defaultCapacity,
      });
      if (!v.valid) throw new AppError("VALIDATION", v.error!);
    }

    // ② 容量下限防呆：若降低容量，檢查未來該星期是否有時段已超預約數
    if (input.defaultCapacity != null && input.isOpen) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const maxBooked = await prisma.booking.groupBy({
        by: ["bookingDate", "slotTime"],
        where: {
          storeId,
          bookingDate: { gte: today },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        _sum: { people: true },
        having: { people: { _sum: { gt: input.defaultCapacity } } },
      });
      const conflicting = maxBooked.filter((b) => b.bookingDate.getUTCDay() === dayOfWeek);
      if (conflicting.length > 0) {
        const first = conflicting[0];
        const dateStr = first.bookingDate.toISOString().slice(0, 10);
        const booked = first._sum.people ?? 0;
        throw new AppError(
          "VALIDATION",
          `${dateStr} ${first.slotTime} 已預約 ${booked} 人，容量 ${input.defaultCapacity} 不足。請先處理該預約或使用單日覆寫`
        );
      }
    }

    // ③ 間隔/時段範圍變更：檢查未來是否有預約會落在新規則之外
    if (input.isOpen && input.openTime && input.closeTime) {
      const newInterval = input.slotInterval ?? 60;
      const newSlots = generateSlots(input.openTime, input.closeTime, newInterval, 1);
      const validTimes = new Set(newSlots.map((s) => s.startTime));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureBookings = await prisma.booking.findMany({
        where: {
          storeId,
          bookingDate: { gte: today },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { bookingDate: true, slotTime: true, people: true },
      });

      // 只看該星期別 + 沒有 SpecialBusinessDay 覆蓋的日期
      const orphans: { dateStr: string; slotTime: string }[] = [];
      for (const b of futureBookings) {
        if (b.bookingDate.getUTCDay() !== dayOfWeek) continue;
        if (!validTimes.has(b.slotTime)) {
          orphans.push({
            dateStr: b.bookingDate.toISOString().slice(0, 10),
            slotTime: b.slotTime,
          });
        }
      }

      if (orphans.length > 0) {
        // 過濾掉有 SpecialBusinessDay 的日期（那些日期有自己的規則）
        const orphanDates = [...new Set(orphans.map((o) => o.dateStr))];
        const specialDays = await prisma.specialBusinessDay.findMany({
          where: { storeId, date: { in: orphanDates.map((d) => new Date(d)) } },
          select: { date: true },
        });
        const specialDateSet = new Set(specialDays.map((s) => s.date.toISOString().slice(0, 10)));
        const realOrphans = orphans.filter((o) => !specialDateSet.has(o.dateStr));

        if (realOrphans.length > 0) {
          const first = realOrphans[0];
          throw new AppError(
            "VALIDATION",
            `變更後 ${first.dateStr} 的 ${first.slotTime} 時段將不存在，但已有預約。請先取消該預約或使用單日覆寫保留該時段`
          );
        }
      }
    }

    // 設為公休時：檢查未來該星期是否有預約
    if (!input.isOpen) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futureBookingsOnDay = await prisma.booking.findMany({
        where: {
          storeId,
          bookingDate: { gte: today },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        select: { bookingDate: true },
      });
      const affected = futureBookingsOnDay.filter((b) => b.bookingDate.getUTCDay() === dayOfWeek);
      if (affected.length > 0) {
        const dateStr = affected[0].bookingDate.toISOString().slice(0, 10);
        throw new AppError(
          "VALIDATION",
          `${dateStr} 等日期尚有預約，無法直接設為公休。請先取消或調整該日預約`
        );
      }
    }

    await prisma.businessHours.upsert({
      where: { storeId_dayOfWeek: { storeId, dayOfWeek } },
      update: {
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
        ...(input.slotInterval != null ? { slotInterval: input.slotInterval } : {}),
        ...(input.defaultCapacity != null ? { defaultCapacity: input.defaultCapacity } : {}),
      },
      create: {
        storeId,
        dayOfWeek,
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
        slotInterval: input.slotInterval ?? 60,
        defaultCapacity: input.defaultCapacity ?? 6,
      },
    });

    // 清理未來同星期的 custom 類型 SpecialBusinessDay，讓新的每週規則生效
    // 保留 closed / training（那些是刻意的例外）
    const todayUTC = new Date(toLocalDateStr() + "T00:00:00Z");
    const futureCustomDays = await prisma.specialBusinessDay.findMany({
      where: {
        storeId,
        type: "custom",
        date: { gte: todayUTC },
      },
      select: { id: true, date: true },
    });
    const idsToDelete = futureCustomDays
      .filter((d) => d.date.getUTCDay() === dayOfWeek)
      .map((d) => d.id);
    if (idsToDelete.length > 0) {
      await prisma.specialBusinessDay.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    revalidateBusinessHours();
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
  defaultCapacity?: number;
}): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = user.storeId!;

    const dateObj = new Date(input.date);
    const isCustom = input.type === "custom";

    // 基本規則驗證（自訂時段必須合理）
    if (isCustom) {
      const v = validateTimeRange({
        openTime: input.openTime,
        closeTime: input.closeTime,
        defaultCapacity: input.defaultCapacity,
      });
      if (!v.valid) throw new AppError("VALIDATION", v.error!);
    }

    // ② 容量下限防呆：custom 模式降容量時，檢查該日最大已預約人數
    if (isCustom && input.defaultCapacity != null) {
      const maxBookedSlot = await prisma.booking.groupBy({
        by: ["slotTime"],
        where: {
          storeId,
          bookingDate: dateObj,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        _sum: { people: true },
        orderBy: { _sum: { people: "desc" } },
        take: 1,
      });
      if (maxBookedSlot.length > 0) {
        const maxBooked = maxBookedSlot[0]._sum.people ?? 0;
        if (input.defaultCapacity < maxBooked) {
          throw new AppError(
            "VALIDATION",
            `${input.date} ${maxBookedSlot[0].slotTime} 已預約 ${maxBooked} 人，容量不可低於此數`
          );
        }
      }
    }

    // 若設為 closed/training，檢查該日是否還有預約
    if (input.type === "closed" || input.type === "training") {
      const activeBookings = await prisma.booking.count({
        where: {
          storeId,
          bookingDate: dateObj,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
      });
      if (activeBookings > 0) {
        throw new AppError(
          "VALIDATION",
          `${input.date} 尚有 ${activeBookings} 筆有效預約，無法設為${input.type === "closed" ? "店休" : "進修"}。請先取消或調整預約`
        );
      }
    }

    await prisma.specialBusinessDay.upsert({
      where: { storeId_date: { storeId, date: dateObj } },
      update: {
        type: input.type,
        reason: input.reason ?? null,
        openTime: isCustom ? (input.openTime ?? null) : null,
        closeTime: isCustom ? (input.closeTime ?? null) : null,
        defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
      },
      create: {
        storeId,
        date: dateObj,
        type: input.type,
        reason: input.reason ?? null,
        openTime: isCustom ? (input.openTime ?? null) : null,
        closeTime: isCustom ? (input.closeTime ?? null) : null,
        defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
      },
    });

    revalidateSpecialDays();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function removeSpecialDay(id: string): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = user.storeId!;

    // 確認該記錄屬於此店
    const existing = await prisma.specialBusinessDay.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new AppError("VALIDATION", "找不到該特殊日期設定");

    await prisma.specialBusinessDay.delete({ where: { id } });

    revalidateSpecialDays();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 移除指定日期的特殊設定（回復為每週預設） */
export async function removeSpecialDayByDate(dateStr: string): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = user.storeId!;

    const dateObj = new Date(dateStr);
    await prisma.specialBusinessDay.deleteMany({ where: { storeId, date: dateObj } });

    revalidateSpecialDays();
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
  defaultCapacity?: number;
  weeks: number;       // 複製到未來幾週（1-52）
}): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = user.storeId!;

    if (input.weeks < 1 || input.weeks > 52) {
      throw new AppError("VALIDATION", "複製週數需在 1-52 之間");
    }

    // 基本規則驗證
    if (input.type === "custom") {
      const v = validateTimeRange({
        openTime: input.openTime,
        closeTime: input.closeTime,
        defaultCapacity: input.defaultCapacity,
      });
      if (!v.valid) throw new AppError("VALIDATION", v.error!);
    }

    const sourceDate = new Date(input.sourceDate + "T00:00:00Z");
    const dates: Date[] = [];
    const isCustom = input.type === "custom";

    for (let i = 1; i <= input.weeks; i++) {
      const d = new Date(sourceDate);
      d.setUTCDate(d.getUTCDate() + 7 * i);
      dates.push(d);
    }

    // 批次 upsert
    const upserts = dates.map((d) =>
      prisma.specialBusinessDay.upsert({
        where: { storeId_date: { storeId, date: d } },
        update: {
          type: input.type,
          reason: input.reason ?? null,
          openTime: isCustom ? (input.openTime ?? null) : null,
          closeTime: isCustom ? (input.closeTime ?? null) : null,
          defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
        },
        create: {
          storeId,
          date: d,
          type: input.type,
          reason: input.reason ?? null,
          openTime: isCustom ? (input.openTime ?? null) : null,
          closeTime: isCustom ? (input.closeTime ?? null) : null,
          defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
        },
      })
    );

    await prisma.$transaction(upserts);

    revalidateSpecialDays();
    return { success: true, data: { count: dates.length } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// SlotOverride — 單日時段覆寫
// ============================================================

/** 取得某天的所有 slot override */
export async function getDaySlotOverrides(storeId: string, dateStr: string) {
  const dateObj = new Date(dateStr + "T00:00:00Z");
  return prisma.slotOverride.findMany({
    where: { storeId, date: dateObj },
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
    const storeId = user.storeId!;

    const dateObj = new Date(input.date + "T00:00:00Z");

    // ② 關閉時段前檢查是否有預約
    if (input.action === "disable") {
      const bookedAgg = await prisma.booking.aggregate({
        where: {
          storeId,
          bookingDate: dateObj,
          slotTime: input.startTime,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        _sum: { people: true },
      });
      const bookedCount = bookedAgg._sum.people ?? 0;
      if (bookedCount > 0) {
        throw new AppError("VALIDATION", `${input.startTime} 尚有 ${bookedCount} 人預約，無法關閉。請先取消該時段預約`);
      }
    }

    if (input.action === "remove") {
      await prisma.slotOverride.deleteMany({
        where: { storeId, date: dateObj, startTime: input.startTime },
      });
    } else {
      await prisma.slotOverride.upsert({
        where: { storeId_date_startTime: { storeId, date: dateObj, startTime: input.startTime } },
        update: {
          type: input.action === "disable" ? "disabled" : "enabled",
          reason: input.reason ?? null,
        },
        create: {
          storeId,
          date: dateObj,
          startTime: input.startTime,
          type: input.action === "disable" ? "disabled" : "enabled",
          reason: input.reason ?? null,
        },
      });
    }

    revalidateSpecialDays();
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
    const storeId = user.storeId!;

    if (input.capacity < 0 || input.capacity > 99) {
      throw new AppError("VALIDATION", "容量需在 0-99 之間");
    }

    const dateObj = new Date(input.date + "T00:00:00Z");

    // ② 容量下限防呆：不可低於該時段已預約人數
    const bookedAgg = await prisma.booking.aggregate({
      where: {
        storeId,
        bookingDate: dateObj,
        slotTime: input.startTime,
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      _sum: { people: true },
    });
    const bookedCount = bookedAgg._sum.people ?? 0;
    if (input.capacity < bookedCount) {
      throw new AppError("VALIDATION", `該時段已預約 ${bookedCount} 人，容量不可低於此數`);
    }

    await prisma.slotOverride.upsert({
      where: { storeId_date_startTime: { storeId, date: dateObj, startTime: input.startTime } },
      update: {
        type: "capacity_change",
        capacity: input.capacity,
        reason: input.reason ?? null,
      },
      create: {
        storeId,
        date: dateObj,
        startTime: input.startTime,
        type: "capacity_change",
        capacity: input.capacity,
        reason: input.reason ?? null,
      },
    });

    revalidateSpecialDays();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// 每週排班模板（含時段開關）— 複製來源日的完整配置到未來同星期
// ============================================================

/**
 * 把某天的營業時間 + SlotOverride 配置，套用到未來同星期幾的所有日期。
 *
 * 行為：
 * 1. 更新 BusinessHours（營業時間/間隔/名額）
 * 2. 讀取來源日所有 SlotOverride
 * 3. 找出未來 N 週同星期幾的日期
 * 4. 清除那些日期的既有 SlotOverride + custom SpecialBusinessDay
 * 5. 複製來源日的 SlotOverride 到所有目標日期
 * 6. 清除來源日的 custom SpecialBusinessDay
 */
export async function applyWeeklyTemplate(input: {
  sourceDate: string;    // YYYY-MM-DD — 來源日期
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  slotInterval: number;
  defaultCapacity: number;
  weeks: number;         // 套用到未來幾週（1-52）
}): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = user.storeId!;

    if (input.weeks < 1 || input.weeks > 104) {
      throw new AppError("VALIDATION", "週數需在 1-104 之間");
    }

    const sourceDate = new Date(input.sourceDate + "T00:00:00Z");
    const dayOfWeek = sourceDate.getUTCDay();

    // 1. 更新 BusinessHours
    if (input.isOpen) {
      const v = validateTimeRange({
        openTime: input.openTime,
        closeTime: input.closeTime,
        slotInterval: input.slotInterval,
        defaultCapacity: input.defaultCapacity,
      });
      if (!v.valid) throw new AppError("VALIDATION", v.error!);
    }

    await prisma.businessHours.upsert({
      where: { storeId_dayOfWeek: { storeId, dayOfWeek } },
      update: {
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
        slotInterval: input.slotInterval,
        defaultCapacity: input.defaultCapacity,
      },
      create: {
        storeId,
        dayOfWeek,
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
        slotInterval: input.slotInterval,
        defaultCapacity: input.defaultCapacity,
      },
    });

    // 2. 讀取來源日的 SlotOverride
    const sourceOverrides = await prisma.slotOverride.findMany({
      where: { storeId, date: sourceDate },
    });

    // 3. 計算目標日期
    const targetDates: Date[] = [];
    for (let i = 1; i <= input.weeks; i++) {
      const d = new Date(sourceDate);
      d.setUTCDate(d.getUTCDate() + 7 * i);
      targetDates.push(d);
    }

    // 4. 批次清除：用 date IN (...) 一次刪完（不用逐日 deleteMany）
    await prisma.slotOverride.deleteMany({
      where: { storeId, date: { in: targetDates } },
    });
    await prisma.specialBusinessDay.deleteMany({
      where: { storeId, date: { in: targetDates }, type: "custom" },
    });

    // 5. 批次建立：用 createMany 一次寫入所有 override
    if (sourceOverrides.length > 0) {
      const createData = targetDates.flatMap((targetDate) =>
        sourceOverrides.map((src) => ({
          storeId,
          date: targetDate,
          startTime: src.startTime,
          type: src.type,
          capacity: src.capacity,
          reason: src.reason,
        }))
      );
      await prisma.slotOverride.createMany({ data: createData });
    }

    // 6. 清除來源日的 custom SpecialBusinessDay
    await prisma.specialBusinessDay.deleteMany({
      where: { storeId, date: sourceDate, type: "custom" },
    });

    revalidateBusinessHours();
    return { success: true, data: { count: targetDates.length } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// syncFromHeadquarters — 套用總部營業時間與時段設定
// ============================================================

export async function syncFromHeadquarters(): Promise<
  ActionResult<{ businessHours: number; bookingSlots: number }>
> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = user.storeId!;

    // 找到總部（isDefault = true）
    const hq = await prisma.store.findFirst({ where: { isDefault: true } });
    if (!hq) throw new AppError("NOT_FOUND", "找不到總部店");
    if (storeId === hq.id) {
      throw new AppError("VALIDATION", "總部不需要同步自己的設定");
    }

    // 讀取總部的 BusinessHours 和 BookingSlot
    const [hqHours, hqSlots] = await Promise.all([
      prisma.businessHours.findMany({ where: { storeId: hq.id } }),
      prisma.bookingSlot.findMany({ where: { storeId: hq.id } }),
    ]);

    // 使用 transaction 確保原子性
    await prisma.$transaction(async (tx) => {
      // 清空該店現有設定
      await tx.businessHours.deleteMany({ where: { storeId } });
      await tx.bookingSlot.deleteMany({ where: { storeId } });

      // 從總部複製 BusinessHours
      if (hqHours.length > 0) {
        await tx.businessHours.createMany({
          data: hqHours.map((h) => ({
            storeId,
            dayOfWeek: h.dayOfWeek,
            isOpen: h.isOpen,
            openTime: h.openTime,
            closeTime: h.closeTime,
            slotInterval: h.slotInterval,
            defaultCapacity: h.defaultCapacity,
          })),
        });
      }

      // 從總部複製 BookingSlot
      if (hqSlots.length > 0) {
        await tx.bookingSlot.createMany({
          data: hqSlots.map((s) => ({
            storeId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            capacity: s.capacity,
            isEnabled: s.isEnabled,
          })),
        });
      }
    });

    revalidateBusinessHours();
    return {
      success: true,
      data: { businessHours: hqHours.length, bookingSlots: hqSlots.length },
    };
  } catch (e) {
    return handleActionError(e);
  }
}
