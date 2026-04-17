"use server";

/**
 * Referral Event Actions
 *
 * 提供給頁面 / client 端安全呼叫的 server action 入口。
 *
 * 兩種入口：
 * - recordReferralEvent: 回傳 ActionResult，出錯時呼叫端可處理
 * - trackReferralEvent: fire-and-forget，出錯時靜默失敗（tracking pixel / share button 等場景）
 *
 * 不會修改其他 business logic（booking / register / line-entry / share-referral）。
 */

import { AppError, handleActionError } from "@/lib/errors";
import {
  createReferralEvent,
  type CreateReferralEventInput,
} from "@/server/services/referral-events";
import type { ActionResult } from "@/types";
import type { ReferralEventType } from "@prisma/client";

// ============================================================
// Input validation
// ============================================================

const VALID_EVENT_TYPES: readonly ReferralEventType[] = [
  "SHARE",
  "LINK_CLICK",
  "LINE_JOIN",
  "LINE_ENTRY",
  "REGISTER",
  "BOOKING_CREATED",
  "BOOKING_COMPLETED",
] as const;

function parseInput(input: unknown): CreateReferralEventInput {
  if (!input || typeof input !== "object") {
    throw new AppError("VALIDATION", "事件參數格式錯誤");
  }
  const raw = input as Record<string, unknown>;

  const storeId = typeof raw.storeId === "string" ? raw.storeId.trim() : "";
  if (!storeId) {
    throw new AppError("VALIDATION", "storeId 為必填");
  }

  const type = raw.type;
  if (
    typeof type !== "string" ||
    !VALID_EVENT_TYPES.includes(type as ReferralEventType)
  ) {
    throw new AppError("VALIDATION", "事件類型無效");
  }

  const customerId =
    typeof raw.customerId === "string" && raw.customerId.trim()
      ? raw.customerId.trim()
      : null;
  const referrerId =
    typeof raw.referrerId === "string" && raw.referrerId.trim()
      ? raw.referrerId.trim()
      : null;
  const bookingId =
    typeof raw.bookingId === "string" && raw.bookingId.trim()
      ? raw.bookingId.trim()
      : null;
  const source =
    typeof raw.source === "string" && raw.source.trim()
      ? raw.source.trim()
      : null;

  return {
    storeId,
    type: type as ReferralEventType,
    customerId,
    referrerId,
    bookingId,
    source,
  };
}

// ============================================================
// Action: recordReferralEvent — 回傳 ActionResult 版本
// ============================================================

/**
 * 寫入 ReferralEvent，回傳 ActionResult。
 * 適合需要感知寫入成功/失敗的場景（例如表單提交後的成功訊息）。
 */
export async function recordReferralEvent(
  input: unknown,
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const data = parseInput(input);
    const event = await createReferralEvent(data);
    return { success: true, data: { eventId: event.id } };
  } catch (e) {
    return handleActionError(e);
  }
}

// ============================================================
// Action: trackReferralEvent — fire-and-forget 版本
// ============================================================

/**
 * 輕量入口：寫入 ReferralEvent，出錯時靜默失敗。
 *
 * 適合以下場景（追蹤失敗不影響主流程）：
 * - 分享按鈕點擊
 * - 連結導流落地頁
 * - LIFF / LINE Entry 埋點
 *
 * 注意：呼叫端可直接 await 或丟棄 Promise；不會 throw。
 */
export async function trackReferralEvent(input: unknown): Promise<void> {
  try {
    const data = parseInput(input);
    await createReferralEvent(data);
  } catch {
    // fire-and-forget：埋點失敗不影響主流程
  }
}
