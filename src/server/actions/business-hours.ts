"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { AppError, handleActionError } from "@/lib/errors";
import {
  generateSlots,
  validateBusinessPeriods,
  validateTimeRange,
  type BusinessPeriodInput,
} from "@/lib/slot-generator";
import { toLocalDateStr } from "@/lib/date-utils";
import { revalidateBusinessHours, revalidateSpecialDays } from "@/lib/revalidation";
import { getCachedMonthScheduleSummary } from "@/lib/query-cache";
import {
  loadDayBusinessHoursContext,
  parseBusinessPeriods,
} from "@/lib/business-hours-resolver";
import type { ActionResult } from "@/types";
import { getActiveStoreForRead, resolveWriteStoreId } from "@/lib/store";
import {loadServiceHoursForSettings} from "@/server/services/service-hours-read";
import { getStoreIndustryModule } from "@/lib/industry-module-server";

const DAY_NAMES = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

const periodsJson = (periods: BusinessPeriodInput[]): Prisma.InputJsonValue =>
  periods.map((period) => ({ ...period })) as Prisma.InputJsonValue;

async function assertModuleIntervals(storeId: string, periods?: BusinessPeriodInput[], interval?: number) {
  if ((await getStoreIndustryModule(storeId)) !== "steamfoot") return;
  const values = periods?.map((period) => period.slotInterval) ?? (interval == null ? [] : [interval]);
  if (values.some((value) => ![30, 60, 90, 120].includes(value))) {
    throw new AppError("VALIDATION", "蒸足的預約時段間隔限用 30／60／90／120 分鐘");
  }
}

async function assertBookingsFitSchedule(
  storeId: string,
  dates: Date[],
  periods: BusinessPeriodInput[],
) {
  const capacityByTime = new Map<string, number>();
  for (const period of periods) {
    for (const slot of generateSlots(
      period.openTime,
      period.closeTime,
      period.slotInterval,
      period.defaultCapacity,
    )) {
      capacityByTime.set(slot.startTime, slot.capacity);
    }
  }

  const bookedSlots = await prisma.booking.groupBy({
    by: ["bookingDate", "slotTime"],
    where: {
      storeId,
      bookingDate: { in: dates },
      bookingStatus: { in: ["PENDING", "CONFIRMED"] },
    },
    _sum: { people: true },
  });

  for (const booked of bookedSlots) {
    const dateStr = booked.bookingDate.toISOString().slice(0, 10);
    const capacity = capacityByTime.get(booked.slotTime);
    const people = booked._sum.people ?? 0;
    if (capacity == null) {
      throw new AppError(
        "VALIDATION",
        `${dateStr} ${booked.slotTime} 已有預約，請先把這個時間保留在營業時段內`,
      );
    }
    if (people > capacity) {
      throw new AppError(
        "VALIDATION",
        `${dateStr} ${booked.slotTime} 已預約 ${people} 人，名額不可低於此數`,
      );
    }
  }
}

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
  return getActiveStoreForRead(user);
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
    periods: r.segments,
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

/**
 * 取得整月每日營業摘要（月曆格用，與前台同源 resolver）
 *
 * 走 unstable_cache（60s TTL + tag: business-hours / special-days）。
 * 第一個進來的人付出整月解析的 DB 成本，60s 內後續所有 request 直接讀 cache；
 * 任一 BusinessHours / SpecialBusinessDay / SlotOverride 異動都會觸發
 * revalidation 把所有相關月份的 cache 清掉。
 */
export async function getMonthScheduleSummary(year: number, month: number) {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) {
    // ADMIN 全部分店模式：沒有特定店可匯總，回傳空摘要
    return {};
  }
  return getCachedMonthScheduleSummary(storeId, year, month);
}

/** 取得某天的可預約時段（與前台同源 resolver；額外帶後台需要的欄位） */
export async function getDaySlotDetails(dateStr:string){
 const user=await requirePermission("business_hours.view"),storeId=await resolveReadStoreId(user);
 if(!storeId)throw new AppError("UNAUTHORIZED","請先切換到指定門市");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)||new Date(dateStr+"T00:00:00Z").toISOString().slice(0,10)!==dateStr)throw new AppError("VALIDATION","日期格式不正確");
 return (await loadServiceHoursForSettings(storeId,dateStr)).day;
}

