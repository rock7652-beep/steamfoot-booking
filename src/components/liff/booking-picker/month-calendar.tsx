"use client";

/**
 * Shared LIFF MonthCalendar (PR-G3-pre)
 *
 * 從 `src/app/(liff)/liff/trial-booking/trial-booking-form.tsx` 抽出，原 inline
 * 為 lines 696–852（PR-D1B 時建立）。本檔與 SlotPicker 並列，目的是讓
 * `/liff/trial-booking` 與後續 `/liff/member-booking` (PR-G3 主體) 共用同一份
 * 月曆 / 時段 UI，避免 ~300 LOC 重複維護。
 *
 * Booking-type-agnostic：
 *   - 無任何 FIRST_TRIAL / PACKAGE_SESSION 分支
 *   - 月曆容量 / 預約數來源是 `MonthDayInfo`（從 `fetchMonthAvailability` 衍生），
 *     不分 bookingType（slots query 本身就是 type-agnostic）
 *   - 文案透過 `labels` prop 傳入，caller 自行從 `liffMessages.trialBooking.*` 或
 *     `liffMessages.memberBooking.*` 構造 — 避免在此引用任一 flow-specific namespace
 *
 * 唯一保留的 inline 中文：「載入中…」（原 trial-booking-form.tsx:776 即為 inline；
 * 純 extract，無新增 inline 文案）。
 */

import type { MonthSlotInfo } from "@/server/actions/slots";

/**
 * 月曆顯示需要的單日資訊。原為 `trial-booking-form.tsx` 內部 type；本 PR 移到
 * shared 模組讓兩個 caller 共用同一 source of truth。
 */
export type MonthDayInfo = {
  totalCapacity: number;
  totalBooked: number;
  slots: MonthSlotInfo[];
};

/**
 * 月曆 UI 用到的所有文案。Caller 自行從對應的 liffMessages namespace 構造；
 * shared component 不直接 import `@/lib/liff/messages` 以保持 booking-type 中立。
 */
export type MonthCalendarLabels = {
  /** aria-label「上個月」 */
  monthPrev: string;
  /** aria-label「下個月」 */
  monthNext: string;
  /** 週標題 7 個字串：[日, 一, 二, 三, 四, 五, 六] */
  weekLabels: readonly string[];
  /** 今日小徽章「今」 */
  todayLabel: string;
  /** 公休日格內小徽章「休」 */
  closedDayLabel: string;
  /** 額滿日格內小徽章「額滿」 */
  fullDayLabel: string;
};

export interface MonthCalendarProps {
  /** 月份年（4 位數） */
  calYear: number;
  /** 月份月（**0-based**，0 = 1 月） */
  calMonth: number;
  /** 今日（caller 負責 setHours(0,0,0,0) — 用於 isPast / isToday 比較） */
  today: Date;
  /** 月份 capacity / booked 資料（key = "YYYY-MM-DD"） */
  monthData: Record<string, MonthDayInfo>;
  /** 月份資料載入中 */
  loadingMonth: boolean;
  /** 目前選中的日期（"YYYY-MM-DD"），null = 未選 */
  selectedDate: string | null;
  /** 顧客點某一格時 callback；dateStr 格式 "YYYY-MM-DD" */
  onSelectDate: (dateStr: string) => void;
  /** 「上個月」按鈕 callback */
  onPrevMonth: () => void;
  /** 「下個月」按鈕 callback */
  onNextMonth: () => void;
  /** 全月曆 disabled（送出中時 caller 傳 true） */
  disabled: boolean;
  /** 文案；由 caller 從 liffMessages 構造 */
  labels: MonthCalendarLabels;
}

export function MonthCalendar({
  calYear,
  calMonth,
  today,
  monthData,
  loadingMonth,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  disabled,
  labels,
}: MonthCalendarProps) {
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = firstDay.getDay();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthLabel = `${calYear} 年 ${calMonth + 1} 月`;

  function dateStrFor(day: number) {
    return `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function isClosedDay(dateStr: string): boolean {
    const info = monthData[dateStr];
    if (!info) return false;
    return info.totalCapacity === 0;
  }
  function isFullDay(dateStr: string): boolean {
    const info = monthData[dateStr];
    if (!info) return false;
    return info.totalCapacity > 0 && info.totalBooked >= info.totalCapacity;
  }

  return (
    <div className="rounded-2xl border border-earth-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-earth-100 px-3 py-2">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={disabled}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-earth-800 hover:bg-earth-100 transition disabled:opacity-40"
          aria-label={labels.monthPrev}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-lg font-bold text-earth-900">{monthLabel}</span>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={disabled}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-earth-800 hover:bg-earth-100 transition disabled:opacity-40"
          aria-label={labels.monthNext}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-earth-100 bg-earth-50">
        {labels.weekLabels.map((w) => (
          <div
            key={w}
            className="py-2 text-center text-sm font-semibold text-earth-700"
          >
            {w}
          </div>
        ))}
      </div>

      {loadingMonth ? (
        <div className="flex items-center justify-center py-12 text-sm text-earth-500">
          <div
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-earth-300 border-t-earth-700"
            aria-hidden
          />
          載入中…
        </div>
      ) : (
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (day === null) {
              return (
                <div
                  key={`e-${i}`}
                  className="min-h-[72px] border-b border-r border-earth-100"
                />
              );
            }
            const dateObj = new Date(calYear, calMonth, day);
            dateObj.setHours(0, 0, 0, 0);
            const dateStr = dateStrFor(day);
            const isPast = dateObj < today;
            const isSelected = dateStr === selectedDate;
            const isToday = dateObj.getTime() === today.getTime();
            const closed = !isPast && isClosedDay(dateStr);
            const full = !isPast && !closed && isFullDay(dateStr);
            const cellDisabled = disabled || isPast || closed;

            return (
              <button
                key={day}
                type="button"
                disabled={cellDisabled}
                onClick={() => onSelectDate(dateStr)}
                className={`relative flex min-h-[72px] flex-col items-start border-b border-r border-earth-100 p-1.5 transition ${
                  isSelected
                    ? "bg-earth-800 text-white"
                    : isPast || closed
                      ? "bg-earth-50 text-earth-400"
                      : full
                        ? "bg-earth-50 text-earth-500"
                        : "bg-white text-earth-800 hover:bg-earth-50"
                }`}
              >
                <div className="flex w-full items-center gap-1">
                  <span className="text-base font-bold leading-none">{day}</span>
                  {isToday && !isSelected && (
                    <span className="ml-auto rounded bg-earth-200 px-1 text-[10px] font-bold leading-none text-earth-800">
                      {labels.todayLabel}
                    </span>
                  )}
                </div>
                {closed && (
                  <span
                    className={`mt-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-earth-100 text-earth-600"
                    }`}
                  >
                    {labels.closedDayLabel}
                  </span>
                )}
                {full && (
                  <span
                    className={`mt-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {labels.fullDayLabel}
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
