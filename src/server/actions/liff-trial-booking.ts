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
import { getCustomerBookingEligibility } from "@/lib/customer-booking-eligibility";
import { ensureTrialPlan } from "@/server/services/trial-plan";
import { getTrialSettings } from "@/lib/shop-config";
import { createBooking } from "@/server/actions/booking";
import { isStoreSubscriptionWriteBlocked } from "@/lib/subscription-guard";
import { bookingSubmissionRequestKeySchema } from "@/lib/validators/booking-submission";
import { bookingSubmissionExists } from "@/server/services/booking-submission";

const InputSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date_format"),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/, "invalid_slot_format"),
  requestKey: bookingSubmissionRequestKeySchema.optional(),
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
  | { status: "profile_incomplete" }
  | { status: "slot_full" }
  | { status: "slot_unavailable" }
  | { status: "booking_limit_reached" }
  // #305：本店訂閱到期 → 暫時無法建立新預約。
  | { status: "store_subscription_expired" }
  | { status: "idempotency_key_reused" }
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
  const { bookingDate, slotTime, requestKey } = parsed.data;

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
  const eligibility = await getCustomerBookingEligibility(user);
  if (eligibility.status === "no_customer") return { status: "no_customer" };
  if (eligibility.status === "profile_incomplete") return { status: "profile_incomplete" };
  const { customerId, storeId } = eligibility;

  // ── 3.5 訂閱到期保護：到期店家顧客不可新增體驗預約 ──
  if (await isStoreSubscriptionWriteBlocked(storeId)) {
    return { status: "store_subscription_expired" };
  }

  // A keyed retry must reach createBooking before the duplicate-trial guard.
  // createBooking remains the source of truth for payload-hash validation and
  // snapshot replay; this existence check never returns replay data itself.
  if (requestKey) {
    try {
      if (await bookingSubmissionExists({ storeId, requestKey })) {
        const settings = await getTrialSettings(storeId);
        const trialPlan = await ensureTrialPlan(storeId, settings.trialDefaultPrice);
        const replay = await createBooking({
          customerId,
          bookingDate,
          slotTime,
          bookingType: "FIRST_TRIAL",
          servicePlanId: trialPlan.id,
        }, {
          requestKey,
          source: "liff-trial",
        });
        if (!replay.success) {
          return mapCreateBookingErrorToStatus(replay.error, { customerId, storeId });
        }
        return {
          status: "ok",
          bookingId: replay.data.bookingId,
          bookingDate,
          slotTime,
        };
      }
    } catch (err) {
      console.error("[submitLiffTrialBooking] submission preflight failed", err);
      return { status: "service_unavailable" };
    }
  }

  // ── 5. Duplicate FIRST_TRIAL check ─────────────────
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

  // ── 5.5 Resolve trial plan (idempotent) ────────────
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

  const bookingInput = {
    customerId,
    bookingDate,
    slotTime,
    bookingType: "FIRST_TRIAL" as const,
    servicePlanId: trialPlanId,
  };

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
  const result = requestKey
    ? await createBooking(bookingInput, { requestKey, source: "liff-trial" })
    : await createBooking(bookingInput);

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
 * ⚠️ TODO (技術債紀錄)：
 *   這是 **soft contract** — 用中文訊息 regex match `AppError` 的 message field。
 *   `src/server/actions/booking.ts` 是 prod 熱路徑，若有人改文案（例如
 *   「該時段已額滿」改成「該時間不可使用」），本 mapping 會 silent miss →
 *   unmapped error 落到 `service_unavailable` + console.warn → 顧客看到的會
 *   是「服務暫時無法使用」這個太籠統的訊息。
 *
 *   長期解（**不在 PR-D1A 範圍**，避免動 production 熱路徑）：
 *     1. booking.ts 改丟 typed error：`new BookingError("SLOT_UNAVAILABLE", ...)`
 *     2. 所有 booking error 統一 enum，code 即為 mapping key
 *     3. 既有 staff 路徑（後台 / `createTrialBooking`）也統一拿 code 顯示
 *
 *   短期：本 PR 接受 regex mapping；測試已覆蓋當前 11 條 createBooking 錯誤訊息
 *   pattern。若觀察期 (PR-D1B+) 出現大量 `service_unavailable` 而 console.warn
 *   有 unmapped messages，代表 booking.ts 文案已 drift → 開 follow-up PR 同步
 *   regex（或直接做 long-term 解）。
 *
 *   Reviewer 注意：本檔的 regex 必須與 src/server/actions/booking.ts 的 AppError
 *   message 字串一致。修任何一邊都要同步另一邊；vitest 的 it.each 表是 truth source。
 */
function mapCreateBookingErrorToStatus(
  errorMsg: string | undefined,
  ctx: { customerId: string; storeId: string }
): SubmitLiffTrialBookingResult {
  const msg = errorMsg ?? "";

  if (/IDEMPOTENCY_KEY_REUSED/.test(msg)) {
    return { status: "idempotency_key_reused" };
  }

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