/** 判斷指定日期是否營業，回傳 { open, openTime, closeTime, reason }（共用 resolver） */
export async function getDayStatus(date: Date): Promise<{
  open: boolean;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}> {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) throw new AppError("VALIDATION", "請先從右上角切換到特定店舖");
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
    periods?: BusinessPeriodInput[];
  }
): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");
    await assertModuleIntervals(storeId, input.periods, input.slotInterval);

    // 基本規則驗證（時間範圍、間隔、名額）
    if (input.isOpen) {
      const v = input.periods ? validateBusinessPeriods(input.periods) : validateTimeRange({
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
      const periods = input.periods ?? [{
        openTime: input.openTime,
        closeTime: input.closeTime,
        slotInterval: input.slotInterval ?? 60,
        defaultCapacity: input.defaultCapacity ?? 6,
      }];
      const newSlots = periods.flatMap((period) =>
        generateSlots(period.openTime!, period.closeTime!, period.slotInterval, 1),
      );
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
        segments: input.isOpen && input.periods ? periodsJson(input.periods) : undefined,
      },
      create: {
        storeId,
        dayOfWeek,
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
        slotInterval: input.slotInterval ?? 60,
        defaultCapacity: input.defaultCapacity ?? 6,
        segments: input.isOpen && input.periods ? periodsJson(input.periods) : undefined,
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
        where: { id: { in: idsToDelete }, storeId },
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
  periods?: BusinessPeriodInput[];
  /** 儲存新版日排程時，清除同日舊的逐格微調，避免舊規則繼續蓋掉新時段。 */
  resetSlotOverrides?: boolean;
}): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");
    await assertModuleIntervals(storeId, input.periods);

    const dateObj = new Date(input.date);
    const isCustom = input.type === "custom";

    // 基本規則驗證（自訂時段必須合理）
    if (isCustom) {
      const v = input.periods ? validateBusinessPeriods(input.periods) : validateTimeRange({
        openTime: input.openTime,
        closeTime: input.closeTime,
        defaultCapacity: input.defaultCapacity,
      });
      if (!v.valid) throw new AppError("VALIDATION", v.error!);
    }

    // 重新產生日排程前，先確認既有預約仍落在新時段內且名額足夠。
    // 通過後才可清除舊 SlotOverride，避免既有預約變成孤兒資料。
    if (isCustom && input.resetSlotOverrides) {
      const periods = input.periods ?? [{
        openTime: input.openTime!,
        closeTime: input.closeTime!,
        slotInterval: 60,
        defaultCapacity: input.defaultCapacity ?? 6,
      }];
      await assertBookingsFitSchedule(storeId, [dateObj], periods);
    }

    // ② 容量下限防呆：custom 模式降容量時，檢查該日最大已預約人數
    if (isCustom && input.defaultCapacity != null && !input.resetSlotOverrides) {
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

    const upsertArgs = {
      where: { storeId_date: { storeId, date: dateObj } },
      update: {
        type: input.type,
        reason: input.reason ?? null,
        openTime: isCustom ? (input.openTime ?? null) : null,
        closeTime: isCustom ? (input.closeTime ?? null) : null,
        defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
        segments: isCustom && input.periods ? periodsJson(input.periods) : undefined,
      },
      create: {
        storeId,
        date: dateObj,
        type: input.type,
        reason: input.reason ?? null,
        openTime: isCustom ? (input.openTime ?? null) : null,
        closeTime: isCustom ? (input.closeTime ?? null) : null,
        defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
        segments: isCustom && input.periods ? periodsJson(input.periods) : undefined,
      },
    } satisfies Prisma.SpecialBusinessDayUpsertArgs;

    if (input.resetSlotOverrides) {
      await prisma.$transaction(async (tx) => {
        await tx.specialBusinessDay.upsert(upsertArgs);
        await tx.slotOverride.deleteMany({ where: { storeId, date: dateObj } });
      });
    } else {
      await prisma.specialBusinessDay.upsert(upsertArgs);
    }

    revalidateSpecialDays();
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function removeSpecialDay(id: string): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");

    // 確認該記錄屬於此店
    const existing = await prisma.specialBusinessDay.findFirst({
      where: { id, storeId },
    });
    if (!existing) throw new AppError("VALIDATION", "找不到該特殊日期設定");

    const deleted = await prisma.specialBusinessDay.deleteMany({ where: { id, storeId } });
    if (deleted.count !== 1) throw new AppError("NOT_FOUND", "找不到該特殊日期設定");

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
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");

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
  periods?: BusinessPeriodInput[];
  weeks: number;       // 複製到未來幾週（1-52）
  resetSlotOverrides?: boolean;
}): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");

    if (input.weeks < 1 || input.weeks > 52) {
      throw new AppError("VALIDATION", "複製週數需在 1-52 之間");
    }

    // 基本規則驗證
    if (input.type === "custom") {
      const v = input.periods ? validateBusinessPeriods(input.periods) : validateTimeRange({
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

    if (isCustom && input.resetSlotOverrides) {
      const periods = input.periods ?? [{
        openTime: input.openTime!,
        closeTime: input.closeTime!,
        slotInterval: 60,
        defaultCapacity: input.defaultCapacity ?? 6,
      }];
      await assertBookingsFitSchedule(storeId, dates, periods);
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
          segments: isCustom && input.periods ? periodsJson(input.periods) : undefined,
        },
        create: {
          storeId,
          date: d,
          type: input.type,
          reason: input.reason ?? null,
          openTime: isCustom ? (input.openTime ?? null) : null,
          closeTime: isCustom ? (input.closeTime ?? null) : null,
          defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
          segments: isCustom && input.periods ? periodsJson(input.periods) : undefined,
        },
      })
    );

    await prisma.$transaction([
      ...upserts,
      ...(input.resetSlotOverrides ? [
        prisma.slotOverride.deleteMany({
          where: { storeId, date: { in: dates } },
        }),
      ] : []),
    ]);

    revalidateSpecialDays();
    return { success: true, data: { count: dates.length } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// 複製設定到任選日期
// ============================================================

export async function copySettingsToDates(input: {
  sourceDate: string;
  targetDates: string[];
  type: "closed" | "training" | "custom";
  reason?: string;
  openTime?: string;
  closeTime?: string;
  defaultCapacity?: number;
  periods?: BusinessPeriodInput[];
  conflictMode: "skip" | "replace";
  includeSlotOverrides?: boolean;
}): Promise<ActionResult<{
  count: number;
  skipped: Array<{ date: string; reason: string }>;
  operationId: string;
}>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") {
      throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");
    }
    await assertModuleIntervals(storeId, input.periods);

    const validDate = (value: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(input.sourceDate)) throw new AppError("VALIDATION", "來源日期格式不正確");

    const uniqueDates = [...new Set(input.targetDates)].sort();
    if (uniqueDates.length < 1 || uniqueDates.length > 62) {
      throw new AppError("VALIDATION", "請選擇 1–62 個套用日期");
    }
    if (uniqueDates.some((date) => !validDate(date))) throw new AppError("VALIDATION", "套用日期格式不正確");
    if (uniqueDates.includes(input.sourceDate)) throw new AppError("VALIDATION", "套用日期不可包含來源日期");
    const today = toLocalDateStr();
    if (uniqueDates.some((date) => date < today)) throw new AppError("VALIDATION", "不可套用到過去日期");

    const isCustom = input.type === "custom";
    if (isCustom) {
      const validation = input.periods ? validateBusinessPeriods(input.periods) : validateTimeRange({
        openTime: input.openTime,
        closeTime: input.closeTime,
        defaultCapacity: input.defaultCapacity,
      });
      if (!validation.valid) throw new AppError("VALIDATION", validation.error!);
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`business-hours:${storeId}`}, 0))`;

      const requestedDateObjects = uniqueDates.map((date) => new Date(`${date}T00:00:00Z`));
      const [existingSpecialDays, existingTargetOverrides, sourceOverrides] = await Promise.all([
        tx.specialBusinessDay.findMany({ where: { storeId, date: { in: requestedDateObjects } } }),
        tx.slotOverride.findMany({ where: { storeId, date: { in: requestedDateObjects } } }),
        tx.slotOverride.findMany({
          where: { storeId, date: new Date(`${input.sourceDate}T00:00:00Z`) },
          orderBy: { startTime: "asc" },
        }),
      ]);
      const specialDates = new Set(existingSpecialDays.map((item) => item.date.toISOString().slice(0, 10)));
      const overrideDates = new Set(existingTargetOverrides.map((item) => item.date.toISOString().slice(0, 10)));
      const skipped = input.conflictMode === "skip"
        ? uniqueDates.flatMap((date) => {
            const reasons = [specialDates.has(date) ? "已有整日特殊設定" : null, overrideDates.has(date) ? "已有單一時段調整" : null].filter(Boolean);
            return reasons.length > 0 ? [{ date, reason: reasons.join("、") }] : [];
          })
        : [];
      const skippedDates = new Set(skipped.map((item) => item.date));
      const appliedTargetDates = uniqueDates.filter((date) => !skippedDates.has(date));
      const appliedDateStrings = [input.sourceDate, ...appliedTargetDates];
      const appliedDates = appliedDateStrings.map((date) => new Date(`${date}T00:00:00Z`));

      const [beforeSpecialDays, beforeOverrides] = await Promise.all([
        tx.specialBusinessDay.findMany({ where: { storeId, date: { in: appliedDates } } }),
        tx.slotOverride.findMany({ where: { storeId, date: { in: appliedDates } } }),
      ]);

      const conflicts: string[] = [];
      const bookedSlots = await tx.booking.groupBy({
        by: ["bookingDate", "slotTime"],
        where: { storeId, bookingDate: { in: appliedDates }, bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
        _sum: { people: true },
      });
      if (!isCustom) {
        for (const booking of bookedSlots) {
          conflicts.push(`${booking.bookingDate.toISOString().slice(0, 10)} ${booking.slotTime} 已有 ${booking._sum.people ?? 0} 人預約`);
        }
      } else {
        const periods = input.periods ?? [{
          openTime: input.openTime!, closeTime: input.closeTime!, slotInterval: 60, defaultCapacity: input.defaultCapacity ?? 6,
        }];
        const capacityByTime = new Map<string, number>();
        for (const period of periods) {
          for (const slot of generateSlots(period.openTime, period.closeTime, period.slotInterval, period.defaultCapacity)) {
            capacityByTime.set(slot.startTime, slot.capacity);
          }
        }
        if (input.includeSlotOverrides) {
          for (const override of sourceOverrides) {
            if (override.type === "disabled") capacityByTime.delete(override.startTime);
            else capacityByTime.set(override.startTime, override.capacity ?? capacityByTime.get(override.startTime) ?? input.defaultCapacity ?? 6);
          }
        }
        for (const booking of bookedSlots) {
          const date = booking.bookingDate.toISOString().slice(0, 10);
          const people = booking._sum.people ?? 0;
          const capacity = capacityByTime.get(booking.slotTime);
          if (capacity == null) conflicts.push(`${date} ${booking.slotTime} 已有 ${people} 人預約，但套用後不再開放`);
          else if (people > capacity) conflicts.push(`${date} ${booking.slotTime} 已有 ${people} 人預約，套用後名額只有 ${capacity} 人`);
        }
      }
      if (conflicts.length > 0) {
        throw new AppError("VALIDATION", `以下日期無法套用：\n${conflicts.join("\n")}`);
      }

      await tx.specialBusinessDay.deleteMany({ where: { storeId, date: { in: appliedDates } } });
      await tx.slotOverride.deleteMany({ where: { storeId, date: { in: appliedDates } } });
      for (let index = 0; index < appliedDates.length; index++) {
        const date = appliedDates[index];
        const isSource = index === 0;
        await tx.specialBusinessDay.create({ data: {
          storeId,
          date,
          type: input.type,
          reason: input.reason ?? null,
          openTime: isCustom ? input.openTime ?? null : null,
          closeTime: isCustom ? input.closeTime ?? null : null,
          defaultCapacity: isCustom && input.defaultCapacity != null ? input.defaultCapacity : null,
          segments: isCustom && input.periods ? periodsJson(input.periods) : undefined,
        } });
        // 來源日本身的單格微調預設保留；勾選後才複製到其他日期。
        if ((isSource || input.includeSlotOverrides) && sourceOverrides.length > 0) {
          await tx.slotOverride.createMany({ data: sourceOverrides.map((override) => ({
            storeId,
            date,
            startTime: override.startTime,
            type: override.type,
            capacity: override.capacity,
            reason: override.reason,
          })) });
        }
      }

      const audit = await tx.auditLog.create({ data: {
        actorUserId: user.id,
        targetType: "BusinessHours",
        targetId: storeId,
        action: "COPY_SERVICE_HOURS_TO_DATES",
        beforeJson: {
          dates: appliedDateStrings,
          specialDays: beforeSpecialDays.map((item) => ({
            date: item.date.toISOString().slice(0, 10), type: item.type, reason: item.reason,
            openTime: item.openTime, closeTime: item.closeTime, slotInterval: item.slotInterval,
            defaultCapacity: item.defaultCapacity, segments: item.segments,
          })),
          slotOverrides: beforeOverrides.map((item) => ({
            date: item.date.toISOString().slice(0, 10), startTime: item.startTime, type: item.type,
            capacity: item.capacity, reason: item.reason,
          })),
        },
        afterJson: {
          sourceDate: input.sourceDate,
          targetDates: appliedTargetDates,
          type: input.type,
          reason: input.reason ?? null,
          openTime: input.openTime ?? null,
          closeTime: input.closeTime ?? null,
          defaultCapacity: input.defaultCapacity ?? null,
          periods: input.periods ?? [],
          includeSlotOverrides: input.includeSlotOverrides === true,
          copiedSlotOverrides: sourceOverrides.map((item) => ({ startTime: item.startTime, type: item.type, capacity: item.capacity, reason: item.reason })),
          expectedSlotOverrides: appliedDateStrings.flatMap((date, index) =>
            (index === 0 || input.includeSlotOverrides) ? sourceOverrides.map((item) => ({
              date, startTime: item.startTime, type: item.type, capacity: item.capacity, reason: item.reason,
            })) : []
          ),
        } as unknown as Prisma.InputJsonValue,
      } });
      return { count: appliedTargetDates.length, skipped, operationId: audit.id };
    });

    revalidateSpecialDays();
    return { success: true, data: result };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 復原剛完成的指定日期批次套用；若之後已有其他異動或新預約，會安全阻擋。 */
export async function undoCopySettingsToDates(operationId: string): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if (!operationId) throw new AppError("VALIDATION", "找不到可復原的操作");

    const count = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`business-hours:${storeId}`}, 0))`;
      const audit = await tx.auditLog.findFirst({ where: {
        id: operationId,
        actorUserId: user.id,
        targetType: "BusinessHours",
        targetId: storeId,
        action: "COPY_SERVICE_HOURS_TO_DATES",
      } });
      if (!audit || Date.now() - audit.createdAt.getTime() > 10 * 60 * 1000) {
        throw new AppError("VALIDATION", "復原時間已超過 10 分鐘，請改由日期設定手動調整");
      }
      const before = audit.beforeJson as Record<string, unknown> | null;
      const after = audit.afterJson as Record<string, unknown> | null;
      const dates = Array.isArray(before?.dates) ? before.dates.filter((item): item is string => typeof item === "string") : [];
      const beforeSpecialDays = Array.isArray(before?.specialDays) ? before.specialDays.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
      const beforeOverrides = Array.isArray(before?.slotOverrides) ? before.slotOverrides.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
      if (dates.length < 1) throw new AppError("VALIDATION", "復原資料不完整");

      const dateObjects = dates.map((date) => new Date(`${date}T00:00:00Z`));
      const [currentSpecialDays, currentOverrides] = await Promise.all([
        tx.specialBusinessDay.findMany({ where: { storeId, date: { in: dateObjects } } }),
        tx.slotOverride.findMany({ where: { storeId, date: { in: dateObjects } } }),
      ]);
      const expectedType = typeof after?.type === "string" ? after.type : null;
      const expectedPeriods = JSON.stringify(after?.periods ?? []);
      if (currentSpecialDays.length !== dates.length || currentSpecialDays.some((item) =>
        item.type !== expectedType || JSON.stringify(item.segments ?? []) !== expectedPeriods
      )) {
        throw new AppError("VALIDATION", "這些日期在套用後又有其他修改，為避免覆蓋新設定，已停止復原");
      }
      const normalizeOverrides = (items: Array<Record<string, unknown>>) => items.map((item) => ({
        date: String(item.date), startTime: String(item.startTime), type: String(item.type),
        capacity: typeof item.capacity === "number" ? item.capacity : null,
        reason: typeof item.reason === "string" ? item.reason : null,
      })).sort((a, b) => `${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`));
      const expectedOverrides = Array.isArray(after?.expectedSlotOverrides)
        ? after.expectedSlotOverrides.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        : [];
      const normalizedCurrentOverrides = normalizeOverrides(currentOverrides.map((item) => ({
        date: item.date.toISOString().slice(0, 10), startTime: item.startTime, type: item.type,
        capacity: item.capacity, reason: item.reason,
      })));
      if (JSON.stringify(normalizedCurrentOverrides) !== JSON.stringify(normalizeOverrides(expectedOverrides))) {
        throw new AppError("VALIDATION", "這些日期的單一時段在套用後又有修改，為避免覆蓋新設定，已停止復原");
      }

      const restoredSpecialMap = new Map(beforeSpecialDays.map((item) => [String(item.date), item]));
      const weeklyHours = await tx.businessHours.findMany({ where: { storeId } });
      const weeklyMap = new Map(weeklyHours.map((item) => [item.dayOfWeek, item]));
      const bookings = await tx.booking.groupBy({
        by: ["bookingDate", "slotTime"],
        where: { storeId, bookingDate: { in: dateObjects }, bookingStatus: { in: ["PENDING", "CONFIRMED"] } },
        _sum: { people: true },
      });
      const conflicts: string[] = [];
      for (const booking of bookings) {
        const date = booking.bookingDate.toISOString().slice(0, 10);
        const restoredSpecial = restoredSpecialMap.get(date);
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        const weekly = weeklyMap.get(dow);
        const restoredClosed = restoredSpecial
          ? restoredSpecial.type !== "custom"
          : !weekly?.isOpen;
        if (restoredClosed) {
          conflicts.push(`${date} ${booking.slotTime} 已有預約，復原後將停止開放`);
          continue;
        }
        const source = restoredSpecial ?? weekly;
        if (!source) continue;
        const segments = "segments" in source ? source.segments : undefined;
        const periods = parseBusinessPeriods(segments, {
          openTime: typeof source.openTime === "string" ? source.openTime : null,
          closeTime: typeof source.closeTime === "string" ? source.closeTime : null,
          slotInterval: typeof source.slotInterval === "number" ? source.slotInterval : 60,
          defaultCapacity: typeof source.defaultCapacity === "number" ? source.defaultCapacity : 6,
        });
        const capacities = new Map(periods.flatMap((period) => generateSlots(period.openTime, period.closeTime, period.slotInterval, period.defaultCapacity)).map((slot) => [slot.startTime, slot.capacity]));
        const restoredOverride = beforeOverrides.find((item) => item.date === date && item.startTime === booking.slotTime);
        if (restoredOverride?.type === "disabled") capacities.delete(booking.slotTime);
        else if (restoredOverride && typeof restoredOverride.capacity === "number") capacities.set(booking.slotTime, restoredOverride.capacity);
        const capacity = capacities.get(booking.slotTime);
        const people = booking._sum.people ?? 0;
        if (capacity == null) conflicts.push(`${date} ${booking.slotTime} 已有 ${people} 人預約，復原後不再開放`);
        else if (people > capacity) conflicts.push(`${date} ${booking.slotTime} 已有 ${people} 人預約，復原後名額只有 ${capacity} 人`);
      }
      if (conflicts.length > 0) throw new AppError("VALIDATION", `目前無法復原：\n${conflicts.join("\n")}`);

      await tx.specialBusinessDay.deleteMany({ where: { storeId, date: { in: dateObjects } } });
      await tx.slotOverride.deleteMany({ where: { storeId, date: { in: dateObjects } } });
      for (const item of beforeSpecialDays) {
        if (typeof item.date !== "string" || typeof item.type !== "string") continue;
        await tx.specialBusinessDay.create({ data: {
          storeId, date: new Date(`${item.date}T00:00:00Z`), type: item.type,
          reason: typeof item.reason === "string" ? item.reason : null,
          openTime: typeof item.openTime === "string" ? item.openTime : null,
          closeTime: typeof item.closeTime === "string" ? item.closeTime : null,
          slotInterval: typeof item.slotInterval === "number" ? item.slotInterval : null,
          defaultCapacity: typeof item.defaultCapacity === "number" ? item.defaultCapacity : null,
          segments: Array.isArray(item.segments) ? item.segments as Prisma.InputJsonValue : undefined,
        } });
      }
      if (beforeOverrides.length > 0) {
        await tx.slotOverride.createMany({ data: beforeOverrides.flatMap((item) =>
          typeof item.date === "string" && typeof item.startTime === "string" && typeof item.type === "string"
            ? [{ storeId, date: new Date(`${item.date}T00:00:00Z`), startTime: item.startTime, type: item.type, capacity: typeof item.capacity === "number" ? item.capacity : null, reason: typeof item.reason === "string" ? item.reason : null }]
            : []
        ) });
      }
      await tx.auditLog.create({ data: {
        actorUserId: user.id, targetType: "BusinessHours", targetId: storeId,
        action: "UNDO_COPY_SERVICE_HOURS_TO_DATES", beforeJson: audit.afterJson ?? undefined, afterJson: audit.beforeJson ?? undefined,
      } });
      return dates.length;
    });
    revalidateSpecialDays();
    return { success: true, data: { count } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// SlotOverride — 單日時段覆寫
// ============================================================

/** 取得某天的所有 slot override */
export async function getDaySlotOverrides(dateStr: string) {
  const user = await requireStaffSession();
  const storeId = await resolveReadStoreId(user);
  if (!storeId) throw new AppError("VALIDATION", "請先從右上角切換到特定店舖");
  const dateObj = new Date(dateStr + "T00:00:00Z");
  return prisma.slotOverride.findMany({
    where: { storeId, date: dateObj },
    orderBy: { startTime: "asc" },
  });
}

/**
 * 儲存單日多個時段覆寫。這是設定頁與預約管理共用的唯一寫入入口；
 * 關閉只停止新預約，絕不變更既有 booking、收款或扣堂資料。
 */
export async function applyDaySlotOverrides(input: {
  date: string;
  changes: Array<{
    startTime: string;
    action: "disable" | "enable" | "remove" | "capacity";
    capacity?: number;
    reason?: string;
  }>;
}): Promise<ActionResult<{ changed: number; bookedPeopleKept: number }>> {
  // Fixed action label only; no arguments, customer data, or identifiers.
  console.info("[BOOKING_ACTION]", "applyDaySlotOverrides");
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw new AppError("VALIDATION", "日期格式不正確");
    }
    if (input.changes.length < 1 || input.changes.length > 48) {
      throw new AppError("VALIDATION", "請選擇 1–48 個時段");
    }
    const times = new Set<string>();
    for (const change of input.changes) {
      if (!/^\d{2}:\d{2}$/.test(change.startTime) || times.has(change.startTime)) {
        throw new AppError("VALIDATION", "時段資料不正確或重複");
      }
      times.add(change.startTime);
    }

    const context = await loadDayBusinessHoursContext(storeId, input.date);
    if (context.rule.closed && input.changes.some((change) => change.action !== "disable")) {
      throw new AppError("VALIDATION", "此日為全天休息，請先在服務時間設定開放當日，再新增或重新開放時段");
    }

    const dateObj = new Date(input.date + "T00:00:00Z");
    const booked = await prisma.booking.groupBy({
      by: ["slotTime"],
      where: {
        storeId,
        bookingDate: dateObj,
        slotTime: { in: [...times] },
        bookingStatus: { in: ["PENDING", "CONFIRMED"] },
      },
      _sum: { people: true },
    });
    const bookedByTime = new Map(booked.map((row) => [row.slotTime, row._sum.people ?? 0]));
    const existingOverrides = new Map(
      context.slotOverrides.map((override) => [override.startTime, override]),
    );
    for (const change of input.changes) {
      if (change.capacity == null) continue;
      if (!Number.isInteger(change.capacity) || change.capacity < 0 || change.capacity > 99) {
        throw new AppError("VALIDATION", "名額需為 0–99 的整數");
      }
      const bookedPeople = bookedByTime.get(change.startTime) ?? 0;
      if (change.capacity < bookedPeople) {
        throw new AppError("VALIDATION", `${input.date} ${change.startTime} 已預約 ${bookedPeople} 人，名額不可低於此數`);
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const change of input.changes) {
        if (change.action === "remove") {
          await tx.slotOverride.deleteMany({
            where: { storeId, date: dateObj, startTime: change.startTime },
          });
          continue;
        }
        const existingOverride = existingOverrides.get(change.startTime);
        const type = change.action === "disable"
          ? "disabled"
          : change.action === "capacity"
            ? existingOverride?.type === "enabled"
              ? "enabled"
              : "capacity_change"
            : "enabled";
        const capacity = change.action === "disable"
          ? null
          : (change.capacity ?? existingOverride?.capacity ?? null);
        await tx.slotOverride.upsert({
          where: { storeId_date_startTime: { storeId, date: dateObj, startTime: change.startTime } },
          update: {
            type,
            capacity,
            reason: change.reason ?? existingOverride?.reason ?? null,
          },
          create: {
            storeId,
            date: dateObj,
            startTime: change.startTime,
            type,
            capacity,
            reason: change.reason ?? null,
          },
        });
      }
    });

    revalidateSpecialDays();
    return {
      success: true,
      data: {
        changed: input.changes.length,
        bookedPeopleKept: input.changes
          .filter((change) => change.action === "disable")
          .reduce((total, change) => total + (bookedByTime.get(change.startTime) ?? 0), 0),
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 切換單一時段的開/關（設定頁的快速操作；與批次操作共用相同規則） */
export async function toggleSlotOverride(input: {
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  action: "disable" | "enable" | "remove"; // disable=關閉, enable=強制開放, remove=回復預設
  reason?: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");

    const dateObj = new Date(input.date + "T00:00:00Z");

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
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");

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
  periods?: BusinessPeriodInput[];
  weeks: number;         // 套用到未來幾週（1-52）
}): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requirePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    if ((await getStoreIndustryModule(storeId)) === "course") throw new AppError("FORBIDDEN", "課程門市請使用課程營業設定，以保留排課衝突檢查");

    if (input.weeks < 1 || input.weeks > 104) {
      throw new AppError("VALIDATION", "週數需在 1-104 之間");
    }

    const sourceDate = new Date(input.sourceDate + "T00:00:00Z");
    const dayOfWeek = sourceDate.getUTCDay();

    // 1. 更新 BusinessHours
    if (input.isOpen) {
      const v = input.periods ? validateBusinessPeriods(input.periods) : validateTimeRange({
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
        segments: input.isOpen && input.periods ? periodsJson(input.periods) : undefined,
      },
      create: {
        storeId,
        dayOfWeek,
        isOpen: input.isOpen,
        openTime: input.isOpen ? input.openTime : null,
        closeTime: input.isOpen ? input.closeTime : null,
        slotInterval: input.slotInterval,
        defaultCapacity: input.defaultCapacity,
        segments: input.isOpen && input.periods ? periodsJson(input.periods) : undefined,
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
    const destinationStoreId = await resolveWriteStoreId(user);

    // 找到總部（isDefault = true）
    const hq = await prisma.store.findFirst({
      where: { isDefault: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!hq) throw new AppError("NOT_FOUND", "找不到總部店");
    const sourceStoreId = hq.id;
    if (destinationStoreId === sourceStoreId) {
      throw new AppError("VALIDATION", "總部不需要同步自己的設定");
    }

    // 讀取總部的 BusinessHours 和 BookingSlot
    const [hqHours, hqSlots] = await Promise.all([
      prisma.businessHours.findMany({ where: { storeId: sourceStoreId } }),
      prisma.bookingSlot.findMany({ where: { storeId: sourceStoreId } }),
    ]);

    // 使用 transaction 確保原子性
    await prisma.$transaction(async (tx) => {
      // 清空該店現有設定
      await tx.businessHours.deleteMany({ where: { storeId: destinationStoreId } });
      await tx.bookingSlot.deleteMany({ where: { storeId: destinationStoreId } });

      // 從總部複製 BusinessHours
      if (hqHours.length > 0) {
        await tx.businessHours.createMany({
          data: hqHours.map((h) => ({
            storeId: destinationStoreId,
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
            storeId: destinationStoreId,
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
