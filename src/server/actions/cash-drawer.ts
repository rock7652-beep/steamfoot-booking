"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, requireWritablePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { currentStoreId } from "@/lib/store";
import { toLocalDateStr } from "@/lib/date-utils";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import type { ActionResult } from "@/types";
import {
  initializeCashDrawer,
  openCashDrawer,
  getCurrentCashDrawer,
  addCashDrawerEntry,
  closeCashDrawer,
} from "@/server/services/cash-drawer";

// ============================================================
// Validators
// ============================================================

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必須為 YYYY-MM-DD")
  .optional();

const initializeSchema = z.object({
  businessDate: dateSchema, // 預設今日（UTC+8）
  openingBookBalance: z.number().min(0, "金額必須 >= 0"),
  openingActualCash: z.number().min(0, "金額必須 >= 0"),
  note: z.string().optional(),
});

const openSchema = z.object({
  businessDate: dateSchema,
  openingActualCash: z.number().min(0, "金額必須 >= 0"),
  note: z.string().optional(),
});

const addEntrySchema = z.object({
  sessionId: z.string().min(1),
  type: z.enum(["CASH_WITHDRAWAL", "CASH_DEPOSIT", "CASH_ADJUSTMENT"]),
  direction: z.enum(["IN", "OUT"]).optional(),
  amount: z.number().positive("金額必須大於 0"),
  reason: z.string().min(1, "原因必填"),
  note: z.string().optional(),
});

const closeSchema = z.object({
  sessionId: z.string().min(1),
  closingActualCash: z.number().min(0, "金額必須 >= 0"),
  note: z.string().optional(),
});

const querySchema = z.object({
  businessDate: dateSchema,
});

// ============================================================
// Helpers
// ============================================================

/** 將 "YYYY-MM-DD"（UTC+8 視角）轉為 @db.Date 安全的 Date 物件（UTC 同日 00:00） */
function toBusinessDate(dateStr: string | undefined): Date {
  const str = dateStr ?? toLocalDateStr();
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function requireCashDrawerFeature(storeId: string): Promise<void> {
  await requireStoreFeature(storeId, FEATURES.CASH_DRAWER);
}

async function requireCashDrawerFeatureForSession(sessionId: string): Promise<void> {
  const session = await prisma.cashDrawerSession.findUnique({
    where: { id: sessionId },
    select: { storeId: true },
  });
  if (!session) {
    throw new AppError("NOT_FOUND", "找不到指定的現金抽屜 session");
  }
  await requireCashDrawerFeature(session.storeId);
}

// ============================================================
// Actions
// ============================================================

/**
 * 第一次啟用 — 限 OWNER / ADMIN，初始現金由 OWNER 手動輸入。
 * 同店若已有任何 session 即拒絕。
 */
export async function initializeCashDrawerAction(
  input: z.infer<typeof initializeSchema>,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const user = await requireWritablePermission("cashDrawer.open");
    if (user.role !== "ADMIN" && user.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "僅限 OWNER 或 ADMIN 可以執行第一次啟用");
    }
    const data = initializeSchema.parse(input);
    const storeId = currentStoreId(user);
    await requireCashDrawerFeature(storeId);
    const session = await initializeCashDrawer({
      storeId,
      businessDate: toBusinessDate(data.businessDate),
      openingBookBalance: data.openingBookBalance,
      openingActualCash: data.openingActualCash,
      note: data.note,
      actorUserId: user.id,
    });
    revalidatePath("/dashboard/cash-drawer");
    // PR-8: 現金抽屜工作台已嵌入 /dashboard/cashbook（現金管理主頁），
    // 同時 revalidate 以保證從任一入口操作後另一個入口的快取也更新。
    revalidatePath("/dashboard/cashbook");
    return { success: true, data: { sessionId: session.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 開店點錢 */
export async function openCashDrawerAction(
  input: z.infer<typeof openSchema>,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const user = await requireWritablePermission("cashDrawer.open");
    const data = openSchema.parse(input);
    const storeId = currentStoreId(user);
    await requireCashDrawerFeature(storeId);
    const session = await openCashDrawer({
      storeId,
      businessDate: toBusinessDate(data.businessDate),
      openingActualCash: data.openingActualCash,
      note: data.note,
      actorUserId: user.id,
    });
    revalidatePath("/dashboard/cash-drawer");
    // PR-8: 現金抽屜工作台已嵌入 /dashboard/cashbook（現金管理主頁），
    // 同時 revalidate 以保證從任一入口操作後另一個入口的快取也更新。
    revalidatePath("/dashboard/cashbook");
    return { success: true, data: { sessionId: session.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 取得指定日 session + 即時統計 */
export async function getCurrentCashDrawerAction(
  input: z.infer<typeof querySchema>,
): Promise<
  ActionResult<{
    sessionId: string | null;
    status: string | null;
    openingBookBalance: string | null;
    expectedClosingCash: string | null;
  }>
> {
  try {
    const user = await requirePermission("cashDrawer.read");
    const data = querySchema.parse(input);
    const viewContext = await resolveStoreViewContextFromCookie(user);
    const storeId = storeIdForViewContext(currentStoreId(user), viewContext);
    if (!storeId) {
      throw new AppError("UNAUTHORIZED", "缺少 storeId，請重新登入");
    }
    await requireCashDrawerFeature(storeId);
    const result = await getCurrentCashDrawer(storeId, toBusinessDate(data.businessDate));
    return {
      success: true,
      data: {
        sessionId: result.session?.id ?? null,
        status: result.session?.status ?? null,
        openingBookBalance: result.session?.openingBookBalance.toString() ?? null,
        expectedClosingCash: result.liveTotals?.expectedClosingCash.toString() ?? null,
      },
    };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 新增手動異動（提領 / 補入 / 調整） */
export async function addCashDrawerEntryAction(
  input: z.infer<typeof addEntrySchema>,
): Promise<ActionResult<{ entryId: string }>> {
  try {
    const user = await requireWritablePermission("cashDrawer.entry");
    const data = addEntrySchema.parse(input);
    await requireCashDrawerFeatureForSession(data.sessionId);
    const entry = await addCashDrawerEntry({
      sessionId: data.sessionId,
      type: data.type,
      direction: data.direction,
      amount: data.amount,
      reason: data.reason,
      note: data.note,
      actorUserId: user.id,
    });
    revalidatePath("/dashboard/cash-drawer");
    // PR-8: 現金抽屜工作台已嵌入 /dashboard/cashbook（現金管理主頁），
    // 同時 revalidate 以保證從任一入口操作後另一個入口的快取也更新。
    revalidatePath("/dashboard/cashbook");
    return { success: true, data: { entryId: entry.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

/** 閉店點錢 */
export async function closeCashDrawerAction(
  input: z.infer<typeof closeSchema>,
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const user = await requireWritablePermission("cashDrawer.close");
    const data = closeSchema.parse(input);
    await requireCashDrawerFeatureForSession(data.sessionId);
    const session = await closeCashDrawer({
      sessionId: data.sessionId,
      closingActualCash: data.closingActualCash,
      note: data.note,
      actorUserId: user.id,
    });
    revalidatePath("/dashboard/cash-drawer");
    // PR-8: 現金抽屜工作台已嵌入 /dashboard/cashbook（現金管理主頁），
    // 同時 revalidate 以保證從任一入口操作後另一個入口的快取也更新。
    revalidatePath("/dashboard/cashbook");
    return { success: true, data: { sessionId: session.id } };
  } catch (e) {
    return handleActionError(e);
  }
}
