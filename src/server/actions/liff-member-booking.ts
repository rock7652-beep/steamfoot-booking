"use server";

/**
 * submitLiffMemberBooking — LIFF 顧客「會員方案預約 / 使用剩餘堂數預約」 server action (PR-G2)
 *
 * 與既有 LIFF 體驗預約 `submitLiffTrialBooking` (PR-D1A) 共存不取代：
 *   - PR-D1A 對應 FIRST_TRIAL（新客 / 體驗）— 不扣堂、不傳 wallet
 *   - 本 action 對應 PACKAGE_SESSION（已購方案的會員）— 用剩餘堂數預約
 *
 * 設計合約（per PR-G1 audit + 拍板）：
 *   1. 嚴格 CUSTOMER role only（staff 後台仍用既有 createBooking）
 *   2. **零 client 參數**（除 bookingDate / slotTime）：
 *      - 不接受 customerId / storeId / walletId / servicePlanId / staffId
 *      - 全走 `requireSession` + `getCanonicalCustomerIdForSession` + `user.storeId`
 *   3. **不傳 customerPlanWalletId** 給 `createBooking`：
 *      - 依賴 `createBooking` 內建 FEFO 自動 selecting（booking.ts:289-307）
 *      - 排序：expiryDate ASC nulls last → createdAt ASC → id ASC
 *      - 顧客有多張 ACTIVE wallet 時 deterministic 選一張，無歧義
 *   4. **不 throw 給 caller** — 全部 status discriminated union
 *   5. read-only 對 wallet — 不創 wallet、不退錢、不付款
 *   6. **canonical safety pattern**：mirror submitLiffTrialBooking byte-for-byte
 *
 * **Dead-code 階段（PR-G2）**：本檔上 prod 時**無 UI caller**（PR-G3 才接 LIFF UI
 * 在 /liff/wallets 頁底加「立即預約」secondary button）。由 vitest 涵蓋全部 status
 * 分支，先驗 action 邏輯再 wire UI。
 *
 * 不在此 PR 範圍：
 *   - 不接 UI（PR-G3 才做 /liff/member-booking page + form）
 *   - 不接 payment / wallet purchase / 續約 / 延長 / 堂數調整
 *   - 不動 createBooking 本體（這是 web / staff / LIFF 共用的 SoT）
 *   - 不動 schema / migration / Wallet / WalletSession model
 *
 * 副作用（由 `createBooking` 內建處理，本檔不直接觸發）：
 *   ✅ Booking insert (status: PENDING, type: PACKAGE_SESSION)
 *   ✅ WalletSession AVAILABLE → RESERVED (atomic in $transaction)
 *   ✅ wallet.remainingSessions refresh
 *   ❌ NO Transaction / NO Cashbook / NO LINE push / NO MessageLog
 */

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";
import { createBooking } from "@/server/actions/booking";

const InputSchema = z.object({
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date_format"),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/, "invalid_slot_format"),
});

export type SubmitLiffMemberBookingInput = z.infer<typeof InputSchema>;

/**
 * 結果 enum — 顧客語言；不直接暴露 createBooking 內部 AppError 訊息。
 * PR-G3 將這些 status 對應到 liffMessages.memberBooking.* 文案（PR-G3 才設）。
 */
export type SubmitLiffMemberBookingResult =
  | {
      status: "ok";
      bookingId: string;
      bookingDate: string;
      slotTime: string;
    }
  | {
      status: "invalid_input";
      field: "bookingDate" | "slotTime";
    }
  | { status: "no_customer" }
  | { status: "no_wallet_available" }
  | { status: "wallet_expired" }
  | { status: "insufficient_sessions" }
  | { status: "slot_full" }
  | { status: "slot_unavailable" }
  | { status: "booking_limit_reached" }
  | { status: "service_unavailable" };

