"use client";

/**
 * CancelConfirmModal 從 bookings-list.tsx 拆出 (P1-5a 結構拆分).
 *
 * 純 presentational：所有 state / 業務邏輯透過 props 傳入：
 *   - booking / status / errorMessage 為展示用
 *   - 3 個 callback (onConfirmCancel / onConfirmReschedule / onDismiss)
 *     由 caller (BookingsList) 持有實際 cancel / refetch / router.push 行為
 *
 * 無障礙：role / aria-modal / aria-labelledby 從原檔逐字保留。
 */

import { liffMessages } from "@/lib/liff/messages";
import type { LiffBookingRow } from "@/server/actions/liff-my-bookings";
import { formatBookingDate, liffTypeLabel } from "../_helpers";

// ──────────────────────────────────────────────────────────
// PR-D4A-2 cancel confirm modal (inline，未抽獨立檔；per 拍板選項 a)
// P1-5a 拆出獨立檔（純結構移動，行為完全不變）
// ──────────────────────────────────────────────────────────

/**
 * Bottom-sheet style modal（手機友善），desktop fallback 置中。
 *   - backdrop 點擊可關閉，但 status === "submitting" 時 lock
 *   - status 三態：idle (顯示 3 顆按鈕) / submitting (全部 disabled) /
 *     error (額外顯示 errorMessage banner，confirm 按鈕仍可重試)
 *   - 不做 success 階段：成功瞬間 caller 已 closeCancelModal + refetch（→ optional push 到 trial-booking），
 *     卡片會直接從 upcoming 移到 history，視覺即是 feedback
 *
 * PR-D4B-1 layout (per 拍板選項 b)：
 *   ┌─────────────────────────────┐
 *   │ [改時間]              ← primary, 第一列獨占
 *   │ [暫不取消] [取消此次預約]  ← secondary + outlined-destructive, 第二列
 *   └─────────────────────────────┘
 *   視覺優先序對齊產品判斷：「改時間」是顧客最被期望的 path。
 */
export function CancelConfirmModal({
  booking,
  status,
  errorMessage,
  onConfirmCancel,
  onConfirmReschedule,
  onDismiss,
}: {
  booking: LiffBookingRow;
  status: "idle" | "submitting" | "error";
  errorMessage: string | null;
  /** 顧客選「取消此次預約」— D4A-2 原行為，cancel 完關 modal、不 redirect */
  onConfirmCancel: () => void;
  /** 顧客選「改時間」— D4B-1，cancel 完 push 到 trial-booking */
  onConfirmReschedule: () => void;
  onDismiss: () => void;
}) {
  const m = liffMessages.cancelBooking;
  const dateLabel = formatBookingDate(booking.bookingDate);
  const submitting = status === "submitting";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
      onClick={(e) => {
        // backdrop click 才 dismiss；submitting 時 lock
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2
          id="cancel-modal-title"
          className="text-lg font-bold text-earth-900"
        >
          {m.confirmTitle}
        </h2>
        <p className="mt-2 text-sm text-earth-600">{m.confirmBody}</p>

        {/* 預約 snapshot — 顧客最後確認一下是哪一筆 */}
        <div className="mt-3 rounded-lg border border-earth-200 bg-earth-50 px-3 py-2 text-sm">
          <p className="font-semibold text-earth-900">
            {dateLabel} {booking.slotTime}
          </p>
          <p className="mt-0.5 text-xs text-earth-600">
            {liffTypeLabel(booking.bookingType, booking.isMakeup)}
          </p>
        </div>

        {status === "error" && errorMessage && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        )}

        {/* PR-D4B-1 layout (b)：改時間 primary 獨占一列；下方 secondary 一列兩顆 */}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirmReschedule}
            disabled={submitting}
            className="w-full rounded-xl bg-earth-800 px-4 py-3 text-sm font-semibold text-white hover:bg-earth-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? m.submitting : m.rescheduleCta}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDismiss}
              disabled={submitting}
              className="flex-1 rounded-xl border border-earth-300 bg-white px-4 py-3 text-sm font-medium text-earth-700 hover:bg-earth-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {m.dismissCta}
            </button>
            <button
              type="button"
              onClick={onConfirmCancel}
              disabled={submitting}
              className="flex-1 rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? m.submitting : m.confirmCta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
