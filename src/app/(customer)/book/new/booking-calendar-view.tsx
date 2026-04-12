"use client";

import { useState, useCallback, useEffect, useActionState } from "react";
import { fetchDaySlots } from "@/server/actions/slots";
import { fetchMonthAvailability } from "@/server/actions/slots";
import { createBooking } from "@/server/actions/booking";
import type { SlotAvailability } from "@/types";
import type { MonthSlotInfo } from "@/server/actions/slots";

interface ActiveWallet {
  id: string;
  planName: string;
  remainingSessions: number;
  expiryDate: string | null;
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

type MonthDayInfo = { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] };

export function BookingCalendarView({ customerId, activeWallets, makeupCredits = [] }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [people, setPeople] = useState(1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-based
  const [monthData, setMonthData] = useState<Record<string, MonthDayInfo>>({});
  const [loadingMonth, setLoadingMonth] = useState(false);

  // 載入整月可預約概覽
  const loadMonth = useCallback(async (year: number, month: number) => {
    setLoadingMonth(true);
    try {
      const result = await fetchMonthAvailability(year, month + 1);
      setMonthData(result.days);
    } catch {
      setMonthData({});
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  useEffect(() => {
    loadMonth(calYear, calMonth);
  }, [calYear, calMonth, loadMonth]);

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
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      setSlots([]);
      return;
    }
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
    setSelectedDate(null);
    setSlots([]);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
    setSelectedDate(null);
    setSlots([]);
  };

  // 依人數計算某天的 slot badges（最多顯示 MAX_BADGES 筆）
  const MAX_BADGES = 3;

  const getDayBadges = (dateStr: string) => {
    const info = monthData[dateStr];
    if (!info) return { badges: [], extra: 0, isClosed: true };
    if (info.totalCapacity === 0) return { badges: [], extra: 0, isClosed: true };

    const enabledSlots = info.slots.filter((s) => s.capacity > 0);
    if (enabledSlots.length === 0) return { badges: [], extra: 0, isClosed: true };

    const badges: { time: string; label: string; isFull: boolean }[] = [];
    for (const s of enabledSlots) {
      const avail = s.capacity - s.booked;
      if (avail <= 0) {
        badges.push({ time: s.startTime, label: "滿", isFull: true });
      } else if (avail < people) {
        // 可用名額不足以容納所選人數
        badges.push({ time: s.startTime, label: "滿", isFull: true });
      } else {
        badges.push({ time: s.startTime, label: `${avail}位`, isFull: false });
      }
    }

    const shown = badges.slice(0, MAX_BADGES);
    const extra = badges.length - shown.length;
    return { badges: shown, extra, isClosed: false };
  };

  // 整體狀態指示（考慮人數）
  const getDayIndicator = (dateStr: string) => {
    const info = monthData[dateStr];
    if (!info || info.totalCapacity === 0) return null;
    // 計算以當前人數能預約的時段數
    const bookableSlots = info.slots.filter((s) => (s.capacity - s.booked) >= people);
    if (bookableSlots.length === 0) return "full";
    const totalAvail = info.slots.reduce((sum, s) => sum + Math.max(0, s.capacity - s.booked), 0);
    const ratio = totalAvail / info.totalCapacity;
    if (ratio <= 0.3) return "scarce";
    return "available";
  };

  const indicatorColors = {
    available: "bg-green-400",
    scarce: "bg-yellow-400",
    full: "bg-red-300",
  };

  return (
    <div>
      {/* 人數選擇 — 放在月曆上方，影響整個月曆顯示 */}
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm font-medium text-earth-700">預約人數</span>
        <button
          type="button"
          onClick={() => setPeople((p) => Math.max(1, p - 1))}
          disabled={people <= 1}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-earth-300 text-sm text-earth-600 hover:bg-earth-100 disabled:opacity-40"
        >
          &minus;
        </button>
        <span className="min-w-[1.5rem] text-center text-base font-bold text-earth-800">{people}</span>
        <button
          type="button"
          onClick={() => setPeople((p) => Math.min(4, p + 1))}
          disabled={people >= 4}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-earth-300 text-sm text-earth-600 hover:bg-earth-100 disabled:opacity-40"
        >
          +
        </button>
        <span className="text-xs text-earth-400">（最多 4 人）</span>
      </div>

      {/* 月曆 */}
      <div className="mb-4 rounded-xl border border-earth-200 bg-white shadow-sm overflow-hidden">
        {/* 月份切換 */}
        <div className="flex items-center justify-between border-b border-earth-100 px-4 py-3">
          <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-earth-500 hover:bg-earth-100 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="text-sm font-bold text-earth-800">{monthLabel}</span>
          <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg text-earth-500 hover:bg-earth-100 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* 星期標頭 */}
        <div className="grid grid-cols-7 border-b border-earth-100 bg-earth-50">
          {weekLabels.map((w) => (
            <div key={w} className="py-2 text-center text-xs font-medium text-earth-400">{w}</div>
          ))}
        </div>

        {/* 日期格 */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="min-h-[72px] border-b border-r border-earth-100" />;
            const dateObj = new Date(calYear, calMonth, day);
            dateObj.setHours(0, 0, 0, 0);
            const isPast = dateObj < today;
            const isBeyond = dateObj > maxDate;
            const disabled = isPast || isBeyond;
            const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isSelected = dateStr === selectedDate;
            const isToday = dateObj.getTime() === today.getTime();
            const indicator = !disabled ? getDayIndicator(dateStr) : null;
            const { badges, extra, isClosed } = !disabled ? getDayBadges(dateStr) : { badges: [], extra: 0, isClosed: false };

            return (
              <button
                key={day}
                disabled={disabled}
                onClick={() => handleSelectDate(dateStr)}
                className={`relative flex min-h-[72px] flex-col items-start border-b border-r border-earth-100 p-1 transition ${
                  isSelected
                    ? "bg-primary-600 text-white"
                    : disabled
                      ? "bg-earth-50 text-earth-300"
                      : "bg-white text-earth-700 hover:bg-primary-50"
                }`}
              >
                {/* 日期數字 + 狀態點 */}
                <div className="flex w-full items-center gap-0.5">
                  <span className={`text-xs leading-none ${
                    isSelected ? "font-bold text-white" : isToday ? "font-bold text-primary-600" : ""
                  }`}>
                    {day}
                  </span>
                  {indicator && !isSelected && (
                    <span className={`h-1.5 w-1.5 rounded-full ${indicatorColors[indicator]}`} />
                  )}
                  {indicator && isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                  )}
                  {isToday && !isSelected && (
                    <span className="text-[7px] leading-none text-primary-400 ml-auto">今天</span>
                  )}
                </div>

                {/* 公休 badge */}
                {!disabled && isClosed && (
                  <span className={`mt-0.5 rounded px-1 text-[8px] leading-tight ${
                    isSelected ? "bg-white/20 text-white/80" : "bg-earth-100 text-earth-400"
                  }`}>
                    公休
                  </span>
                )}

                {/* 時段 badges */}
                {!disabled && !isClosed && badges.length > 0 && (
                  <div className="mt-0.5 flex w-full flex-col gap-px overflow-hidden">
                    {badges.map((b) => (
                      <span
                        key={b.time}
                        className={`truncate rounded px-0.5 text-[7px] leading-tight ${
                          isSelected
                            ? b.isFull ? "bg-white/20 text-white/60" : "bg-white/25 text-white"
                            : b.isFull
                              ? "bg-red-50 text-red-400"
                              : "bg-green-50 text-green-600"
                        }`}
                      >
                        {b.time} {b.label}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className={`text-[7px] leading-tight ${
                        isSelected ? "text-white/60" : "text-earth-300"
                      }`}>
                        +{extra}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* 圖例 */}
        {!loadingMonth && (
          <div className="flex items-center justify-center gap-4 border-t border-earth-100 px-4 py-2">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-[10px] text-earth-400">充裕</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
              <span className="text-[10px] text-earth-400">快滿</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-300" />
              <span className="text-[10px] text-earth-400">額滿</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="rounded bg-earth-100 px-1 text-[8px] text-earth-400">公休</span>
              <span className="text-[10px] text-earth-400">無時段</span>
            </div>
          </div>
        )}
      </div>

      {/* 時段展開區 */}
      {selectedDate && (
        <div className="animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-earth-800">
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("zh-TW", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </h3>
            <button
              onClick={() => { setSelectedDate(null); setSlots([]); }}
              className="ml-auto text-xs text-earth-400 hover:text-earth-600"
            >
              收合
            </button>
          </div>

          {loadingSlots ? (
            <div className="rounded-xl border border-earth-200 bg-white py-8 text-center text-sm text-earth-400">
              載入時段中...
            </div>
          ) : slots.length === 0 ? (
            <div className="rounded-xl border border-earth-200 bg-white py-8 text-center text-sm text-earth-400">
              該日無可用時段
            </div>
          ) : (
            <SlotBookingForm
              customerId={customerId}
              selectedDate={selectedDate}
              slots={slots}
              activeWallets={activeWallets}
              makeupCredits={makeupCredits}
              initialPeople={people}
            />
          )}
        </div>
      )}

      {!selectedDate && (
        <div className="py-6 text-center text-sm text-earth-400">
          請點選日期查看時段
        </div>
      )}
    </div>
  );
}

// ── 錯誤訊息友善化 ──

/** 判斷是否為技術性錯誤（不應直接暴露給顧客） */
function isTechnicalError(msg: string): boolean {
  return /FORBIDDEN|UNAUTHORIZED|STORE_ACCESS|Prisma|prisma|null|undefined|constraint|storeId/i.test(msg);
}

/** 將 server error 轉為顧客可理解文案 */
function friendlyError(msg: string): string {
  if (/FORBIDDEN_STORE_ACCESS|無權存取/i.test(msg)) {
    return "目前預約資料載入異常，請重新整理後再試";
  }
  if (/UNAUTHORIZED|登入|session/i.test(msg)) {
    return "登入已過期，請重新登入後再試";
  }
  if (/storeId|店舖資訊/i.test(msg)) {
    return "系統設定異常，請登出後重新登入";
  }
  if (/Prisma|prisma|constraint|null/i.test(msg)) {
    return "目前預約資料載入異常，請稍後再試";
  }
  // 業務規則錯誤直接顯示（已是中文友善文案）
  return msg;
}

// ── 時段選擇 + 預約表單（含補課支援） ──
function SlotBookingForm({
  customerId,
  selectedDate,
  slots,
  activeWallets,
  makeupCredits,
  initialPeople,
}: {
  customerId: string;
  selectedDate: string;
  slots: SlotAvailability[];
  activeWallets: ActiveWallet[];
  makeupCredits: MakeupCreditInfo[];
  initialPeople: number;
}) {
  const [people] = useState(initialPeople);
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

  const availableSlots = slots.filter((s) => s.isEnabled && !s.isPast && s.available >= people);

  // ── 客端 blocking validation ──
  const totalRemaining = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);

  // 票券期限檢查
  const walletsForDate = activeWallets.filter(
    (w) => w.remainingSessions > 0 && (!w.expiryDate || w.expiryDate >= selectedDate)
  );
  const hasWalletForDate = useMakeup || walletsForDate.length > 0;

  // 人數 vs 剩餘堂數
  const hasEnoughSessions = useMakeup || totalRemaining >= people;

  // 最晚到期日（用於提示）
  const latestExpiry = activeWallets
    .filter((w) => w.remainingSessions > 0 && w.expiryDate)
    .map((w) => w.expiryDate!)
    .sort()
    .pop();

  // 是否有 blocking error
  const blockingError = !useMakeup && !hasWalletForDate
    ? (latestExpiry
        ? `票券期限不足，您目前方案有效期限至 ${latestExpiry}，請選擇期限內日期或聯繫店家`
        : "票券已超過可使用期限，請聯繫店家協助")
    : !useMakeup && !hasEnoughSessions
    ? `方案次數不足，無法預約 ${people} 人。目前可使用次數僅剩 ${totalRemaining} 次，請調整預約人數或聯繫店家`
    : null;

  if (state.success) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h2 className="text-lg font-semibold text-earth-900">
          {state.wasMakeup ? "補課預約成功" : "預約成功"}
        </h2>
        <p className="mt-1.5 text-sm text-earth-500">
          {selectedDate} {state.bookedTime}
          {state.bookedPeople > 1 && ` / ${state.bookedPeople} 人`}
          {state.wasMakeup && " / 補課不扣堂"}
        </p>
        <p className="mt-1 text-xs text-earth-400">記得準時到喔</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href="/my-bookings"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
          >
            查看我的預約
          </a>
          <a
            href="/book/new"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-earth-200 px-5 py-2.5 text-sm font-medium text-earth-600 transition hover:bg-earth-50"
          >
            繼續預約
          </a>
          <a
            href="/book"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm text-earth-400 transition hover:text-earth-600"
          >
            返回首頁
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-earth-200 bg-white p-4 shadow-sm">
      {state.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">{friendlyError(state.error)}</p>
          {isTechnicalError(state.error) && (
            <p className="mt-1 text-xs text-red-500">若問題持續，請聯繫店家協助</p>
          )}
        </div>
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
      <input type="hidden" name="people" value={people} />

      {/* 人數顯示（從月曆帶入） */}
      <div className="flex items-center gap-2 text-sm text-earth-600">
        <span>預約人數：<strong className="text-earth-800">{people} 人</strong></span>
        <span className="text-[10px] text-earth-400">（可於上方月曆區調整）</span>
      </div>

      {/* 時段卡片 */}
      <div>
        <p className="mb-2 text-xs text-earth-500">選擇時段</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.filter((s) => s.isEnabled).map((slot) => {
            const isPast = !!slot.isPast;
            const isFull = !isPast && slot.available === 0;
            const notEnough = !isPast && slot.available > 0 && slot.available < people;
            const disabled = isPast || isFull || notEnough;
            return (
              <label
                key={slot.startTime}
                className={`relative flex cursor-pointer flex-col items-center rounded-xl border p-3 text-center transition-colors ${
                  disabled
                    ? "cursor-not-allowed border-earth-200 bg-earth-50 opacity-50"
                    : "border-earth-200 bg-white hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
                }`}
              >
                <input type="radio" name="slotTime" value={slot.startTime} disabled={disabled} className="sr-only" required onChange={() => setSelectedSlot(slot.startTime)} />
                <span className="text-base font-bold">{slot.startTime}</span>
                <span className={`mt-0.5 text-xs ${isPast ? "text-earth-400" : isFull ? "text-red-500" : notEnough ? "text-red-400" : "text-earth-400"}`}>
                  {isPast ? "已過時段" : isFull ? "滿" : notEnough ? "滿" : `${slot.available}位`}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {availableSlots.length === 0 && (
        <p className="text-center text-sm text-earth-400">今日所有時段已額滿</p>
      )}

      {!useMakeup && activeWallets.length > 1 && (
        <div>
          <label className="mb-1 block text-xs text-earth-500">使用課程</label>
          <select name="customerPlanWalletId" className="w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500">
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>{w.planName}（剩 {w.remainingSessions} 堂）</option>
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

      {/* 阻擋性驗證提示 */}
      {blockingError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">{blockingError}</p>
        </div>
      )}

      {availableSlots.length > 0 && (
        <button
          type="submit"
          disabled={pending || !!blockingError}
          className={`w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60 ${useMakeup ? "bg-amber-600 hover:bg-amber-700" : "bg-primary-600 hover:bg-primary-700"}`}
        >
          {pending ? "預約中..." : useMakeup ? `確認補課預約（${people} 人）` : `確認預約（${people} 人）`}
        </button>
      )}
    </form>
  );
}