export async function submitLiffMemberBooking(
  input: SubmitLiffMemberBookingInput,
): Promise<SubmitLiffMemberBookingResult> {
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
    // Staff 用既有 createBooking 後台流程；本 action 嚴格只服務 LIFF 顧客
    return { status: "no_customer" };
  }

  // ── 3. Resolve canonical customer + store ──────────
  // 不信任 session.customerId（可能 stale；同 PR-D1A / D2 / D4A / E2 設計）
  const customerId = await getCanonicalCustomerIdForSession(user);
  if (!customerId) {
    return { status: "no_customer" };
  }
  const storeId = user.storeId;
  if (!storeId) {
    return { status: "no_customer" };
  }

  // ── 4. Delegate to createBooking with PACKAGE_SESSION ─
  //
  // createBooking 內部會：
  //   - 重做 requireSession（同 session OK；雙保險）
  //   - 對 CUSTOMER role override `effectiveCustomerId = canonical` (booking.ts:170-181)
  //   - 跑 PACKAGE_SESSION 必要驗證 (booking.ts:242-308)：
  //       * 至少一張 wallet remainingSessions > 0
  //       * 至少一張 wallet expiryDate >= bookingDate（或無期限）
  //       * 人數 ≤ totalRemaining
  //       * 自動 FEFO 選 wallet（顧客不傳 walletId）
  //   - 跑 slot / 時段 / 容量 / duty / 過去日期 / bookable window 等檢查
  //   - tx 內 booking insert + WalletSession allocateSession + refreshWalletCounter（atomic）
  //   - 對 CUSTOMER 跳過 assertStoreAccess（已用 canonical override）
  //   - 不寫 Transaction / Cashbook / Wallet purchase（PACKAGE_SESSION booking 純扣堂語意）
  //
  // 我們**不傳** customerPlanWalletId / servicePlanId / isMakeup / makeupCreditId / expectedAmount —
  // FEFO 由 server 自動選；其他欄位 createBooking 有合理 default。
  const result = await createBooking({
    customerId,
    bookingDate,
    slotTime,
    bookingType: "PACKAGE_SESSION",
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
 * ⚠️ TODO（技術債紀錄，同 PR-D1A / D4A-1 mapCancelBookingErrorToStatus）：
 *   這是 **soft contract** — 用中文訊息 regex match `AppError.message`。
 *   `src/server/actions/booking.ts` 是 prod 熱路徑，若有人改文案（例如
 *   「找不到可用方案」改成「無可用方案」），本 mapping 會 silent miss →
 *   unmapped error 落到 `service_unavailable` + console.warn → 顧客看到的會
 *   是「服務暫時無法使用」這個太籠統的訊息。
 *
 *   長期解（**不在 PR-G2 範圍**）：
 *     1. booking.ts 改丟 typed `BookingError` + code
 *     2. 所有 booking error 統一 enum，code 即為 mapping key
 *     3. 既有 staff 路徑（後台 / customer web）也統一拿 code 顯示
 *
 *   短期：本 PR 接受 regex mapping；測試已覆蓋 createBooking 當前 PACKAGE_SESSION
 *   錯誤訊息 pattern。若觀察期 (PR-G3+) 出現大量 `service_unavailable` 而 console.warn
 *   有 unmapped messages，代表 booking.ts 文案已 drift → 開 follow-up PR 同步
 *   regex（或直接做 long-term 解）。
 *
 *   Reviewer 注意：本檔的 regex 必須與 src/server/actions/booking.ts 的 AppError
 *   message 字串一致。修任何一邊都要同步另一邊；vitest 的 it.each 表是 truth source。
 */
function mapCreateBookingErrorToStatus(
  errorMsg: string | undefined,
  ctx: { customerId: string; storeId: string },
): SubmitLiffMemberBookingResult {
  const msg = errorMsg ?? "";

  // ── Wallet-specific (PACKAGE_SESSION 專屬) ──
  // booking.ts:250 「目前沒有可使用的方案，請先購買課程方案或聯繫店家協助」(CUSTOMER role)
  // booking.ts:251 「此顧客目前沒有可用方案，請先指派或購買方案後再建立預約」(STAFF/ADMIN role — 防禦性 catch)
  // booking.ts:302 「找不到可用方案，請先指派或購買方案後再建立預約」(FEFO fallback)
  if (/沒有可(使用的|用)方案|找不到可用方案/.test(msg)) {
    return { status: "no_wallet_available" };
  }
  // booking.ts:272 「票券期限不足，方案有效期限至 YYYY-MM-DD，請選擇期限內日期」
  // booking.ts:273 「方案已超過可使用期限，請聯繫店家協助」
  if (/票券期限不足|方案已超過可使用期限/.test(msg)) {
    return { status: "wallet_expired" };
  }
  // booking.ts:285 「方案次數不足，無法預約 X 人。目前可使用次數僅剩 Y 次...」
  if (/方案次數不足/.test(msg)) {
    return { status: "insufficient_sessions" };
  }

  // ── General booking errors (mirror submitLiffTrialBooking mapping) ──
  if (/體驗版預約上限|月度預約/.test(msg)) {
    return { status: "booking_limit_reached" };
  }
  if (/已額滿|該時段剩餘/.test(msg)) {
    return { status: "slot_full" };
  }
  if (
    /公休|進修|時段已被手動關閉|尚無值班人員|不是有效時段|不可預約過去|已過時段|次月預約時段尚未開放/.test(
      msg,
    )
  ) {
    return { status: "slot_unavailable" };
  }
  // booking.ts:174 「找不到您的顧客資料，請重新登入後再試」(內部 canonical 解析失敗)
  // booking.ts:190 「顧客不存在」
  if (/顧客不存在|找不到您的顧客資料/.test(msg)) {
    return { status: "no_customer" };
  }

  console.warn("[submitLiffMemberBooking] unmapped createBooking error", {
    error: msg,
    ...ctx,
  });
  return { status: "service_unavailable" };
}
