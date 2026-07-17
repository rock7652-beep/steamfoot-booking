"use client";

import { useState, useCallback, useEffect, useActionState, useMemo } from "react";
import { fetchDaySlots } from "@/server/actions/slots";
import { fetchMonthAvailability } from "@/server/actions/slots";
import { createBooking } from "@/server/actions/booking";
import { createRecurringBookings } from "@/server/actions/recurring-booking";
import { generateWeeklyDateStrings, parseLocalDate, formatWeekdayZh } from "@/lib/date-utils";
import { buildRecurringPreview, formatRecurringWalletOption, recurringWeekOptions } from "@/lib/recurring-booking-preview";
import { useStoreSlugRequired } from "@/lib/store-context";
import { useBookingRequestKey } from "@/hooks/use-booking-request-key";
import type { SlotAvailability } from "@/types";
import type { MonthSlotInfo } from "@/server/actions/slots";

interface ActiveWallet {
  id: string;
  planId: string;
  planName: string;
  remainingSessions: number;
  /** 與 createRecurringBookings() 對齊：僅可實際保留的 WalletSession。 */
  recurringAvailableSessions: number;
  expiryDate: string | null;
}

interface MakeupCreditInfo {
  id: string;
  /** 台灣日期字串 "YYYY-MM-DD" 或 null（無期限） */
  expiredAt: string | null;
}

interface Props {
  customerId: string;
  activeWallets: ActiveWallet[];
  makeupCredits?: MakeupCreditInfo[];
  /** 顧客可預約到的日期（含當日，"YYYY-MM-DD"，台灣時間）。與後端 gate 同源。 */
  bookableUntil: string;
  weeklyRecurrenceEnabled: boolean;
  weeklyRecurrenceMaxWeeks: number;
}

type MonthDayInfo = { totalCapacity: number; totalBooked: number; slots: MonthSlotInfo[] };
type SlotBadge = {
  time: string;
  label: string | null;
  status: "available" | "full" | "insufficient";
};

