/**
 * Pure helpers extracted from `bookings-list.tsx` (P1-5a 結構拆分).
 *
 * 純函數、零 React、零 hook、零 DOM access (URLSearchParams 在 Node + browser 皆 OK)。
 * 行為與原 bookings-list.tsx 內 byte-equivalent — 拆分目的是降低主檔行數
 * 並讓這些函數可單元測試。
 */

import {
  contactStoreUrl,
  liffMessages,
  storeAddress,
  storeMapUrl,
} from "@/lib/liff/messages";
import type { LiffBookingRow } from "@/server/actions/liff-my-bookings";

/** "YYYY-MM-DD" → "M/D (週X)" 台灣語系。 */
export function formatBookingDate(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00+08:00`);
  return d.toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Taipei",
  });
}

/**
 * PR-D4A-2：client-side cutoff 判斷，mirror src/server/actions/booking.ts:638
 * 的 12 小時規則（hoursUntilBooking < 12 → reject）。
 *
 * client 算只負責按鈕 enabled/disabled UX；最終 source of truth 仍是 server —
 * 即使 client 漏判（時鐘漂移、跨日 edge case）讓使用者按下按鈕，cancelLiffBooking
 * 也會回 cutoff_breach，modal 會顯示錯誤訊息。
 */
export function canCancelBooking(b: LiffBookingRow): boolean {
  const d = new Date(`${b.bookingDate}T${b.slotTime}:00+08:00`);
  const hoursUntil = (d.getTime() - Date.now()) / (1000 * 60 * 60);
  return hoursUntil >= 12;
}

// ──────────────────────────────────────────────────────────
// PR-E1-3b：Google Calendar TEMPLATE URL 生成（hotfix #184）
// ──────────────────────────────────────────────────────────

/** 純函數：booking → Google Calendar 「新增事件」TEMPLATE URL。
 *
 * 為何不用 ICS data URI（原 PR #183 v1 in main 之 912238e）：
 *   LINE iOS webview 對 data URI MIME dispatch 不穩，
 *   實機測試「沒反應」。改走純 HTTP URL 過 webview 永遠 OK。
 *
 * Google Calendar TEMPLATE URL 行為：
 *   - LINE iOS webview（同頁導向）→ 開 calendar.google.com TEMPLATE 頁，
 *     顧客一鍵 save 到 Google 行事曆（多數人 Google ↔ iCloud 已 sync → 自動進 Apple Calendar）
 *   - Android with Google Calendar app → intent deep link 直接開 app 預填事件
 *   - Android without app → 同 iOS：開 web 版
 *   - 未登入 Google → 先跳 accounts.google.com 登入頁（非 bug，是 Google auth gate）
 *
 * URL params（per Google Calendar template doc）：
 *   action=TEMPLATE       固定值
 *   text=<title>          事件標題
 *   dates=<start>/<end>   UTC YYYYMMDDTHHMMSSZ 格式，斜線分隔
 *   details=<desc>        備註（多行 \n 自動 encode 為 %0A，Google 正確 render）
 *   location=<addr>       地點（地圖會顯示 pin）
 *
 * URLSearchParams 自動處理所有 URL encoding（含中文 UTF-8 / 特殊字元）。
 */
export function generateGoogleCalendarUrl(args: {
  bookingDate: string; // "YYYY-MM-DD"
  slotTime: string; // "HH:mm"
  storeName: string;
  durationMinutes?: number;
}): string {
  const { bookingDate, slotTime, storeName } = args;
  const durationMinutes = args.durationMinutes ?? 60;

  // Booking 時間是 Taipei +08:00；Date object 內部存 UTC，toISOString 自動產 UTC。
  const startLocal = new Date(`${bookingDate}T${slotTime}:00+08:00`);
  const endLocal = new Date(startLocal.getTime() + durationMinutes * 60 * 1000);

  // "2026-05-24T02:00:00.000Z" → "20260524T020000Z"
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${storeName} 預約`,
    dates: `${fmt(startLocal)}/${fmt(endLocal)}`,
    details: [
      `地址：${storeAddress}`,
      `導航：${storeMapUrl}`,
      `聯絡店家：${contactStoreUrl}`,
    ].join("\n"),
    location: storeAddress,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * PR-D4A-2：cancelLiffBooking discriminated-union status → 顧客面文案。
 * no_customer / invalid_input 都歸入 service_unavailable —— 顧客面不細分
 * 「身份失效」「輸入錯」這種技術細節（這兩個本 UI 也不太可能命中）。
 */
export function mapCancelStatusToMessage(status: string): string {
  const m = liffMessages.cancelBooking;
  switch (status) {
    case "not_found":
      return m.errorNotFound;
    case "forbidden":
      return m.errorForbidden;
    case "cutoff_breach":
      return m.errorCutoffBreach;
    case "status_blocked":
      return m.errorStatusBlocked;
    case "no_customer":
    case "invalid_input":
    case "service_unavailable":
    default:
      return m.errorServiceUnavailable;
  }
}

/**
 * LIFF-specific booking-type 顯示。
 *   isMakeup=true 永遠優先（不論 bookingType）
 *   不 reuse BOOKING_TYPE_LABEL — 那個用「體驗 / 課程堂數」較 staff-y；
 *   LIFF 顧客語要「體驗預約 / 課程」。
 */
export function liffTypeLabel(bookingType: string, isMakeup: boolean): string {
  if (isMakeup) return liffMessages.bookings.typeMakeup;
  switch (bookingType) {
    case "FIRST_TRIAL":
      return liffMessages.bookings.typeFirstTrial;
    case "PACKAGE_SESSION":
      return liffMessages.bookings.typePackage;
    case "SINGLE":
      return liffMessages.bookings.typeSingle;
    default:
      return bookingType;
  }
}
