"use client";

/**
 * Shared LIFF SlotPicker (PR-G3-pre)
 *
 * 從 `src/app/(liff)/liff/trial-booking/trial-booking-form.tsx` 抽出，原 inline
 * 為 lines 863–936（PR-D1B 時建立）。本檔與 MonthCalendar 並列，目的是讓
 * `/liff/trial-booking` 與後續 `/liff/member-booking` (PR-G3 主體) 共用同一份
 * 時段格 UI。
 *
 * Booking-type-agnostic：
 *   - 無 FIRST_TRIAL / PACKAGE_SESSION 分支
 *   - 時段 capacity / 預約數來自 `SlotAvailability`（從 `fetchDaySlots` 衍生），
 *     不分 bookingType
 *   - 文案透過 `labels` prop 傳入；不直接 import flow-specific messages namespace
 */

import { parseLocalDate, formatWeekdayZh } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";

/**
 * 時段 UI 用到的所有文案。
 */
export type SlotPickerLabels = {
  /** 載入中提示「載入中…」 */
  loadingText: string;
  /** 該日無時段「今日無可預約時段」 */
  emptyText: string;
  /** 已過時段格內小字「已過」 */
  pastLabel: string;
  /** 額滿時段格內小字「額滿」 */
  fullLabel: string;
};

export interface SlotPickerProps {
  /** 選中的日期 "YYYY-MM-DD" — 用於顯示標題 */
  date: string;
  /** 該日所有時段（由 caller 從 fetchDaySlots 取得） */
  slots: SlotAvailability[];
  /** 時段資料載入中 */
  loading: boolean;
  /** 選中的時段 startTime "HH:MM"，null = 未選 */
  selectedSlot: string | null;
  /** 顧客點時段時 callback；startTime "HH:MM" */
  onSelectSlot: (slot: string) => void;
  /** 全 picker disabled（送出中時 caller 傳 true） */
  disabled: boolean;
  /** 文案；由 caller 從 liffMessages 構造 */
  labels: SlotPickerLabels;
}

export function SlotPicker({
  date,
  slots,
  loading,
  selectedSlot,
  onSelectSlot,
  disabled,
  labels,
}: SlotPickerProps) {
  const dateObj = parseLocalDate(date);
  const weekday = formatWeekdayZh(date);
  const heading = `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${weekday})`;

  return (
    <div className="rounded-2xl border border-earth-200 bg-white shadow-sm p-4">
      <h2 className="mb-3 text-base font-bold text-earth-900">{heading}</h2>

      {loading && (
        <div className="flex items-center justify-center py-6 text-sm text-earth-500">
          <div
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
            aria-hidden
          />
          {labels.loadingText}
        </div>
      )}

      {!loading && slots.length === 0 && (
        <p className="py-6 text-center text-sm text-earth-500">
          {labels.emptyText}
        </p>
      )}

      {!loading && slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {slots.map((s) => {
            const isFull = s.available <= 0;
            const isPast = s.isPast === true;
            const isSelected = s.startTime === selectedSlot;
            const slotDisabled = disabled || isFull || isPast;
            return (
              <button
                key={s.startTime}
                type="button"
                disabled={slotDisabled}
                onClick={() => onSelectSlot(s.startTime)}
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  isSelected
                    ? "border-earth-800 bg-earth-800 text-white"
                    : isPast
                      ? "border-earth-200 bg-earth-50 text-earth-400"
                      : isFull
                        ? "border-earth-200 bg-earth-50 text-earth-500"
                        : "border-earth-300 bg-white text-earth-800 hover:bg-earth-50 hover:border-earth-500"
                }`}
              >
                <span className="text-base leading-tight">{s.startTime}</span>
                {isPast && (
                  <span className="text-[10px] leading-tight">
                    {labels.pastLabel}
                  </span>
                )}
                {!isPast && isFull && (
                  <span className="text-[10px] leading-tight">
                    {labels.fullLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