export function BookingCalendarView({
  customerId,
  activeWallets,
  makeupCredits = [],
  bookableUntil,
  weeklyRecurrenceEnabled,
  weeklyRecurrenceMaxWeeks,
}: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 可預約到日期（含當日）。超過此日的時段尚未開放。
  const maxDate = parseLocalDate(bookableUntil);
  maxDate.setHours(0, 0, 0, 0);

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

  // 沿用原 teardown：關閉 bottom sheet
  const closeSheet = useCallback(() => {
    setSelectedDate(null);
    setSlots([]);
  }, []);

  // bottom sheet 開啟時鎖定背景捲動
  useEffect(() => {
    if (!selectedDate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedDate]);

  // 月曆計算
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const startDow = firstDay.getDay();

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

    const badges: SlotBadge[] = [];
    for (const s of enabledSlots) {
      const avail = s.capacity - s.booked;
      if (avail <= 0) {
        badges.push({ time: s.startTime, label: "額滿", status: "full" });
      } else if (avail < people) {
        // 可用名額不足以容納所選人數
        badges.push({
          time: s.startTime,
          label: "不可預約",
          status: "insufficient",
        });
      } else {
        badges.push({ time: s.startTime, label: null, status: "available" });
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
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-earth-200 bg-white px-4 py-4 shadow-sm">
        <span className="text-base font-semibold text-earth-800">預約人數</span>
        <button
          type="button"
          onClick={() => setPeople((p) => Math.max(1, p - 1))}
          disabled={people <= 1}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-earth-300 text-xl text-earth-800 hover:bg-earth-100 disabled:opacity-40"
          aria-label="減少人數"
        >
          &minus;
        </button>
        <span className="min-w-[2rem] text-center text-2xl font-bold text-earth-900">{people}</span>
        <button
          type="button"
          onClick={() => setPeople((p) => Math.min(4, p + 1))}
          disabled={people >= 4}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-earth-300 text-xl text-earth-800 hover:bg-earth-100 disabled:opacity-40"
          aria-label="增加人數"
        >
          +
        </button>
        <span className="text-sm text-earth-700">（最多 4 人）</span>
      </div>

      {/* 月曆 */}
      <div className="mb-5 rounded-2xl border border-earth-200 bg-white shadow-sm overflow-hidden">
        {/* 月份切換 */}
        <div className="flex items-center justify-between border-b border-earth-100 px-4 py-3">
          <button onClick={prevMonth} className="flex h-11 w-11 items-center justify-center rounded-lg text-earth-800 hover:bg-earth-100 transition" aria-label="上個月">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <span className="text-lg font-bold text-earth-900">{monthLabel}</span>
          <button onClick={nextMonth} className="flex h-11 w-11 items-center justify-center rounded-lg text-earth-800 hover:bg-earth-100 transition" aria-label="下個月">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {/* 星期標頭 */}
        <div className="grid grid-cols-7 border-b border-earth-100 bg-earth-50">
          {weekLabels.map((w) => (
            <div key={w} className="py-2 text-center text-sm font-semibold text-earth-700">{w}</div>
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
                className={`relative flex min-h-[92px] flex-col items-start border-b border-r border-earth-100 p-1.5 transition ${
                  isSelected
                    ? "bg-primary-600 text-white"
                    : disabled
                      ? "bg-earth-50 text-earth-400"
                      : "bg-white text-earth-800 hover:bg-primary-50"
                }`}
              >
                {/* 日期數字 + 狀態點 */}
                <div className="flex w-full items-center gap-1">
                  <span className={`text-base font-bold leading-none ${
                    isSelected ? "text-white" : isToday ? "text-primary-700" : ""
                  }`}>
                    {day}
                  </span>
                  {indicator && !isSelected && (
                    <span className={`h-2 w-2 rounded-full ${indicatorColors[indicator]}`} />
                  )}
                  {indicator && isSelected && (
                    <span className="h-2 w-2 rounded-full bg-white/80" />
                  )}
                  {isToday && !isSelected && (
                    <span className="ml-auto rounded bg-primary-100 px-1 text-xs font-bold leading-none text-primary-800">今</span>
                  )}
                </div>

                {/* 公休 badge */}
                {!disabled && isClosed && (
                  <span className={`mt-1 rounded px-1.5 py-0.5 text-xs font-semibold leading-tight ${
                    isSelected ? "bg-white/20 text-white" : "bg-earth-100 text-earth-800"
                  }`}>
                    公休
                  </span>
                )}

                {/* 時段 badges */}
                {!disabled && !isClosed && badges.length > 0 && (
                  <div className="mt-1 flex w-full flex-col gap-0.5 overflow-hidden">
                    {badges.map((b) => (
                      <span
                        key={b.time}
                        className={`truncate rounded px-1 py-0.5 text-xs font-semibold leading-tight ${
                          isSelected
                            ? b.status === "available" ? "bg-white/30 text-white" : "bg-white/20 text-white/80"
                            : b.status === "full"
                              ? "bg-red-50 text-red-700"
                              : b.status === "insufficient"
                                ? "bg-earth-100 text-earth-700"
                              : "bg-green-50 text-green-800"
                        }`}
                      >
                        {b.time}{b.label ? ` ${b.label}` : ""}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className={`text-xs font-semibold leading-tight ${
                        isSelected ? "text-white/80" : "text-earth-700"
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
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-earth-100 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-sm text-earth-700">充裕</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
              <span className="text-sm text-earth-700">快滿</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="text-sm text-earth-700">額滿</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-earth-100 px-1.5 text-sm font-medium text-earth-700">公休</span>
              <span className="text-sm text-earth-700">無時段</span>
            </div>
          </div>
        )}
      </div>

      {/* 可預約範圍提示 */}
      <div className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        目前開放預約至{" "}
        <strong>
          {maxDate.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })}
        </strong>
        。次月預約時段尚未開放，請等候店長通知。
      </div>

      {/* 時段選擇 — 由下方滑出的 bottom sheet */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 animate-sheet-overlay"
            onClick={closeSheet}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-earth-50 shadow-xl animate-sheet-up"
          >
            {/* sticky 標題列 + 關閉 X */}
            <div className="flex items-center gap-2 rounded-t-2xl border-b border-earth-100 bg-white px-4 py-3">
              <h3 className="text-lg font-bold text-earth-900">
                {parseLocalDate(selectedDate).toLocaleDateString("zh-TW", {
                  month: "long",
                  day: "numeric",
                })}（{formatWeekdayZh(selectedDate)}）
              </h3>
              <button
                type="button"
                onClick={closeSheet}
                aria-label="關閉"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-earth-600 hover:bg-earth-100 hover:text-earth-900"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* 可捲動內容 */}
            <div className="overflow-y-auto px-4 py-4">
              {loadingSlots ? (
                <div className="rounded-2xl border border-earth-200 bg-white py-10 text-center text-base text-earth-700">
                  載入時段中...
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-2xl border border-earth-200 bg-white py-10 text-center text-base text-earth-700">
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
                  bookableUntil={bookableUntil}
                  weeklyRecurrenceEnabled={weeklyRecurrenceEnabled}
                  weeklyRecurrenceMaxWeeks={weeklyRecurrenceMaxWeeks}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {!selectedDate && (
        <div className="py-8 text-center text-base text-earth-700">
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
  // 顧客流程不該觸發任何「僅限員工 / 僅限管理者 / 沒有此操作的權限」訊息；
  // 若仍出現，視為登入狀態異常或誤觸 staff guard，給顧客可懂的指引。
  // server 端 handleActionError 會 log 警告 + 堆疊，可後續追查實際 action。
  if (/僅限員工|僅限.*管理者|僅限店主|沒有此操作的權限/.test(msg)) {
    return "登入狀態異常，請登出後重新登入；若持續發生，請聯繫店家協助";
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
  bookableUntil,
  weeklyRecurrenceEnabled,
  weeklyRecurrenceMaxWeeks,
}: {
  customerId: string;
  selectedDate: string;
  slots: SlotAvailability[];
  activeWallets: ActiveWallet[];
  makeupCredits: MakeupCreditInfo[];
  initialPeople: number;
  bookableUntil: string;
  weeklyRecurrenceEnabled: boolean;
  weeklyRecurrenceMaxWeeks: number;
}) {
  const requestKey = useBookingRequestKey();
  const storeSlug = useStoreSlugRequired();
  const prefix = `/s/${storeSlug}`;
  // people 直接用 prop（無本地 setter）→ 跟著上方月曆人數即時變動，
  // 確保補課自動判斷（people===1）與送出人數一致。
  const people = initialPeople;
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState(activeWallets[0]?.id ?? "");
  const [isRecurring, setIsRecurring] = useState(false);
  const recurrenceOptions = useMemo(
    () => recurringWeekOptions(weeklyRecurrenceMaxWeeks),
    [weeklyRecurrenceMaxWeeks],
  );
  const [weeks, setWeeks] = useState(recurrenceOptions[0] ?? 2);
  const [recurrenceSlotsByDate, setRecurrenceSlotsByDate] = useState<Record<string, SlotAvailability[] | undefined>>({});
  const [loadedRecurringPreviewKey, setLoadedRecurringPreviewKey] = useState<string | null>(null);
  const isRecurringActive = isRecurring && recurrenceOptions.length > 0;
  const recurrenceDateStrings = useMemo(
    () => (isRecurringActive && selectedSlot ? generateWeeklyDateStrings(selectedDate, weeks) : []),
    [isRecurringActive, selectedDate, selectedSlot, weeks],
  );
  const recurringPreviewKey = `${selectedSlot ?? ""}|${recurrenceDateStrings.join("|")}`;
  const loadingRecurringPreview = isRecurringActive && !!selectedSlot && loadedRecurringPreviewKey !== recurringPreviewKey;
  const recurringPreview = useMemo(
    () => (isRecurringActive && selectedSlot ? buildRecurringPreview({
      bookingDate: selectedDate,
      weeks,
      slotTime: selectedSlot,
      people,
      bookableUntil,
      slotsByDate: recurrenceSlotsByDate,
    }) : []),
    [bookableUntil, isRecurringActive, people, recurrenceSlotsByDate, selectedDate, selectedSlot, weeks],
  );
  const recurrenceHasUnavailableDate = recurringPreview.some((occurrence) => !occurrence.available);

  useEffect(() => {
    if (!isRecurringActive || !selectedSlot) return;

    let cancelled = false;
    const dates = recurrenceDateStrings;
    Promise.all(dates.map(async (date) => {
      try {
        const result = await fetchDaySlots(date);
        return [date, result.slots] as const;
      } catch {
        return [date, undefined] as const;
      }
    })).then((entries) => {
      if (cancelled) return;
      setRecurrenceSlotsByDate(Object.fromEntries(entries));
      setLoadedRecurringPreviewKey(recurringPreviewKey);
    });

    return () => { cancelled = true; };
  }, [isRecurringActive, recurrenceDateStrings, recurringPreviewKey, selectedSlot]);
  // 補課券優先：people=N 時自動使用 min(有效券, N) 張，剩餘人數扣方案堂數。
  // 實際用哪幾張由 server (createBooking) 依最早到期自選 + 加鎖；client 不指定 creditId。
  // PR-A 的 recurring core 只支援 PACKAGE_SESSION；補課券不會列入整組扣抵。
  const willUseMakeup = !isRecurringActive && makeupCredits.length > 0;
  const makeupToUse = willUseMakeup ? Math.min(makeupCredits.length, people) : 0;
  const packagePeople = people - makeupToUse;
  const makeupExpiryLabel =
    willUseMakeup && makeupCredits[0]?.expiredAt
      ? makeupCredits[0].expiredAt.split("-").join("/")
      : null;
  const selectedWallet = activeWallets.find((wallet) => wallet.id === selectedWalletId) ?? activeWallets[0];
  const selectedPlanId = selectedWallet?.planId ?? "";
  const walletsForSelectedPlan = activeWallets.filter((wallet) => wallet.planId === selectedPlanId);

  type FormState = {
    error: string | null;
    success: boolean;
    bookedTime: string;
    bookedPeople: number;
    wasMakeup: boolean;
    recurringDates: string[];
  };
  const [state, action, pending] = useActionState(
    async (prev: FormState, formData: FormData): Promise<FormState> => {
      const slotTime = formData.get("slotTime") as string;
      const customerPlanWalletId = formData.get("customerPlanWalletId") as string;
      const peopleVal = Number(formData.get("people")) || 1;
      const isMakeup = formData.get("isMakeup") === "true";
      const recurrenceWeeks = Number(formData.get("weeks")) || 0;
      const selectedPlanWallet = activeWallets.find((wallet) => wallet.id === customerPlanWalletId) ?? activeWallets[0];

      const result = isRecurringActive
        ? await createRecurringBookings({
          customerId,
          bookingDate: selectedDate,
          slotTime,
          bookingType: "PACKAGE_SESSION",
          servicePlanId: selectedPlanWallet?.planId ?? "",
          customerPlanWalletId: customerPlanWalletId || undefined,
          people: peopleVal,
          weeks: recurrenceWeeks,
        }, { requestKey: requestKey.current(), source: "web-customer-recurring" })
        : await createBooking({
          customerId,
          bookingDate: selectedDate,
          slotTime,
          bookingType: "PACKAGE_SESSION",
          customerPlanWalletId: customerPlanWalletId || undefined,
          people: peopleVal,
          isMakeup: isMakeup || undefined,
        }, { requestKey: requestKey.current(), source: "web-customer" });
      if (result.success) {
        requestKey.complete();
        return {
          error: null,
          success: true,
          bookedTime: slotTime,
          bookedPeople: peopleVal,
          wasMakeup: isMakeup,
          recurringDates: isRecurringActive ? generateWeeklyDateStrings(selectedDate, recurrenceWeeks) : [],
        };
      }
      requestKey.handleError(result.error);
      return { error: result.error, success: false, bookedTime: "", bookedPeople: 0, wasMakeup: false, recurringDates: [] };
    },
    { error: null, success: false, bookedTime: "", bookedPeople: 0, wasMakeup: false, recurringDates: [] }
  );

  const availableSlots = slots.filter((s) => s.isEnabled && !s.isPast && s.available >= people);
  const selectedSlotInfo = selectedSlot
    ? slots.find((s) => s.startTime === selectedSlot)
    : undefined;
  const selectedSlotRemaining = selectedSlotInfo
    ? selectedSlotInfo.capacity - selectedSlotInfo.bookedCount
    : 0;
  const selectedSlotBookable =
    !!selectedSlotInfo &&
    !selectedSlotInfo.isPast &&
    selectedSlotRemaining > 0 &&
    people <= selectedSlotRemaining;

  // ── 客端 blocking validation ──
  const totalRemaining = (isRecurringActive ? walletsForSelectedPlan : activeWallets)
    .reduce(
      (sum, wallet) => sum + (isRecurringActive ? wallet.recurringAvailableSessions : wallet.remainingSessions),
      0,
    );

  // 票券期限檢查
  const walletsForDate = activeWallets.filter(
    (w) => w.remainingSessions > 0 && (!w.expiryDate || w.expiryDate >= selectedDate)
  );
  const recurrenceRequiredSessions = isRecurringActive ? people * weeks : packagePeople;
  const finalRecurringDate = recurrenceDateStrings.at(-1) ?? selectedDate;
  // 後端先檢查錢包能否覆蓋最後日期，再以 AVAILABLE WalletSession
  // 檢查堂數；前端維持同一順序，避免把堂數不足誤顯示成到期問題。
  const walletsForFinalDate = walletsForSelectedPlan.filter(
    (w) => !w.expiryDate || w.expiryDate >= finalRecurringDate,
  );
  const hasWalletForDate = isRecurringActive
    ? walletsForFinalDate.length > 0
    : packagePeople === 0 || walletsForDate.length > 0;

  // 人數 vs 剩餘堂數
  const hasEnoughSessions = totalRemaining >= recurrenceRequiredSessions;

  // 最晚到期日（用於提示）
  const latestExpiry = activeWallets
    .filter((w) => w.remainingSessions > 0 && w.expiryDate)
    .map((w) => w.expiryDate!)
    .sort()
    .pop();

  // 是否有 blocking error
  const blockingError = recurrenceRequiredSessions > 0 && !hasWalletForDate
    ? (latestExpiry
        ? `票券期限不足，您目前方案有效期限至 ${latestExpiry}，請選擇期限內日期或聯繫店家`
        : "票券已超過可使用期限，請聯繫店家協助")
    : recurrenceRequiredSessions > 0 && !hasEnoughSessions
    ? isRecurringActive
      ? `方案次數不足，循環預約共需 ${recurrenceRequiredSessions} 堂，目前方案次數僅剩 ${totalRemaining} 次`
      : `方案次數不足，無法預約 ${people} 人。目前可用補課 ${makeupToUse} 張、方案次數僅剩 ${totalRemaining} 次，請調整預約人數或聯繫店家`
    : null;

  if (state.success) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h2 className="text-xl font-bold text-earth-900">
          {state.recurringDates.length > 0 ? "每週固定預約成功" : state.wasMakeup ? "補課預約成功" : "預約成功"}
        </h2>
        {state.recurringDates.length > 0 ? (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left text-sm text-green-900">
            <p className="font-semibold">共建立 {state.recurringDates.length} 筆預約，扣除 {state.recurringDates.length * state.bookedPeople} 堂</p>
            <ul className="mt-2 space-y-1">
              {state.recurringDates.map((date) => (
                <li key={date}>✓ {date.replaceAll("-", "/")}（{formatWeekdayZh(date).replace("週", "")}）{state.bookedTime}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-base text-earth-800">
            {selectedDate} {state.bookedTime}
            {state.bookedPeople > 1 && ` / ${state.bookedPeople} 人`}
          </p>
        )}
        {state.wasMakeup && (
          <p className="mt-1 text-sm font-medium text-amber-700">
            已優先使用補課資格，剩餘人數依方案堂數處理。
          </p>
        )}
        <p className="mt-1 text-sm text-earth-700">記得準時到喔</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={`${prefix}/my-bookings`}
            className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            查看我的預約
          </a>
          <a
            href={`${prefix}/book/new`}
            className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-earth-300 px-6 text-base font-semibold text-earth-800 transition hover:bg-earth-50"
          >
            繼續預約
          </a>
          <a
            href={`${prefix}/book`}
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl px-5 text-base text-earth-700 transition hover:text-earth-900"
          >
            返回首頁
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
      {state.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-base font-semibold text-red-700">{friendlyError(state.error)}</p>
          {isTechnicalError(state.error) && (
            <p className="mt-1 text-sm text-red-700">若問題持續，請聯繫店家協助</p>
          )}
        </div>
      )}

      {/* 補課資格：有效券 >= people → 自動使用 N 張（不提供保留/切換）；不足則提示改人數/用方案 */}
      {willUseMakeup && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-base font-semibold text-amber-900">
            本次將使用 {makeupToUse} 張補課資格
            {packagePeople > 0 ? `，剩餘 ${packagePeople} 位扣方案` : "，不扣方案"}
          </p>
          {makeupExpiryLabel && (
            <p className="mt-1 text-sm text-amber-700">
              有效期限至 {makeupExpiryLabel}
            </p>
          )}
        </div>
      )}
      {/* server 依最早到期自選補課券 → client 不傳 makeupCreditId */}
      <input type="hidden" name="isMakeup" value={willUseMakeup ? "true" : "false"} />
      <input type="hidden" name="people" value={people} />
      {isRecurringActive && <input type="hidden" name="weeks" value={weeks} />}

      {/* 人數顯示（從月曆帶入） */}
      <div className="flex flex-wrap items-center gap-2 text-base text-earth-800">
        <span>預約人數：<strong className="text-earth-900">{people} 人</strong></span>
        <span className="text-sm text-earth-700">（可於上方月曆區調整）</span>
      </div>

      {weeklyRecurrenceEnabled && recurrenceOptions.length > 0 && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-4">
          <label className="flex cursor-pointer items-center gap-3 text-base font-semibold text-primary-900">
            <input
              type="checkbox"
              checked={isRecurring}
              disabled={pending}
              onChange={(event) => {
                setIsRecurring(event.target.checked);
                setLoadedRecurringPreviewKey(null);
              }}
              className="h-5 w-5 rounded border-primary-400 text-primary-600 focus:ring-primary-500"
            />
            每週重複預約
          </label>
          <p className="mt-1 text-sm text-primary-800">同一人數、同一時段，連續預約數週</p>

          {isRecurringActive && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-primary-900" htmlFor="recurrence-weeks">重複週數</label>
              <select
                id="recurrence-weeks"
                value={weeks}
                disabled={pending}
                onChange={(event) => {
                  setWeeks(Number(event.target.value));
                  setLoadedRecurringPreviewKey(null);
                }}
                className="h-11 w-full rounded-lg border border-primary-300 bg-white px-3 text-base text-earth-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {recurrenceOptions.map((option) => <option key={option} value={option}>{option} 週</option>)}
              </select>
              <p className="mt-2 text-sm text-primary-800">循環預約僅使用方案堂數，補課資格不會列入本次扣抵。</p>
            </div>
          )}
        </div>
      )}

      {/* 時段卡片 */}
      <div>
        <p className="mb-2 text-base font-semibold text-earth-800">選擇時段</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {slots.filter((s) => s.isEnabled).map((slot) => {
            const isPast = !!slot.isPast;
            const remaining = slot.capacity - slot.bookedCount;
            const isFull = !isPast && remaining <= 0;
            const notEnough = !isPast && remaining > 0 && people > remaining;
            const disabled = isPast || isFull || notEnough;
            const statusText = isPast
              ? "已過時段"
              : isFull
                ? "額滿"
                : notEnough
                  ? "此人數不可預約"
                  : null;
            return (
              <label
                key={slot.startTime}
                className={`relative flex min-h-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition-colors ${
                  disabled
                    ? "cursor-not-allowed border-earth-200 bg-earth-50 opacity-60"
                    : "border-earth-200 bg-white hover:border-primary-400 hover:bg-primary-50 has-[:checked]:border-primary-600 has-[:checked]:bg-primary-600 has-[:checked]:text-white"
                }`}
              >
                <input
                  type="radio"
                  name="slotTime"
                  value={slot.startTime}
                  disabled={disabled}
                  className="sr-only"
                  required
                  onChange={() => {
                    setSelectedSlot(slot.startTime);
                    setLoadedRecurringPreviewKey(null);
                  }}
                />
                <span className="text-lg font-bold">{slot.startTime}</span>
                {statusText && (
                  <span className={`mt-1 text-sm font-medium ${isPast ? "text-earth-700" : "text-red-600"}`}>
                    {statusText}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {availableSlots.length === 0 && (
        <p className="text-center text-base text-earth-700">今日所有時段已額滿</p>
      )}

      {packagePeople > 0 && activeWallets.length > 1 && (
        <div>
          <label className="mb-2 block text-base font-medium text-earth-800">使用課程</label>
          <select
            name="customerPlanWalletId"
            value={selectedWalletId}
            onChange={(event) => setSelectedWalletId(event.target.value)}
            className="w-full rounded-xl border border-earth-300 px-4 h-12 text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {isRecurringActive
                  ? formatRecurringWalletOption(w)
                  : `${w.planName}（剩 ${w.remainingSessions} 堂）`}
              </option>
            ))}
          </select>
        </div>
      )}
      {packagePeople > 0 && activeWallets.length === 1 && (
        <input type="hidden" name="customerPlanWalletId" value={activeWallets[0].id} />
      )}

      {isRecurringActive && selectedSlot && (
        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-4 text-base text-primary-900">
          <p className="font-semibold">將建立：</p>
          {loadingRecurringPreview ? (
            <p className="mt-2 text-sm">正在確認每週時段…</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {recurringPreview.map((occurrence) => (
                <li key={occurrence.date} className={occurrence.available ? "text-primary-900" : "font-medium text-red-700"}>
                  {occurrence.available ? "✓" : "✕"} {occurrence.date.replaceAll("-", "/")}（{formatWeekdayZh(occurrence.date).replace("週", "")}）{selectedSlot}
                  {!occurrence.available && ` ${occurrence.reason}`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 font-semibold">
            共建立 {weeks} 筆預約，共扣除 {weeks * people} 堂（此方案可用 {totalRemaining} 堂）
          </p>
          {!loadingRecurringPreview && recurrenceHasUnavailableDate && (
            <p className="mt-2 font-semibold text-red-700">無法建立循環預約；請選擇其他日期、時段或週數。</p>
          )}
        </div>
      )}

      {/* 預約確認摘要 */}
      {selectedSlotBookable && availableSlots.length > 0 && !isRecurringActive && (
        <div className={`rounded-xl border px-4 py-3 text-base ${willUseMakeup ? "border-amber-200 bg-amber-50 text-amber-900" : "border-primary-200 bg-primary-50 text-primary-800"}`}>
          <p className="font-semibold">{willUseMakeup ? "補課預約確認" : "預約確認"}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>日期：{selectedDate}</span>
            <span>時間：{selectedSlot}</span>
            <span>人數：{people} 人</span>
            {willUseMakeup && (
              <span className="font-semibold">
                （補課 {makeupToUse} 位{packagePeople > 0 ? `、方案 ${packagePeople} 位` : ""}）
              </span>
            )}
          </div>
        </div>
      )}

      {/* 阻擋性驗證提示 */}
      {blockingError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-base font-semibold text-red-700">{blockingError}</p>
        </div>
      )}

      {availableSlots.length > 0 && (
        <button
          type="submit"
          disabled={pending || !!blockingError || (isRecurringActive && (!selectedSlot || loadingRecurringPreview || recurrenceHasUnavailableDate))}
          className={`w-full min-h-[52px] rounded-xl px-4 text-base font-semibold text-white disabled:opacity-60 ${willUseMakeup ? "bg-amber-600 hover:bg-amber-700" : "bg-primary-600 hover:bg-primary-700"}`}
        >
          {pending ? "預約中..." : isRecurringActive ? `確認每週固定預約（${weeks} 週）` : willUseMakeup ? `確認補課優先預約（${people} 人）` : `確認預約（${people} 人）`}
        </button>
      )}
    </form>
  );
}
