"use server";

/**
 * submitLiffTrialBooking — LIFF 顧客自助體驗預約 server action (PR-D1A)
 *
 * 與既有 staff-only `createTrialBooking` (`src/server/actions/trial-booking.ts`) **共存不取代**：
 *   - staff 版用 `trial.create` permission，強制 `assignedStaffId`，會 ensure customer
 *   - 本版用 `requireSession()` CUSTOMER only，**不指派 staff**，依賴 LIFF 顧客已 onboarding
 *     完成（PR-C2 流程，已綁 Customer + lineUserId + userId）
 *
 * **dead-code 階段（PR-D1A）**：本檔上 prod 時**無 caller wire**（PR-D1B 才接 LIFF UI）。
 * 由 vitest 涵蓋全部 status 分支，先驗 action 邏輯再 wire UI。
 *
 * 設計合約（per PR-D1 audit §14 拍板）：
 *   1. 顧客已有 PENDING/CONFIRMED FIRST_TRIAL → reject `already_has_trial`（不改約 / 不取消）
 *   2. 不傳 `expectedAmount`（Booking.expectedAmount = null；金額在 staff 收款時才成立）
 *   3. 不傳 `customerPlanWalletId`（FIRST_TRIAL 不扣堂）
 *   4. 不寫 `Customer.assignedStaffId`（staff 收款時自然成為 revenueStaffId fallback）
 *   5. 嚴格 CUSTOMER only（staff 用既有 createTrialBooking）
 *   6. **不 throw 給 caller** — 全部 status discriminated union
 *
 * 不在此 PR 範圍：
 *   - 不接 UI（PR-D1B）
 *   - 不接收款 / 取消 / 改約（PR-D 後續 / PR-D4）
 *   - 不動 createBooking / trial-booking.ts / slots.ts / messages.ts / schema
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";
import { ensureTrialPlan } from "@/server/services/trial-plan";
import { getTrialSettings } from "@/lib/shop-config";
import { createBooking } from "@/server/actions/booking";

const InputSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date_format"),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/, "invalid_slot_format"),
});

export type SubmitLiffTrialBookingInput = z.infer<typeof InputSchema>;

/**
 * 結果 enum — 顧客語言；不直接暴露 createBooking 內部錯誤訊息。
 * PR-D1B 將這些 status 對應到 liffMessages.trialBooking.* 文案。
 */
export type SubmitLiffTrialBookingResult =
  | {
      status: "ok";
      bookingId: string;
      bookingDate: string;
      slotTime: string;
    }
  | {
      status: "already_has_trial";
      existingBookingId: string;
      existingBookingDate: string;
      existingSlotTime: string;
    }
  | {
      status: "invalid_input";
      field: "bookingDate" | "slotTime";
    }
  | { status: "no_customer" }
  | { status: "slot_full" }
  | { status: "slot_unavailable" }
  | { status: "booking_limit_reached" }
  | { status: "service_unavailable" };

