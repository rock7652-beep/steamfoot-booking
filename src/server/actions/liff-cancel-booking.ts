"use server";

/**
 * cancelLiffBooking — LIFF 顧客自助取消預約 server action (PR-D4A-1, dead code)
 *
 * 設計：**thin wrapper** 包既有 `cancelBooking()`。理由（per PR-D4A audit）：
 *   - cancelBooking 在 src/server/actions/booking.ts:605 已經包含完整邏輯：
 *       • requireSession + canonical customer + assertStoreAccess
 *       • 12h cutoff（CUSTOMER role 限定）
 *       • status guard（拒 COMPLETED / CANCELLED）
 *       • tx: status flip + makeup credit release + session release
 *       • revalidate
 *       • **完全 financially neutral** — 不碰 Transaction / Wallet / Cashbook / CashDrawer
 *   - 重做一份等於 logic drift 風險 +1（web 改了忘了同步 LIFF）
 *   - 同 web `/my-bookings/[id]/cancel/page.tsx` 也是直接呼 `cancelBooking()`
 *
 * 本 wrapper 的職責 = 兩件事：
 *   1. 提前 gate `role === "CUSTOMER"`（staff 不該透過 LIFF action 取消）
 *   2. AppError 中文 message → LIFF customer-facing status enum（discriminated union）
 *
 * 不在此 PR 範圍（per PR-D4A 拍板）：
 *   - 不接 UI（D4A-2 才做，依賴 PR-D2 merge）
 *   - 不退款 / 不退堂 / 不退 cashbook / 不動 CashDrawer
 *   - 不做 reschedule / waitlist / 復原 / 取消次數限制 / 取消原因捕捉
 *   - 不動 schema / migration / Booking model
 *   - 不動 cancelBooking 本體（這是 SoT；任何邏輯改動由 web 入口主導）
 *
 * **Dead-code 階段（D4A-1）**：本檔上 prod 時無 UI caller（D4A-2 才 wire 至
 * bookings-list card）。由 vitest 涵蓋全部 status 分支，先驗 action 邏輯再 wire UI。
 */

import { z } from "zod";
import { requireSession } from "@/lib/session";
import { cancelBooking } from "@/server/actions/booking";

const InputSchema = z.object({
  bookingId: z.string().min(1, "invalid_booking_id"),
});

export type CancelLiffBookingInput = z.infer<typeof InputSchema>;

/**
 * 結果 enum — 顧客語言；不直接暴露 cancelBooking 內部 AppError 訊息。
 * D4A-2 將這些 status 對應到 liffMessages.cancelBooking.* 文案。
 */
export type CancelLiffBookingResult =
  | { status: "ok" }
  | { status: "invalid_input" }
  | { status: "no_customer" }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "cutoff_breach" }
  | { status: "status_blocked" }
  | { status: "service_unavailable" };

export async function cancelLiffBooking(
  input: CancelLiffBookingInput,
): Promise<CancelLiffBookingResult> {
  // ── 1. Validate input shape ────────────────────────
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid_input" };
  const { bookingId } = parsed.data;

  // ── 2. Require CUSTOMER session ────────────────────
  // 不放心 cancelBooking 內部會擋（它對 staff 也允許 — 是 staff 後台入口）；
  // LIFF action 嚴格只服務顧客，先 pre-gate。
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_customer" };
  }
  if (user.role !== "CUSTOMER") return { status: "no_customer" };

  // ── 3. Delegate to cancelBooking ───────────────────
  //
  // cancelBooking 內部會（同 session、cheap）：
  //   - requireSession 再做一次
  //   - 用 canonical resolver 比對 booking.customerId（不信 stale session.customerId）
  //   - assertStoreAccess(user, booking.storeId)（cross-store 也擋）
  //   - 12h cutoff（CUSTOMER role）
  //   - status guard
  //   - tx + revalidate
  //
  // 我們只負責把 AppError 訊息 map 成 LIFF status。
  // 與 web `/my-bookings/[id]/cancel` 同步使用 "顧客自行取消" 來源標籤。
  const result = await cancelBooking(bookingId, "顧客自行取消");

  if (result.success) return { status: "ok" };

  return mapCancelBookingErrorToStatus(result.error, {
    bookingId,
    userId: user.id,
  });
}

/**
 * 把 cancelBooking 的中文錯誤訊息 map 到顧客面 status。
 *
 * ⚠️ TODO（技術債紀錄）：
 *   這是 **soft contract** — 用中文訊息 regex match `AppError.message`。
 *   `src/server/actions/booking.ts` 的 cancelBooking 是 prod 熱路徑（web 也用），
 *   若有人改文案（例如「預約不存在」改成「找不到此預約」），本 mapping 會 silent
 *   miss → unmapped error 落到 `service_unavailable` + console.warn → 顧客看到的
 *   會是「服務暫時無法使用」這個太籠統的訊息。
 *
 *   長期解（**不在 D4A-1 範圍**）：
 *     1. cancelBooking 改丟 typed `BookingError` + code
 *     2. 所有 cancel error 統一 enum，code 即為 mapping key
 *     3. web /my-bookings/[id]/cancel 與 LIFF 都統一拿 code 顯示
 *
 *   短期：本 PR 接受 regex mapping；測試已覆蓋 cancelBooking 當前 5 條 AppError
 *   pattern（NOT_FOUND / BUSINESS_RULE COMPLETED / VALIDATION CANCELLED /
 *   FORBIDDEN 非本人 / FORBIDDEN 跨店 / BUSINESS_RULE 12h cutoff）。若觀察期
 *   出現大量 `service_unavailable` 且 console.warn 有 unmapped messages，
 *   代表 cancelBooking 文案 drift → 開 follow-up PR 同步 regex（或做長期解）。
 *
 *   Reviewer 注意：本檔的 regex 必須與 src/server/actions/booking.ts 的 AppError
 *   message 字串一致。修任何一邊都要同步另一邊；vitest 的 it.each 表是 truth source。
 */
function mapCancelBookingErrorToStatus(
  errorMsg: string | undefined,
  ctx: { bookingId: string; userId: string },
): CancelLiffBookingResult {
  const msg = errorMsg ?? "";

  if (/預約不存在/.test(msg)) {
    return { status: "not_found" };
  }
  if (/已出席的預約無法取消|預約已取消/.test(msg)) {
    return { status: "status_blocked" };
  }
  if (/只能取消自己的預約|無權存取其他店舖/.test(msg)) {
    return { status: "forbidden" };
  }
  // 開課前 12 小時內無法自行取消，請直接聯繫店家
  if (/開課前.*小時.*無法.*取消/.test(msg)) {
    return { status: "cutoff_breach" };
  }

  console.warn("[cancelLiffBooking] unmapped cancelBooking error", {
    error: msg,
    ...ctx,
  });
  return { status: "service_unavailable" };
}
