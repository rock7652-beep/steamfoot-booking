"use server";

import { revalidatePath } from "next/cache";
import type { StoreSettlementStatus } from "@prisma/client";
import { AppError, handleActionError } from "@/lib/errors";
import { requirePermission, requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import {
  confirmStoreSettlementForStore,
  getStoreSettlementForStoreByMonth,
  getStoreSettlementsForStore,
  reopenStoreSettlementForStore,
  saveStoreSettlementForStore,
  type StoreSettlementInput,
} from "@/server/services/store-settlements";
import type { ActionResult } from "@/types";

const SETTLEMENT_STATUSES = new Set<StoreSettlementStatus>(["DRAFT", "CONFIRMED"]);

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(formData: FormData, key: string): number {
  const value = readString(formData, key);
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("VALIDATION", `${key} 格式不正確`);
  }
  return Math.round(parsed);
}

function readRate(formData: FormData, key: string): number {
  const value = readString(formData, key);
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("VALIDATION", "分潤比例格式不正確");
  }
  return parsed;
}

function readMonth(formData: FormData): string {
  const month = readString(formData, "month");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError("VALIDATION", "月份格式不正確");
  }
  return month;
}

function readStatus(formData: FormData): StoreSettlementStatus {
  const status = readString(formData, "status") || "DRAFT";
  if (!SETTLEMENT_STATUSES.has(status as StoreSettlementStatus)) {
    throw new AppError("VALIDATION", "月結狀態不正確");
  }
  return status as StoreSettlementStatus;
}

function readSettlementInput(formData: FormData): StoreSettlementInput {
  return {
    month: readMonth(formData),
    grossRevenue: readNumber(formData, "grossRevenue"),
    refundAmount: readNumber(formData, "refundAmount"),
    netRevenue: readNumber(formData, "netRevenue"),
    transactionCount: readNumber(formData, "transactionCount"),
    fixedMonthlyFee: readNumber(formData, "fixedMonthlyFee"),
    revenueShareRate: readRate(formData, "revenueShareRate"),
    additionalAmount: readNumber(formData, "additionalAmount"),
    deductionAmount: readNumber(formData, "deductionAmount"),
    note: readString(formData, "note"),
    status: readStatus(formData),
  };
}

export async function resolveSettlementWriteStoreId(user: {
  id: string;
  role: string;
  storeId?: string | null;
}): Promise<string> {
  if (user.role === "ADMIN") {
    return resolveWriteStoreId(user);
  }

  const viewContext = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(user.storeId ?? null, viewContext);
  if (!storeId) {
    throw new AppError("UNAUTHORIZED", "缺少店舖資訊，請重新登入");
  }
  return storeId;
}

export async function saveStoreSettlementAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; status: StoreSettlementStatus }>> {
  try {
    const user = await requireWritablePermission("report.read");
    const storeId = await resolveSettlementWriteStoreId(user);
    const input = readSettlementInput(formData);
    const settlement = await saveStoreSettlementForStore({
      storeId,
      userId: user.id,
      input,
    });
    revalidatePath("/dashboard/service-fee-calculator");
    revalidatePath("/hq/dashboard/service-fee-calculator");
    return { success: true, data: { id: settlement.id, status: settlement.status } };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function confirmStoreSettlementAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; status: StoreSettlementStatus }>> {
  try {
    const user = await requireWritablePermission("report.read");
    const storeId = await resolveSettlementWriteStoreId(user);
    const month = readMonth(formData);
    const settlement = await confirmStoreSettlementForStore({
      storeId,
      month,
      userId: user.id,
    });
    revalidatePath("/dashboard/service-fee-calculator");
    revalidatePath("/hq/dashboard/service-fee-calculator");
    return { success: true, data: { id: settlement.id, status: settlement.status } };
  } catch (e) {
    return handleActionError(e);
  }
}

export async function reopenStoreSettlementAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; status: StoreSettlementStatus }>> {
  try {
    const user = await requireWritablePermission("report.read");
    const storeId = await resolveSettlementWriteStoreId(user);
    const month = readMonth(formData);
    const settlement = await reopenStoreSettlementForStore({
      storeId,
      month,
      userId: user.id,
    });
    revalidatePath("/dashboard/service-fee-calculator");
    revalidatePath("/hq/dashboard/service-fee-calculator");
    return { success: true, data: { id: settlement.id, status: settlement.status } };
  } catch (e) {
    return handleActionError(e);
  }
}

async function resolveSettlementReadStoreId(): Promise<string> {
  const user = await requirePermission("report.read");
  const viewContext = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(user.storeId ?? null, viewContext);
  if (!storeId) {
    throw new AppError("VALIDATION", "請先切換到指定分店，再查看月結紀錄");
  }
  return storeId;
}

export async function getStoreSettlements() {
  const storeId = await resolveSettlementReadStoreId();
  return getStoreSettlementsForStore(storeId);
}

export async function getStoreSettlementByMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError("VALIDATION", "月份格式不正確");
  }
  const storeId = await resolveSettlementReadStoreId();
  return getStoreSettlementForStoreByMonth(storeId, month);
}
