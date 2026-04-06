"use client";

import { useState } from "react";
import { isSlotPastToday } from "@/lib/booking-constants";
import { toLocalDateStr } from "@/lib/date-utils";

interface Props {
  days: string[];
  slotTimes: string[];
  defaultDate: string;
  todayStr: string;
  children: React.ReactNode; // customer search + other fields before slots
}

/**
 * 後台新增預約表單 — 日期切換時即時更新時段可用性
 *
 * 共用 isSlotPastToday()（與前台同一支 helper），
 * 以台灣時間為準判斷「今天已過時段」。
 */
export function DashboardBookingForm({
  days,
  slotTimes,
  defaultDate,
  todayStr,
  children,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(
    days.includes(defaultDate) ? defaultDate : days[0]
  );

  // 過去日期整天不可預約（理論上 dropdown 不含過去日期，但防禦性檢查）
  const isPastDate = selectedDate < todayStr;

  return (
    <>
      {children}

      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-earth-700">
          日期 <span className="text-red-500">*</span>
        </label>
        <select
          name="bookingDate"
          required
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
        >
          {days.map((d) => {
            const dateObj = new Date(d + "T12:00:00");
            const weekDay = ["日", "一", "二", "三", "四", "五", "六"][dateObj.getDay()];
            return (
              <option key={d} value={d}>
                {d}（{weekDay}）{d === todayStr ? " — 今天" : ""}
              </option>
            );
          })}
        </select>
      </div>

      {/* 過去日期警告 */}
      {isPastDate && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          不可建立過去日期的預約，請選擇今天或未來日期。
        </div>
      )}

      {/* Slot Time */}
      <div>
        <label className="block text-sm font-medium text-earth-700">
          時段 <span className="text-red-500">*</span>
        </label>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {slotTimes.map((t, i) => {
            // 用共用 helper 判斷（台灣時間）
            const isPast = isSlotPastToday(selectedDate, t);
            const disabled = isPast || isPastDate;

            return (
              <label
                key={t}
                title={isPast ? "已過時段" : isPastDate ? "過去日期" : undefined}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                  disabled
                    ? "cursor-not-allowed border-earth-200 bg-earth-100 text-earth-400"
                    : "border-earth-200 text-earth-700 hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
                }`}
              >
                <input
                  type="radio"
                  name="slotTime"
                  value={t}
                  disabled={disabled}
                  defaultChecked={!disabled && i === 0}
                  required
                  className="sr-only"
                />
                <span>{t}</span>
                {isPast && (
                  <span className="mt-0.5 text-[10px] text-earth-400">已過時段</span>
                )}
              </label>
            );
          })}
        </div>

        {/* 若今天所有時段都已過 */}
        {selectedDate === todayStr && slotTimes.every((t) => isSlotPastToday(selectedDate, t)) && (
          <p className="mt-2 text-xs text-red-500">
            今天所有時段都已過，請選擇其他日期。
          </p>
        )}
      </div>

    </>
  );
}
