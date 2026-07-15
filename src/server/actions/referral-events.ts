"use server";

import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireSession } from "@/lib/session";
import {
  createReferralEvent,
  type CreateReferralEventInput,
} from "@/server/services/referral-events";
import type { ActionResult } from "@/types";
import type { ReferralEventType } from "@prisma/client";
import { hasStoreFeature, requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";

const VALID_EVENT_TYPES: readonly ReferralEventType[] = [
  "SHARE",
  "LINK_CLICK",
  "LINE_JOIN",
  "LINE_ENTRY",
  "REGISTER",
  "BOOKING_CREATED",
  "BOOKING_COMPLETED",
] as const;

function optionalString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function parseInput(input: unknown): CreateReferralEventInput {
  if (!input || typeof input !== "object") {
    throw new AppError("VALIDATION", "事件參數格式錯誤");
  }
  const raw = input as Record<string, unknown>;
  const storeId = optionalString(raw.storeId) ?? "";
  if (!storeId) throw new AppError("VALIDATION", "storeId 為必填");

  const type = raw.type;
  if (
    typeof type !== "string" ||
    !VALID_EVENT_TYPES.includes(type as ReferralEventType)
  ) {
    throw new AppError("VALIDATION", "事件類型無效");
  }

  return {
    storeId,
    type: type as ReferralEventType,
    customerId: optionalString(raw.customerId),
    referrerId: optionalString(raw.referrerId),
    bookingId: optionalString(raw.bookingId),
    source: optionalString(raw.source)?.slice(0, 100) ?? null,
  };
}

function parseShareSource(input: unknown): string {
  if (!input || typeof input !== "object") return "share";
  const source = optionalString((input as Record<string, unknown>).source);
  return source?.slice(0, 100) ?? "share";
}

async function getActiveSessionCustomer(
  user: Awaited<ReturnType<typeof requireSession>>,
) {
  if (!user.customerId) return null;
  return prisma.customer.findFirst({
    where: {
      id: user.customerId,
      mergedIntoCustomerId: null,
    },
    select: { id: true, storeId: true },
  });
}

/**
 * Generic action 仍可供既有 authenticated callers 使用，但不再只相信 payload。
 * Customer 只能替自己的店與自己寫事件；員工只能寫 session 所屬店；ADMIN 可跨店。
 * 實體本身是否同店，另由 service 層共同驗證。
 */
async function assertActionCallerAccess(
  data: CreateReferralEventInput,
): Promise<void> {
  const user = await requireSession();
  if (user.role === "ADMIN") return;

  if (user.role === "CUSTOMER") {
    const customer = await getActiveSessionCustomer(user);
    if (!customer) throw new AppError("UNAUTHORIZED", "缺少有效顧客身份");
    if (customer.storeId !== data.storeId) {
      throw new AppError("FORBIDDEN", "不可寫入其他店舖的推薦事件");
    }
    if (data.customerId && data.customerId !== customer.id) {
      throw new AppError("FORBIDDEN", "不可替其他顧客寫入推薦事件");
    }
    if (data.referrerId && data.referrerId !== customer.id) {
      throw new AppError("FORBIDDEN", "不可替其他推薦人寫入推薦事件");
    }
    return;
  }

  if (!user.storeId || user.storeId !== data.storeId) {
    throw new AppError("FORBIDDEN", "不可寫入其他店舖的推薦事件");
  }
}

/** 回傳結果的 authenticated generic event action。 */
export async function recordReferralEvent(
  input: unknown,
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const data = parseInput(input);
    await assertActionCallerAccess(data);
    if (data.type === "SHARE") {
      await requireStoreFeature(data.storeId, FEATURES.REFERRAL_SHARE);
    }
    const event = await createReferralEvent(data);
    return { success: true, data: { eventId: event.id } };
  } catch (error) {
    return handleActionError(error);
  }
}

/** Fire-and-forget authenticated generic event action。 */
export async function trackReferralEvent(input: unknown): Promise<void> {
  try {
    const data = parseInput(input);
    await assertActionCallerAccess(data);
    if (data.type === "SHARE") {
      await requireStoreFeature(data.storeId, FEATURES.REFERRAL_SHARE);
    }
    await createReferralEvent(data);
  } catch {
    // 埋點失敗不影響主流程。
  }
}

/**
 * 顧客分享專用 action。
 *
 * Client 只傳非敏感 source；storeId / referrerId 完全由 session + DB canonical
 * Customer 取得，避免竄改 payload 造成跨店或替別人灌 SHARE 事件。
 */
export async function trackCurrentCustomerShare(input: unknown): Promise<void> {
  try {
    const user = await requireSession();
    if (user.role !== "CUSTOMER") return;

    const customer = await getActiveSessionCustomer(user);
    if (!customer) return;
    if (!(await hasStoreFeature(customer.storeId, FEATURES.REFERRAL_SHARE))) return;

    await createReferralEvent({
      storeId: customer.storeId,
      referrerId: customer.id,
      type: "SHARE",
      source: parseShareSource(input),
    });
  } catch {
    // 埋點失敗不影響複製或 LINE 分享。
  }
}
