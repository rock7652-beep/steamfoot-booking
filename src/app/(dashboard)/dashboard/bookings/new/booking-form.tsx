"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { fetchDaySlots } from "@/server/actions/slots";
import { isSlotPastToday } from "@/lib/booking-constants";
import { formatWeekdayZh } from "@/lib/date-utils";
import type { SlotAvailability } from "@/types";

interface Props {
  days: string[];
  defaultDate: string;
  todayStr: string;
}

/**
 * 後台新增預約表單 — 日期切換時即時從 DB 載入可預約時段
 *
 * 與前台預約使用同一支 fetchDaySlots()，確保：
 * - 公休日 → 無時段
 * - 縮短營業時間 → 只顯示範圍內時段
 * - SlotOverride disabled → 該時段消失
 * - SlotOverride enabled → 強制顯示
 *
 * Client cache：dateStr → SlotAvailability[]
 * 切回看過的日期同步秒開、不打 server。Race guard 確保快速切日期時最後選擇
 * 的日期才會顯示。Form 被 submit 後 page.tsx 走 redirect，本元件 unmount，
 * cache 自然失效；不需要手動 clear（也沒辦法 — submit 是 server action，client
 * 拿不到成功訊號）。
 */
export function DashboardBookingForm({
  days,
  defaultDate,
  todayStr,
}: Props) {
  const [selectedDate, setSelectedDate] = useState(
    days.includes(defaultDate) ? defaultDate : days[0]
  );
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const slotCacheRef = useRef<Map<string, SlotAvailability[]>>(new Map());
  const requestIdRef = useRef(0);

  // 過去日期整天不可預約
  const isPastDate = selectedDate < todayStr;

  // 載入時段（cache hit 秒開、cache miss 走 server + race guard）
  const loadSlots = useCallback(async (date: string) => {
    setSelectedSlot(null);
    const cached = slotCacheRef.current.get(date);
    if (cached) {
      setSlots(cached);
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await fetchDaySlots(date);
      // 慢回來的舊請求 — 使用者已經切到別的日期，丟掉結果
      if (requestId !== requestIdRef.current) return;
      slotCacheRef.current.set(date, result.slots);
      setSlots(result.slots);
    } catch {
      if (requestId === requestIdRef.current) setSlots([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  // 初次載入 + 切換日期時重新載入
  useEffect(() => {
    if (selectedDate && !isPastDate) {
      loadSlots(selectedDate);
    } else {
      setSlots([]);
      setLoading(false);
    }
  }, [selectedDate, isPastDate, loadSlots]);

  const isClosed = !loading && !isPastDate && slots.length === 0;

  return (
    <>
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
          {days.map((d) => (
            <option key={d} value={d}>
              {d}（{formatWeekdayZh(d)}）{d === todayStr ? " — 今天" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 過去日期警告 */}
      {isPastDate && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          不可建立過去日期的預約，請選擇今天或未來日期。
        </div>
      )}

      {/* 公休日警告 */}
      {isClosed && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          此日為公休日或無可預約時段，請選擇其他日期。
        </div>
      )}

      {/* Slot Time */}
      <div>
        <label className="block text-sm font-medium text-earth-700">
          時段 <span className="text-red-500">*</span>
        </label>

        {loading ? (
          // Slot skeleton：8 個 placeholder tile（同 grid-cols-4 兩列），保持版面高度
          // 不跳動，比 spinner 視覺上更明確且不打斷店長視線。
          <div
            className="mt-1.5 grid grid-cols-4 gap-2"
            role="status"
            aria-label="載入時段中…"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex h-[58px] animate-pulse flex-col items-center justify-center rounded-lg border border-earth-200 bg-earth-50"
              />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="mt-1.5 py-4 text-center text-sm text-earth-400">
            {isPastDate ? "過去日期無法預約" : "此日無可預約時段"}
          </p>
        ) : (
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {slots.map((s) => {
              const isPast = isSlotPastToday(selectedDate, s.startTime);
              const isFull = s.available <= 0;
              const disabled = isPast || isFull || isPastDate;

              return (
                <label
                  key={s.startTime}
                  title={
                    isPast
                      ? "已過時段"
                      : isFull
                        ? "此時段已滿"
                        : `可預約 ${s.available} 位`
                  }
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                    disabled
                      ? "cursor-not-allowed border-earth-200 bg-earth-100 text-earth-400"
                      : "border-earth-200 text-earth-700 hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="slotTime"
                    value={s.startTime}
                    disabled={disabled}
                    checked={selectedSlot === s.startTime}
                    onChange={() => setSelectedSlot(s.startTime)}
                    required
                    className="sr-only"
                  />
                  <span>{s.startTime}</span>
                  <span className={`mt-0.5 text-[10px] ${disabled ? "text-earth-400" : "text-earth-500"}`}>
                    {isPast ? "已過" : isFull ? "已滿" : `剩 ${s.available} 位`}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {/* 若今天所有時段都已過或已滿 */}
        {selectedDate === todayStr &&
          !loading &&
          slots.length > 0 &&
          slots.every((s) => isSlotPastToday(selectedDate, s.startTime) || s.available <= 0) && (
            <p className="mt-2 text-xs text-red-500">
              今天所有時段都已過或已滿，請選擇其他日期。
            </p>
          )}
      </div>
    </>
  );
}
