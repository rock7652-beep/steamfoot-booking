"use client";

import { useState, useCallback, useActionState } from "react";
import { fetchDaySlots } from "@/server/actions/slots";
import { createBooking } from "@/server/actions/booking";
import type { SlotAvailability } from "@/types";

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
}

interface MakeupCreditInfo {
  id: string;
  originalDate: string;
  originalSlot: string;
  expiredAt: string | null;
}

interface Props {
  customerId: string;
  activeWallets: ActiveWallet[];
  makeupCredits?: MakeupCreditInfo[];
}

export function BookingCalendarView({ customerId, activeWallets, makeupCredits = [] }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

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

      {/* 時段 */}
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
              makeupCredits={makeupCredits}
            />
          )}
        </div>
      )}

      {!selectedDate && (
        <div className="py-8 text-center text-sm text-earth-400">
          請先選擇日��
        </div>
      )}
    </div>
  );
}

// ── 時段選擇 + 預約表單（含補課支援） ──
function SlotBookingForm({
  customerId,
  selectedDate,
  slots,
  activeWallets,
  makeupCredits,
}: {
  customerId: string;
  selectedDate: string;
  slots: SlotAvailability[];
  activeWallets: ActiveWallet[];
  makeupCredits: MakeupCreditInfo[];
}) {
  const [people, setPeople] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [useMakeup, setUseMakeup] = useState(false);
  const [selectedCreditId, setSelectedCreditId] = useState(makeupCredits[0]?.id ?? "");

  type FormState = { error: string | null; success: boolean; bookedTime: string; bookedPeople: number; wasMakeup: boolean };
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData): Promise<FormState> => {
      const slotTime = formData.get("slotTime") as string;
      const customerPlanWalletId = formData.get("customerPlanWalletId") as string;
      const peopleVal = Number(formData.get("people")) || 1;
      const isMakeup = formData.get("isMakeup") === "true";
      const makeupCreditId = formData.get("makeupCreditId") as string;

      const result = await createBooking({
        customerId,
        bookingDate: selectedDate,
        slotTime,
        bookingType: "PACKAGE_SESSION",
        customerPlanWalletId: (!isMakeup && customerPlanWalletId) ? customerPlanWalletId : undefined,
        people: peopleVal,
        isMakeup: isMakeup || undefined,
        makeupCreditId: isMakeup ? makeupCreditId : undefined,
      });
      if (result.success) return { error: null, success: true, bookedTime: slotTime, bookedPeople: peopleVal, wasMakeup: isMakeup };
      return { error: result.error, success: false, bookedTime: "", bookedPeople: 0, wasMakeup: false };
    },
    { error: null, success: false, bookedTime: "", bookedPeople: 0, wasMakeup: false }
  );

  const availableSlots = slots.filter((s) => s.isEnabled && s.available > 0);

  if (state.success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-base font-semibold text-green-800">
          {state.wasMakeup ? "補課預約成功" : "預約成功"}
        </h2>
        <p className="mt-1 text-sm text-green-600">
          {selectedDate} {state.bookedTime}
          {state.bookedPeople > 1 && ` （${state.bookedPeople} 人）`}
          {state.wasMakeup && " （補課，不扣堂）"}
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

      {/* 補課切換 */}
      {makeupCredits.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useMakeup}
              onChange={(e) => setUseMakeup(e.target.checked)}
              className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="font-medium text-amber-800">使用補課資格（不扣堂）</span>
          </label>
          {useMakeup && (
            <div className="mt-2">
              <select
                value={selectedCreditId}
                onChange={(e) => setSelectedCreditId(e.target.value)}
                className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-sm text-amber-800"
              >
                {makeupCredits.map((c) => (
                  <option key={c.id} value={c.id}>
                    補課（原 {c.originalDate} {c.originalSlot} 未到）
                    {c.expiredAt && ` — 期限 ${c.expiredAt.slice(0, 10)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      <input type="hidden" name="isMakeup" value={useMakeup ? "true" : "false"} />
      <input type="hidden" name="makeupCreditId" value={useMakeup ? selectedCreditId : ""} />

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
            &minus;
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
              <input type="radio" name="slotTime" value={slot.startTime} disabled={isFull || notEnough} className="sr-only" required onChange={() => setSelectedSlot(slot.startTime)} />
              <span className="text-base font-bold">{slot.startTime}</span>
              <span className={`mt-0.5 text-xs ${isFull ? "text-red-500" : notEnough ? "text-yellow-500" : "text-earth-400"}`}>
                {isFull ? "已額滿" : notEnough ? "名���不足" : `剩 ${slot.available} 位`}
              </span>
            </label>
          );
        })}
      </div>

      {availableSlots.length === 0 && (
        <p className="text-center text-sm text-earth-400">今日所有時段已額滿</p>
      )}

      {!useMakeup && activeWallets.length > 1 && (
        <div>
          <label className="mb-1 block text-xs text-earth-500">使用課程</label>
          <select name="customerPlanWalletId" className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500">
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>{w.planName}（��� {w.remainingSessions} 堂）</option>
            ))}
          </select>
        </div>
      )}
      {!useMakeup && activeWallets.length === 1 && (
        <input type="hidden" name="customerPlanWalletId" value={activeWallets[0].id} />
      )}

      {/* 預約確認摘要 */}
      {selectedSlot && availableSlots.length > 0 && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${useMakeup ? "border-amber-200 bg-amber-50 text-amber-800" : "border-primary-200 bg-primary-50 text-primary-800"}`}>
          <p className="font-medium">{useMakeup ? "補課預約確認" : "預約確認"}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            <span>日期：{selectedDate}</span>
            <span>時間：{selectedSlot}</span>
            <span>人數：{people} 人</span>
            {useMakeup && <span className="font-medium">（不扣堂）</span>}
          </div>
        </div>
      )}

      {availableSlots.length > 0 && (
        <button type="submit" disabled={pending} className={`w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60 ${useMakeup ? "bg-amber-600 hover:bg-amber-700" : "bg-primary-600 hover:bg-primary-700"}`}>
          {pending ? "預約中..." : useMakeup ? `確認補課預約（${people} 人）` : `確認預約（${people} 人）`}
        </button>
      )}
    </form>
  );
}
