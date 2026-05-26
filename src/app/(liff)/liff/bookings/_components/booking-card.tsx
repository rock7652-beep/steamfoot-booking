"use client";

/**
 * BookingCard + 3 個 inline SVG icons 從 bookings-list.tsx 拆出 (P1-5a 結構拆分).
 *
 * 純 presentational：所有 state / 邏輯 / handler 透過 props 傳入。
 * cancel button 點擊呼叫 `onRequestCancel(booking)`，由 caller 開 modal。
 */

import {
  contactStoreUrl,
  liffMessages,
  storeAddress,
  storeMapUrl,
} from "@/lib/liff/messages";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/booking-constants";
import type { LiffBookingRow } from "@/server/actions/liff-my-bookings";
import {
  canCancelBooking,
  formatBookingDate,
  generateGoogleCalendarUrl,
  liffTypeLabel,
} from "../_helpers";
import type { Tab } from "./ready-view";

// ──────────────────────────────────────────────────────────
// Card
// ──────────────────────────────────────────────────────────

export function BookingCard({
  booking,
  tab,
  storeName,
  onRequestCancel,
}: {
  booking: LiffBookingRow;
  tab: Tab;
  /** PR-E1-3：ICS event SUMMARY 用（e.g.「暖暖蒸足 預約」）*/
  storeName: string;
  /** PR-D4A-2：caller 開 cancel modal；history tab 不傳 = 不顯示按鈕 */
  onRequestCancel?: (b: LiffBookingRow) => void;
}) {
  const dateLabel = formatBookingDate(booking.bookingDate);
  const isCancelled = booking.bookingStatus === "CANCELLED";
  // PR-D4A-2：只在 upcoming tab 的 non-cancelled card 顯示「取消」按鈕。
  // history tab 一律不顯示（COMPLETED / NO_SHOW / 已取消的 / 過期 PENDING 都不該再取消）。
  const showCancelControl = tab === "upcoming" && !isCancelled && !!onRequestCancel;
  const canCancel = showCancelControl ? canCancelBooking(booking) : false;
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-sm ${
        isCancelled ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-earth-900">{dateLabel}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-earth-800">
            {booking.slotTime}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            STATUS_COLOR[booking.bookingStatus] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {STATUS_LABEL[booking.bookingStatus] ?? booking.bookingStatus}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-earth-100 px-2 py-0.5 text-xs font-medium text-earth-700">
          {liffTypeLabel(booking.bookingType, booking.isMakeup)}
        </span>
        {booking.staffName && (
          <span className="text-xs text-earth-600">
            服務店長：{booking.staffName}
          </span>
        )}
      </div>

      {!isCancelled && (
        <div className="flex flex-col gap-2 border-t border-earth-100 pt-2">
          {/* PR-D2 保留 hint —— 取消 ≠ 改時間，hint 仍然語義正確（per D4A-2 拍板選項 a）*/}
          <p className="text-xs text-earth-500">
            {liffMessages.bookings.contactStoreHint}
          </p>

          {/* PR-D4A-2：cancel control — disabled when <12h（client-derive，mirror server 規則）*/}
          {showCancelControl && (
            <>
              {canCancel ? (
                <button
                  type="button"
                  onClick={() => onRequestCancel!(booking)}
                  className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 active:scale-[0.98]"
                >
                  {liffMessages.cancelBooking.cardCta}
                </button>
              ) : (
                <div>
                  <button
                    type="button"
                    disabled
                    aria-disabled
                    className="w-full cursor-not-allowed rounded-xl border border-earth-200 bg-earth-50 px-4 py-2.5 text-sm font-medium text-earth-400"
                  >
                    {liffMessages.cancelBooking.cardCta}
                  </button>
                  <p className="mt-1 text-center text-[11px] text-earth-500">
                    {liffMessages.cancelBooking.cardHint}
                  </p>
                </div>
              )}

              {/* PR-E1-1：「聯絡店家」LINE-green CTA — 顧客有問題時的安全出口。
                  upcoming non-cancelled 才顯示（與 cancel button 同條件）。
                  純 <a> 開 LINE OA，零 server / DB / auth；URL = 既有 contactStoreUrl
                  (PR-C2 全店共用；PR-E 後改 per-store via Store.lineDestination)。*/}
              <a
                href={contactStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#05b54d] active:scale-[0.98]"
              >
                <LineIcon />
                {liffMessages.bookings.contactStoreCta}
              </a>

              {/* PR-E1-2：地址小字 + Google-blue「導航到店」CTA。
                  顧客「出發前」最自然位置；按下 Google Maps deep link 跳原生 Maps app。
                  地址為店家專屬 listing 短網址（含評論 / 照片 / 營業時間），體感優於通用搜尋。
                  per-store address 待 PR-E 從 Store.address 取（目前 hardcode same 模式 as contactStoreUrl）。*/}
              <div className="flex flex-col gap-1">
                <p className="text-xs text-earth-600">{storeAddress}</p>
                <a
                  href={storeMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#4285F4] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3367d6] active:scale-[0.98]"
                >
                  <MapPinIcon />
                  {liffMessages.bookings.navigateCta}
                </a>
              </div>

              {/* PR-E1-3b（hotfix #184）：「加入行事曆」outlined CTA。
                  原 v1（PR #183, 912238e in main）用 ICS 檔案 data URI download 流程，
                  LINE iOS webview 對 data URI dispatch 不穩 → 顧客點按鈕「沒反應」。
                  改走 Google Calendar TEMPLATE URL（純 HTTP URL）+ 同頁導向：
                    - button + onClick window.location.href 是最明確的 user-gesture
                      → LINE webview 不會擋（vs target="_blank" 可能被 popup-blocker 擋）
                    - LINE iOS webview → 開 calendar.google.com TEMPLATE 頁，顧客一鍵 save
                    - Android with Google Calendar app → intent deep link 直開 app 預填
                    - 未登入 Google → 先跳 accounts.google.com 登入頁（非 bug，是 Google auth gate）
                  Outlined 灰：calendar 為跨平台中性動作，不綁品牌色。 */}
              <button
                type="button"
                onClick={() => {
                  window.location.href = generateGoogleCalendarUrl({
                    bookingDate: booking.bookingDate,
                    slotTime: booking.slotTime,
                    storeName,
                  });
                }}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-earth-300 bg-white px-4 py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50 active:scale-[0.98]"
              >
                <CalendarIcon />
                {liffMessages.bookings.calendarCta}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Inline SVG icons (per 既有 "duplicate over abstraction" pattern)
// ──────────────────────────────────────────────────────────

/**
 * PR-E1-1：LINE logo SVG（顧客 affordance — 看到就知道「按了會回 LINE 聊天」）。
 * 同 svg path 在 src/app/(customer)/my-bookings/page.tsx 也用過；
 * 此處 inline 而非抽 shared，per 拍板「duplicate over abstraction」。
 */
function LineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}

/**
 * PR-E1-2：Material Design map-pin icon (顧客 affordance — 看到就知道「按了會開 Maps」)。
 * 用 currentColor 跟著按鈕 text 顏色走（白色 on Google-blue 底）。
 */
function MapPinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

/**
 * PR-E1-3：Material Design calendar icon。
 * outlined 按鈕底白色，icon currentColor 跟 text earth-700。
 */
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
    </svg>
  );
}
