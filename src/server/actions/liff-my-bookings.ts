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

import { prisma } from "@/lib/db";
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
  /** 服務店長 displayName；null → client 不顯示整行（不 fallback「未指派」）*/
  staffName: string | null;
}

export type FetchLiffBookingsResult =
  | { status: "ok"; upcoming: LiffBookingRow[]; history: LiffBookingRow[] }
  | { status: "no_customer" }
  | { status: "service_unavailable" };

/**
 * 待到店狀態集合 — 與 `src/lib/booking-constants.ts` PENDING_STATUSES 同集合。
 * 刻意不 import 避免 client bundle 拖入整個 constants 檔（含 date-utils）。
 */
const PENDING_BOOKING_STATUSES: readonly string[] = ["PENDING", "CONFIRMED"];

/**
 * 純函數：把 booking list 分成 upcoming / history。
 *
 *   upcoming = PENDING/CONFIRMED 且 (date+slotTime) 尚未過
 *   history  = 其餘（COMPLETED / NO_SHOW / CANCELLED / 已過期的 PENDING）
 *
 * 抽出來純函數的理由：
 *   - 跟 web `/my-bookings` 的 filter 同義；未來想統一可再合併
 *   - 可在 vitest 注入 `nowMs` 不依賴系統時鐘
 *
 * 輸入泛型只要求 booking 有 date / slotTime / status — call site 用 Prisma
 * SelectInput 推出的具體型別 implicitly satisfy。
 */
export function splitLiffBookings<
  T extends { bookingDate: Date; slotTime: string; bookingStatus: string },
>(bookings: T[], nowMs: number = Date.now()): { upcoming: T[]; history: T[] } {
  const upcoming: T[] = [];
  const history: T[] = [];
  for (const b of bookings) {
    const isPending = PENDING_BOOKING_STATUSES.includes(b.bookingStatus);
    const past = bookingMomentMs(b.bookingDate, b.slotTime) < nowMs;
    if (isPending && !past) upcoming.push(b);
    else history.push(b);
  }
  return { upcoming, history };
}

/**
 * Booking 的「實際發生時刻」毫秒值（Asia/Taipei +08:00）。
 * bookingDate 為 DB Date 欄位（UTC midnight），slotTime 為 "HH:mm" 台灣時間。
 */
function bookingMomentMs(bookingDate: Date, slotTime: string): number {
  const dateStr = bookingDate.toISOString().slice(0, 10);
  const [h, m] = slotTime.split(":").map(Number);
  return new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`,
  ).getTime();
}

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

  // ── 3. Query — tight LIFF payload ──────────────────
  //
  // 排序 bookingDate DESC + slotTime ASC：
  //   take:50 拿到最近 50 筆（往未來/往過去都涵蓋），讓 splitLiffBookings 分群。
  //   upcoming 之後 reverse → 顯示「最近一筆在最上面」。
  let rawBookings: Array<{
    id: string;
    bookingDate: Date;
    slotTime: string;
    bookingStatus: string;
    bookingType: string;
    isMakeup: boolean;
    revenueStaff: { displayName: string } | null;
  }>;
  try {
    rawBookings = await prisma.booking.findMany({
      where: { customerId, storeId },
      select: {
        id: true,
        bookingDate: true,
        slotTime: true,
        bookingStatus: true,
        bookingType: true,
        isMakeup: true,
        revenueStaff: { select: { displayName: true } },
      },
      orderBy: [{ bookingDate: "desc" }, { slotTime: "asc" }],
      take: 50,
    });
  } catch (err) {
    console.error("[fetchLiffBookings] query failed", err);
    return { status: "service_unavailable" };
  }

  // ── 4. Split before serialization (need Date) ──────
  const { upcoming, history } = splitLiffBookings(rawBookings);
  // upcoming DESC → ASC（最近一筆在最上面；DB 是 DESC 故 reverse）
  upcoming.reverse();

  const toRow = (b: (typeof rawBookings)[number]): LiffBookingRow => ({
    id: b.id,
    bookingDate: b.bookingDate.toISOString().slice(0, 10),
    slotTime: b.slotTime,
    bookingStatus: b.bookingStatus,
    bookingType: b.bookingType,
    isMakeup: b.isMakeup,
    staffName: b.revenueStaff?.displayName ?? null,
  });

  return {
    status: "ok",
    upcoming: upcoming.map(toRow),
    history: history.map(toRow),
  };
}
