"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { fetchDaySlots } from "@/server/actions/slots";
import { isSlotPastToday } from "@/lib/booking-constants";
import { formatWeekdayZh } from "@/lib/date-utils";
import { getSlotCapacityDisplay } from "@/lib/slot-capacity-display";
import type { SlotAvailability } from "@/types";
import { useBookingFormValidation } from "./booking-create-form";
import { shouldClearSelectedSlot } from "./booking-submit-validation";

interface Props {
  days: string[];
  defaultDate: string;
  defaultSlotTime?: string;
  lockScheduleSelection?: boolean;
  todayStr: string;
  /** SSR 預載的「初始日期」時段（= defaultDate，或不在 days 內時的 days[0]）。
   *  有值 → 第一屏直接顯示、不打 client；undefined（過去日期 / SSR 失敗）→ client fallback。 */
  initialSlots?: SlotAvailability[];
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
  defaultSlotTime,
  lockScheduleSelection = false,
  todayStr,
  initialSlots,
}: Props) {
  const { errors, clearError } = useBookingFormValidation();
  const initialDate = days.includes(defaultDate) ? defaultDate : (days[0] ?? "");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  // SSR 已帶初始日時段 → 首屏直接顯示、loading=false；否則沿用原本 client 載入。
  const [slots, setSlots] = useState<SlotAvailability[]>(initialSlots ?? []);
  const [loading, setLoading] = useState(initialSlots === undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(defaultSlotTime ?? null);
  const [people, setPeople] = useState(1);
  const [slotResetMessage, setSlotResetMessage] = useState(false);
  // 把 SSR 時段種進 cache → mount effect 的 loadSlots 直接 cache hit，不打 server、不閃 skeleton。
  const slotCacheRef = useRef<Map<string, SlotAvailability[]>>(
    new Map(initialSlots ? [[initialDate, initialSlots]] : [])
  );
  const requestIdRef = useRef(0);

  // 過去日期整天不可預約
  const isPastDate = selectedDate < todayStr;

  // 載入時段（cache hit 秒開、cache miss 走 server + race guard）
  const loadSlots = useCallback(async (date: string) => {
    if (!lockScheduleSelection) setSelectedSlot(null);
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
  }, [lockScheduleSelection]);

  // 初次載入 + 切換日期時重新載入
  useEffect(() => {
    if (lockScheduleSelection) {
      setLoading(false);
      return;
    }
    if (selectedDate && !isPastDate) {
      loadSlots(selectedDate);
    } else {
      setSlots([]);
      setLoading(false);
    }
  }, [selectedDate, isPastDate, loadSlots, lockScheduleSelection]);

  const isClosed = !loading && !isPastDate && slots.length === 0;

  const handlePeopleChange = (nextPeople: number) => {
    setPeople(nextPeople);
    setSlotResetMessage(false);
    if (!selectedSlot) return;
    if (shouldClearSelectedSlot(selectedSlot, slots, nextPeople)) {
      setSelectedSlot(null);
      setSlotResetMessage(true);
    }
  };

  return (
    <>
      {/* Date */}
      <div>
        <label className="block text-sm font-medium text-earth-700">
          日期 <span className="text-red-500">*</span>
        </label>
        {days.length === 0 ? (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
            店鋪目前沒有開放可預約日期，請先到營業時間設定開放日期。
          </p>
        ) : (
          <select
            name={lockScheduleSelection ? undefined : "bookingDate"}
            required
            value={selectedDate}
            disabled={lockScheduleSelection}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {d}（{formatWeekdayZh(d)}）{d === todayStr ? " — 今天" : ""}
              </option>
            ))}
          </select>
        )}
        {lockScheduleSelection && (
          <input type="hidden" name="bookingDate" value={selectedDate} />
        )}
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

      <div>
        <label className="block text-sm font-medium text-earth-700">預約人數</label>
        <select
          name="people"
          value={people}
          onChange={(event) => handlePeopleChange(Number(event.target.value))}
          className="mt-1.5 block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <option value="1">1 人</option>
          <option value="2">2 人</option>
          <option value="3">3 人</option>
          <option value="4">4 人</option>
        </select>
        {slotResetMessage && (
          <p className="mt-1.5 text-sm text-amber-700" role="alert">
            人數已變更，請重新選擇時段。
          </p>
        )}
      </div>

      {/* Slot Time */}
      <div data-booking-slot-section tabIndex={-1}>
        <label className="block text-sm font-medium text-earth-700">
          時段 <span className="text-red-500">*</span>
        </label>

        {lockScheduleSelection && defaultSlotTime ? (
          <div className="mt-1.5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
            <input type="hidden" name="slotTime" value={defaultSlotTime} />
            <p className="text-sm font-semibold text-primary-800">{defaultSlotTime}</p>
            <p className="mt-0.5 text-xs text-primary-700">已從芳療師排程帶入</p>
          </div>
        ) : loading ? (
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
              const display = getSlotCapacityDisplay(s.capacity, s.bookedCount, people);
              const disabled = isPast || !display.canFitRequestedPeople || isPastDate;

              return (
                <label
                  key={s.startTime}
                  title={
                    isPast
                      ? "已過時段"
                      : !display.canFitRequestedPeople
                        ? display.selectionStatus === "full" ? "此時段已額滿" : "此時段無法容納目前預約人數"
                        : display.label ?? "可預約"
                  }
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                    disabled
                      ? "cursor-not-allowed border-earth-200 bg-earth-100 text-earth-400"
                      : display.capacityStatus === "low"
                        ? "border-yellow-300 bg-yellow-50 text-yellow-900 hover:border-yellow-400 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
                        : "border-earth-200 text-earth-700 hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="slotTime"
                    value={s.startTime}
                    disabled={disabled}
                    checked={selectedSlot === s.startTime}
                    onChange={() => {
                      setSelectedSlot(s.startTime);
                      setSlotResetMessage(false);
                      clearError("slot");
                    }}
                    className="sr-only"
                  />
                  <span>{s.startTime}</span>
                  <span className={`mt-0.5 text-[10px] ${disabled ? "text-earth-400" : display.capacityStatus === "low" ? "text-yellow-800" : "text-earth-500"}`}>
                    {isPast ? "已過" : display.label ?? "可預約"}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {errors.slot && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {errors.slot}
          </p>
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
