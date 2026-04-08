"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { AppError, handleActionError } from "@/lib/errors";
import type { ActionResult } from "@/types";

async function requireOwner() {
  const user = await requireSession();
  if (user.role !== "OWNER") {
    throw new AppError("FORBIDDEN", "此功能僅限店主使用");
  }
  return user;
}

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

/** 判斷指定日期是否營業，回傳 { open, openTime, closeTime, reason } */
export async function getDayStatus(date: Date): Promise<{
  open: boolean;
  openTime: string | null;
  closeTime: string | null;
  reason: string | null;
}> {
  // 1. 先查特殊日期
  const dateOnly = new Date(date.toISOString().slice(0, 10));
  const special = await prisma.specialBusinessDay.findUnique({
    where: { date: dateOnly },
  });
  if (special) {
    if (special.type === "closed" || special.type === "training") {
      return { open: false, openTime: null, closeTime: null, reason: special.reason ?? (special.type === "training" ? "進修日" : "公休") };
    }
    // custom
    return { open: true, openTime: special.openTime, closeTime: special.closeTime, reason: special.reason };
  }

  // 2. 查固定營業時間
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
    const user = await requireOwner();

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
    const user = await requireOwner();

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
    const user = await requireOwner();

    await prisma.specialBusinessDay.delete({ where: { id } });

    revalidatePath("/dashboard/settings/hours");
    return { success: true, data: undefined };
  } catch (e) {
    return handleActionError(e);
  }
}
