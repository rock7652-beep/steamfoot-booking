"use server";

/**
 * fetchLiffBookings — LIFF 顧客「我的預約」server action (PR-D2)
 *
 * 與既有 staff-facing `listBookings` (`src/server/queries/booking.ts`) **共存不取代**：
 *   - `listBookings` 服務 staff dashboard + customer 桌面 web 共用；payload 偏胖
 *   - 本 action 是 LIFF-only read-only 投影：tight payload、固定排序、固定分群
 *
 * 設計合約（per PR-D2 audit §7 + §10 拍板）：
 *   1. 嚴格 CUSTOMER role only（staff 不該透過 LIFF 看自己無關的預約清單）
 *   2. 不接受 client 傳 customerId / storeId — 全走 `requireSession` +
 *      `getCanonicalCustomerIdForSession`；同 PR-D1A 設計
 *   3. storeId 從 `user.storeId`（LIFF onboarding 寫入），不從 URL slug 信
 *   4. **不 throw 給 caller** — 全部 status discriminated union
 *   5. 不查 Transaction / 不顯示金額 / 不顯示付款狀態（PR-D2 不做；D4 視情況加）
 *   6. 不寫任何 DB；不呼叫 createBooking / collectTrialPayment
 *
 * 不在此 PR 範圍：
 *   - 不接 cancel / reschedule（PR-D4）
 *   - 不接 push reminder
 *   - 不動 schema / migration / Booking model
 *   - 不動 listBookings include shape（避免污染 staff 路徑）
 */

import { readFetchLiffBookings } from "@/server/queries/liff-my-bookings";
import { requireSession } from "@/lib/session";
import { getCanonicalCustomerIdForSession } from "@/lib/customer-identity";

/** LIFF「我的預約」單筆 row 顯示用 payload — 刻意精簡。 */
export interface LiffBookingRow {
  id: string;
  /** "YYYY-MM-DD"（Date → string 在 server 邊界序列化）*/
  bookingDate: string;
  /** "HH:mm" */
  slotTime: string;
  /** BookingStatus 原值；client 端 STATUS_LABEL 翻譯 */
  bookingStatus: string;
  /** BookingType 原值；client 端 mapping 翻譯（isMakeup 優先）*/
  bookingType: string;
  isMakeup: boolean;
  /** 預約人數；首頁方案摘要以所有未來預約人數加總。 */
  people: number;
  /** SPA-only display fields. Legacy rows intentionally omit them. */
  endTime?: string;
  serviceName?: string;
  staffName?: string;
  locationName?: string;
}

export type FetchLiffBookingsResult =
  | { status: "ok"; upcoming: LiffBookingRow[]; history: LiffBookingRow[] }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

// 註：`splitLiffBookings` pure helper 在 `src/lib/liff/my-bookings.ts`。
// "use server" 檔不能 export 非 async function（Next build 會 fail），故拆出去。

export async function fetchLiffBookings(): Promise<FetchLiffBookingsResult> {
  // ── 1. Require CUSTOMER session ────────────────────
  let user;
  try {
    user = await requireSession();
  } catch {
    return { status: "no_customer" };
  }
  if (user.role !== "CUSTOMER") return { status: "no_customer" };

  // ── 2. Resolve canonical customer + store ──────────
  // 不信任 session.customerId（可能 stale；同 PR-D1A 設計）。
  const customerId = await getCanonicalCustomerIdForSession(user);
  if (!customerId) return { status: "no_customer" };
  const storeId = user.storeId;
  if (!storeId) return { status: "no_customer" };

  return readFetchLiffBookings({ storeId, customerId });
}