export async function submitLiffTrialBooking(
  input: SubmitLiffTrialBookingInput
): Promise<SubmitLiffTrialBookingResult> {
  // ── 1. Validate input shape ────────────────────────
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return {
      status: "invalid_input",
      field: field === "slotTime" ? "slotTime" : "bookingDate",
    };
  }
  const { bookingDate, slotTime } = parsed.data;

  // ── 2. Require CUSTOMER session ────────────────────
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_customer" };
  }
  if (user.role !== "CUSTOMER") {
    // Staff 用既有 createTrialBooking；本 action 嚴格只服務 LIFF 顧客
    return { status: "no_customer" };
  }

  // ── 3. Resolve canonical customer ──────────────────
  const customerId = await getCanonicalCustomerIdForSession(user);
  if (!customerId) {
    return { status: "no_customer" };
  }
  const storeId = user.storeId;
  if (!storeId) {
    return { status: "no_customer" };
  }

  // ── 4. Duplicate FIRST_TRIAL check ─────────────────
  //
  // 商業規則 (PR-D1A patch 拍板, "A2 規則")：
  //   - PENDING / CONFIRMED → 擋（避免同顧客同時開兩張體驗單）
  //   - COMPLETED           → 擋（已實際體驗過，不應自助再預約 first trial；
  //                            特殊情況由店家後台 createTrialBooking 處理）
  //   - CANCELLED / NO_SHOW → **不擋**（沒有真正完成體驗，給顧客再次預約機會）
  //
  // 語意：FIRST_TRIAL 是「第一次體驗」，COMPLETED 後就應該轉購買方案或單次預約，
  // 不該再走自助體驗路徑。但取消或失約沒實際體驗，避免太硬，允許重來。
  try {
    const existing = await prisma.booking.findFirst({
      where: {
        customerId,
        bookingType: "FIRST_TRIAL",
        bookingStatus: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      },
      select: { id: true, bookingDate: true, slotTime: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        status: "already_has_trial",
        existingBookingId: existing.id,
        existingBookingDate: existing.bookingDate.toISOString().slice(0, 10),
        existingSlotTime: existing.slotTime,
      };
    }
  } catch (err) {
    console.error("[submitLiffTrialBooking] duplicate check failed", err);
    return { status: "service_unavailable" };
  }

  // ── 5. Resolve trial plan (idempotent) ─────────────
  let trialPlanId: string;
  try {
    const settings = await getTrialSettings(storeId);
    if (!settings.trialEnabled) {
      // 店家暫停體驗服務 → 顧客面歸入 slot_unavailable
      return { status: "slot_unavailable" };
    }
    const trialPlan = await ensureTrialPlan(storeId, settings.trialDefaultPrice);
    trialPlanId = trialPlan.id;
  } catch (err) {
    console.error("[submitLiffTrialBooking] trial plan resolve failed", err);
    return { status: "service_unavailable" };
  }

  // ── 6. Delegate to createBooking ───────────────────
  //
  // createBooking 內部會：
  //   - re-do requireSession (同 session OK)
  //   - 對 CUSTOMER role 用 getCanonicalCustomerIdForSession 再 override customerId（雙保險）
  //   - 跑營業日 / slot override / 容量 / duty / 過去日期 / bookable window 等檢查
  //   - 對 FIRST_TRIAL 跳過 PACKAGE_SESSION 的 wallet 檢查
  //   - 對 CUSTOMER 跳過 assertStoreAccess
  //   - 不寫 transaction / wallet / cashbook
  //
  // 我們不傳 expectedAmount / customerPlanWalletId / isMakeup / makeupCreditId。
  const result = await createBooking({
    customerId,
    bookingDate,
    slotTime,
    bookingType: "FIRST_TRIAL",
    servicePlanId: trialPlanId,
  });

  if (!result.success) {
    return mapCreateBookingErrorToStatus(result.error, { customerId, storeId });
  }

  return {
    status: "ok",
    bookingId: result.data.bookingId,
    bookingDate,
    slotTime,
  };
}

/**
 * 把 createBooking 的中文錯誤訊息 map 到顧客面 status。
 *
 * 注意：createBooking 是 prod 熱路徑、訊息可能會被改。本 mapping 必須對既有
 * 字串 pattern 做 inclusive match；mapping 失敗一律 fallback `service_unavailable`
 * 並 console.warn 留 audit log，PR-D1B UI 會引導顧客「請聯繫店家」。
 */
function mapCreateBookingErrorToStatus(
  errorMsg: string | undefined,
  ctx: { customerId: string; storeId: string }
): SubmitLiffTrialBookingResult {
  const msg = errorMsg ?? "";

  if (/體驗版預約上限|月度預約/.test(msg)) {
    return { status: "booking_limit_reached" };
  }
  if (/已額滿|該時段剩餘/.test(msg)) {
    return { status: "slot_full" };
  }
  if (
    /公休|進修|時段已被手動關閉|尚無值班人員|不是有效時段|不可預約過去|已過時段|次月預約時段尚未開放/.test(
      msg
    )
  ) {
    return { status: "slot_unavailable" };
  }
  if (/顧客不存在/.test(msg)) {
    return { status: "no_customer" };
  }

  console.warn("[submitLiffTrialBooking] unmapped createBooking error", {
    error: msg,
    ...ctx,
  });
  return { status: "service_unavailable" };
}
