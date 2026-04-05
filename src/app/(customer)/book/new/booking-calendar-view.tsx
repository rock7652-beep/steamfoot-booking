"use client";

import { useState, useEffect, useCallback, useActionState } from "react";
import { fetchDaySlots } from "@/server/actions/slots";
import { createBooking } from "@/server/actions/booking";
import type { SlotAvailability } from "@/types";

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
}

interface Props {
  customerId: string;
  activeWallets: ActiveWallet[];
}

export function BookingCalendarView({ customerId, activeWallets }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // ⚡ 只在使用者點選日期時查詢時段
  const loadSlots = useCallback(async (date: string) => {
    setLoadingSlots(true);
    try {
      const result = await fetchDaySlots(date);
      setSlots(result.slots);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    loadSlots(dateStr);
  };

  // 月曆計算
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startDow = firstDay.getDay();
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);

  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const monthLabel = `${calYear} 年 ${calMonth + 1} 月`;

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  };

  return (
    <div>
      {/* 月曆 */}
      <div className="mb-4 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={prevMonth} className="rounded px-2 py-1 text-sm text-earth-500 hover:bg-earth-100">&lt;</button>
          <span className="text-sm font-semibold text-earth-800">{monthLabel}</span>
          <button onClick={nextMonth} className="rounded px-2 py-1 text-sm text-earth-500 hover:bg-earth-100">&gt;</button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs text-earth-400">
          {weekLabels.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 text-center">
          {days.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} />;
            const dateObj = new Date(calYear, calMonth, day);
            dateObj.setHours(0, 0, 0, 0);
            const isPast = dateObj < today;
            const isBeyond = dateObj > maxDate;
            const disabled = isPast || isBeyond;
            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isSelected = dateStr === selectedDate;
            const isToday = dateObj.getTime() === today.getTime();

            return (
              <button
                key={day}
                disabled={disabled}
                onClick={() => handleSelectDate(dateStr)}
                className={`mx-auto my-0.5 flex h-9 w-9 items-center justify-center rounded-full text-sm transition ${
                  isSelected
                    ? "bg-primary-600 font-bold text-white"
                    : disabled
                      ? "text-earth-300"
                      : isToday
                        ? "font-semibold text-primary-600 hover:bg-primary-50"
                        : "text-earth-700 hover:bg-earth-100"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* 時段 — 只在選日期後顯示 */}
      {selectedDate && (
        <div>
          {loadingSlots ? (
            <div className="py-8 text-center text-sm text-earth-400">載入時段中...</div>
          ) : slots.length === 0 ? (
            <div className="py-8 text-center text-sm text-earth-400">該日無可用時段</div>
          ) : (
            <SlotBookingForm
              customerId={customerId}
              selectedDate={selectedDate}
              slots={slots}
              activeWallets={activeWallets}
            />
          )}
        </div>
      )}

      {!selectedDate && (
        <div className="py-8 text-center text-sm text-earth-400">
          請先選擇日期
        </div>
      )}
    </div>
  );
}

// ── 時段選擇 + 預約表單 ──
function SlotBookingForm({
  customerId,
  selectedDate,
  slots,
  activeWallets,
}: {
  customerId: string;
  selectedDate: string;
  slots: SlotAvailability[];
  activeWallets: ActiveWallet[];
}) {
  const [people, setPeople] = useState(1);

  type FormState = { error: string | null; success: boolean; bookedTime: string; bookedPeople: number };
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData): Promise<FormState> => {
      const slotTime = formData.get("slotTime") as string;
      const customerPlanWalletId = formData.get("customerPlanWalletId") as string;
      const peopleVal = Number(formData.get("people")) || 1;
      const result = await createBooking({
        customerId,
        bookingDate: selectedDate,
        slotTime,
        bookingType: "PACKAGE_SESSION",
        customerPlanWalletId: customerPlanWalletId || undefined,
        people: peopleVal,
      });
      if (result.success) return { error: null, success: true, bookedTime: slotTime, bookedPeople: peopleVal };
      return { error: result.error, success: false, bookedTime: "", bookedPeople: 0 };
    },
    { error: null, success: false, bookedTime: "", bookedPeople: 0 }
  );

  const availableSlots = slots.filter((s) => s.isEnabled && s.available > 0);

  if (state.success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-base font-semibold text-green-800">預約成功</h2>
        <p className="mt-1 text-sm text-green-600">
          {selectedDate} {state.bookedTime}
          {state.bookedPeople > 1 && `（${state.bookedPeople} 人）`}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <a href="/book/new" className="rounded-lg bg-white px-4 py-2 text-sm text-green-700 border border-green-300 hover:bg-green-50">再次預約</a>
          <a href="/my-bookings" className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">查看我的預約</a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-xs text-earth-500">選擇時段</p>

      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{state.error}</div>
      )}

      {/* 人數選擇 */}
      <div>
        <label className="mb-1 block text-xs text-earth-500">預約人數</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPeople((p) => Math.max(1, p - 1))}
            disabled={people <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-earth-300 text-lg text-earth-600 hover:bg-earth-100 disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-[2rem] text-center text-lg font-bold text-earth-800">{people}</span>
          <button
            type="button"
            onClick={() => setPeople((p) => Math.min(4, p + 1))}
            disabled={people >= 4}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-earth-300 text-lg text-earth-600 hover:bg-earth-100 disabled:opacity-40"
          >
            +
          </button>
          <span className="text-xs text-earth-400">（最多 4 人）</span>
        </div>
        <input type="hidden" name="people" value={people} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slots.filter((s) => s.isEnabled).map((slot) => {
          const isFull = slot.available === 0;
          const notEnough = slot.available > 0 && slot.available < people;
          return (
            <label
              key={slot.startTime}
              className={`relative flex cursor-pointer flex-col items-center rounded-xl border p-3 text-center transition-colors ${
                isFull || notEnough
                  ? "cursor-not-allowed border-earth-200 bg-earth-50 opacity-50"
                  : "border-earth-200 bg-white hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
              }`}
            >
              <input type="radio" name="slotTime" value={slot.startTime} disabled={isFull || notEnough} className="sr-only" required />
              <span className="text-base font-bold">{slot.startTime}</span>
              <span className={`mt-0.5 text-xs ${isFull ? "text-red-500" : notEnough ? "text-yellow-500" : "text-earth-400"}`}>
                {isFull ? "已額滿" : `剩 ${slot.available} 位`}
              </span>
            </label>
          );
        })}
      </div>

      {availableSlots.length === 0 && (
        <p className="text-center text-sm text-earth-400">今日所有時段已額滿</p>
      )}

      {activeWallets.length > 1 && (
        <div>
          <label className="mb-1 block text-xs text-earth-500">使用課程</label>
          <select name="customerPlanWalletId" className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500">
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>{w.planName}（剩 {w.remainingSessions} 堂）</option>
            ))}
          </select>
        </div>
      )}
      {activeWallets.length === 1 && (
        <input type="hidden" name="customerPlanWalletId" value={activeWallets[0].id} />
      )}

      {availableSlots.length > 0 && (
        <button type="submit" disabled={pending} className="w-full rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60">
          {pending ? "預約中..." : `確認預約（${people} 人）`}
        </button>
      )}
    </form>
  );
}
