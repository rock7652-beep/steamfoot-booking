/**
 * LIFF 我的預約 — pure helpers (PR-D2)
 *
 * 不放在 `src/server/actions/liff-my-bookings.ts`（"use server" 檔）的原因：
 *   Next.js / Turbopack 要求 `"use server"` 檔的所有 value export 都必須是 async
 *   server action。non-async helper export 在 dev tsc 與 vitest 都不會抓，但
 *   `next build` 會直接 fail（Vercel preview 即因此 blocker）。
 *
 *   修法：把純函數搬到非 "use server" 檔，action 檔 import 即可。
 *   helper 的合約由本檔自己負責；server-action 端只負責資料注入 + 序列化。
 */

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
