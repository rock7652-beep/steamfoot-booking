"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchPublicTrialMonth,
  fetchPublicTrialSlots,
  submitPublicTrialBooking,
  type PublicTrialBookingResult,
  type PublicTrialCalendarDay,
  type PublicTrialDayStatus,
} from "@/server/actions/public-trial-booking";
import type { SlotAvailability } from "@/types";
import { createLatestRequestGate } from "@/lib/latest-request-gate";

function taiwanToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function resultMessage(result: PublicTrialBookingResult): string {
  switch (result.status) {
    case "invalid_input": return result.message;
    case "already_has_trial": return `這支手機已有首次體驗預約：${result.bookingDate} ${result.slotTime}`;
    case "slot_full": return "這個時段剩餘名額不足，請調整人數或重新選擇時段。";
    case "slot_unavailable": return "這個時段目前無法預約，請重新選擇。";
    case "store_unavailable": return "門市目前暫時無法接受線上預約，請用 LINE 聯繫我們。";
    case "limit_reached": return "目前線上預約已達上限，請用 LINE 聯繫門市協助。";
    case "service_unavailable": return "預約暫時沒有完成，請稍後再試或用 LINE 聯繫門市。";
    case "ok": return "";
  }
}

function dayStatusMessage(status: PublicTrialDayStatus): string {
  switch (status) {
    case "closed": return "這一天是門市公休日，請選擇其他日期。";
    case "training": return "這一天是門市進修日，暫停預約。";
    case "full": return "這一天的開放時段目前已額滿，請選擇其他日期。";
    case "no_duty": return "這一天尚未安排可預約班表，請選擇其他日期。";
    case "past": return "不能預約已經過去的日期。";
    case "store_unavailable": return "門市目前暫時無法接受線上預約，請用 LINE 聯繫我們。";
    case "open": return "";
  }
}

function dayBadge(status: PublicTrialDayStatus): string {
  switch (status) {
    case "open": return "可約";
    case "closed": return "公休";
    case "training": return "進修";
    case "full": return "額滿";
    case "no_duty": return "未開放";
    case "past": return "";
    case "store_unavailable": return "暫停";
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ZhubeiTrialBookingForm({
  entry,
  storeSlug = "zhubei",
  contactUrl = "https://lin.ee/Nki2OjA",
}: {
  entry?: string;
  storeSlug?: "zhubei" | "hsinchu" | "taichung";
  contactUrl?: string;
}) {
  const slotRequestGate = useRef(createLatestRequestGate()).current;
  const today = useMemo(taiwanToday, []);
  const initialMonth = useMemo(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }), [today]);
  const [viewYear, setViewYear] = useState(initialMonth.year);
  const [viewMonth, setViewMonth] = useState(initialMonth.month);
  const [calendarDays, setCalendarDays] = useState<PublicTrialCalendarDay[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [bookingDate, setBookingDate] = useState("");
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [slotTime, setSlotTime] = useState("");
  const [people, setPeople] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<{ date: string; time: string; people: number; expectedAmount: number } | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingCalendar(true);
    void fetchPublicTrialMonth(viewYear, viewMonth, entry, storeSlug)
      .then((result) => {
        if (active) setCalendarDays(result.days);
      })
      .catch(() => {
        if (active) setMessage("目前無法同步門市月曆，請稍後再試。");
      })
      .finally(() => {
        if (active) setLoadingCalendar(false);
      });
    return () => { active = false; };
  }, [entry, storeSlug, viewYear, viewMonth]);

  async function loadSlots(date: string) {
    const requestId = slotRequestGate.issue();
    setBookingDate(date);
    setSlotTime("");
    setPeople(1);
    setMessage("");
    setSlots([]);
    setLoadingSlots(true);
    try {
      const result = await fetchPublicTrialSlots(date, entry, storeSlug);
      if (!slotRequestGate.isCurrent(requestId)) return;
      setSlots(result.slots);
      if (result.dayStatus !== "open") setMessage(dayStatusMessage(result.dayStatus));
    } catch {
      if (slotRequestGate.isCurrent(requestId)) {
        setMessage("目前無法取得可預約時段，請稍後再試。");
      }
    } finally {
      if (slotRequestGate.isCurrent(requestId)) setLoadingSlots(false);
    }
  }

  function changeMonth(offset: number) {
    slotRequestGate.invalidate();
    const next = new Date(Date.UTC(viewYear, viewMonth - 1 + offset, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth() + 1);
    setBookingDate("");
    setSlotTime("");
    setPeople(1);
    setSlots([]);
    setMessage("");
  }

  function selectPeople(nextPeople: number) {
    setPeople(nextPeople);
    setMessage("");
    if (!slotTime) return;
    const selectedSlot = slots.find((slot) => slot.startTime === slotTime);
    if (selectedSlot && selectedSlot.available < nextPeople) {
      setSlotTime("");
      setMessage(`${selectedSlot.startTime} 目前只剩 ${selectedSlot.available} 位，請重新選擇可容納 ${nextPeople} 人的時段。`);
    }
  }

  async function submit() {
    if (!bookingDate || !slotTime || !people || !name.trim() || !phone.trim() || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await submitPublicTrialBooking({ name, phone, bookingDate, slotTime, people, website, entry, storeSlug });
      if (result.status === "ok") {
        setSuccess({
          date: result.bookingDate,
          time: result.slotTime,
          people: result.people,
          expectedAmount: result.expectedAmount,
        });
        return;
      }
      setMessage(resultMessage(result));
      if (result.status === "slot_full" || result.status === "slot_unavailable") await loadSlots(bookingDate);
    } catch {
      setMessage("預約暫時沒有完成，請稍後再試或用 LINE 聯繫門市。");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="mt-6 rounded-2xl border border-primary-100 bg-white p-6 text-center shadow-sm">
        <div className="text-3xl">✓</div>
        <h2 className="mt-3 text-xl font-bold text-earth-900">體驗預約成功</h2>
        <p className="mt-3 text-sm text-earth-600">{success.date}　{success.time}</p>
        <p className="mt-2 text-sm text-earth-600">預約人數：{success.people} 人</p>
        <p className="mt-2 text-sm font-semibold text-primary-700">到店付款：{formatCurrency(success.expectedAmount)}</p>
        <p className="mt-2 text-sm text-earth-600">首次蒸足體驗每人 NT$499｜約 45 分鐘</p>
        <p className="mt-4 text-xs leading-5 text-earth-500">到店後再付款即可。這次預約不需要會員帳號，也不會扣除任何正式方案堂數。</p>
        <a href={contactUrl} target="_blank" rel="noreferrer" className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-[#06C755] px-4 text-base font-bold text-white shadow-sm transition hover:bg-[#05b84d]">加入官方 LINE，接收預約提醒</a>
        <p className="mt-2 text-xs leading-5 text-earth-500">若原本已完成 LINE 綁定，系統會以既有身分發送體驗提醒；首次加入後，也可從 LINE 內取得專屬預約入口。</p>
      </section>
    );
  }

  const firstDow = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
  const isCurrentMonth = viewYear === initialMonth.year && viewMonth === initialMonth.month;
  const ready = bookingDate && slotTime && people && name.trim() && phone.trim();
  const expectedAmount = 499 * people;

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-earth-800">1. 選擇日期</p>
      <div className="mt-3 rounded-2xl border border-earth-100 p-3">
        <div className="flex items-center justify-between">
          <button type="button" disabled={isCurrentMonth} onClick={() => changeMonth(-1)} className="h-9 w-9 rounded-full border border-earth-200 text-earth-600 disabled:opacity-25" aria-label="上個月">‹</button>
          <p className="font-semibold text-earth-800">{viewYear} 年 {viewMonth} 月</p>
          <button type="button" onClick={() => changeMonth(1)} className="h-9 w-9 rounded-full border border-earth-200 text-earth-600" aria-label="下個月">›</button>
        </div>
        <div className="mt-3 grid grid-cols-7 text-center text-xs text-earth-400">
          {['日','一','二','三','四','五','六'].map((day) => <div key={day} className="py-2">{day}</div>)}
        </div>
        {loadingCalendar ? (
          <p className="py-10 text-center text-sm text-earth-500">正在同步門市月曆…</p>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, index) => <div key={`blank-${index}`} />)}
            {calendarDays.map((day) => {
              const selectable = day.status === "open";
              const selected = bookingDate === day.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={!selectable}
                  onClick={() => void loadSlots(day.date)}
                  className={`min-h-14 rounded-xl px-1 py-1 text-center transition ${selected ? "bg-primary-600 text-white" : selectable ? "border border-primary-100 bg-primary-50 text-earth-800" : "bg-earth-50 text-earth-300"}`}
                >
                  <span className="block text-sm font-semibold">{Number(day.date.slice(-2))}</span>
                  <span className={`mt-0.5 block text-[10px] ${selected ? "text-white/90" : selectable ? "text-primary-700" : "text-earth-400"}`}>{dayBadge(day.status)}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-earth-500">
          <span>可約：可選日期</span><span>公休／進修：不可選</span><span>額滿／未開放：不可選</span>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-earth-800">2. 選擇時段</p>
        {!bookingDate ? (
          <p className="mt-3 rounded-xl bg-earth-50 px-4 py-3 text-sm text-earth-500">請先從月曆選擇可預約日期。</p>
        ) : loadingSlots ? (
          <p className="mt-3 text-sm text-earth-500">正在同步門市可預約時段…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {slots.map((slot) => {
              const available = slot.isEnabled && !slot.isPast && slot.available > 0;
              return (
                <button key={slot.startTime} type="button" disabled={!available} onClick={() => { setSlotTime(slot.startTime); setPeople(1); setMessage(""); }} className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition ${slotTime === slot.startTime ? "border-primary-600 bg-primary-50 text-primary-700" : available ? "border-earth-200 bg-white text-earth-700" : "cursor-not-allowed border-earth-100 bg-earth-50 text-earth-300"}`}>
                  {slot.startTime}{!available ? "（已額滿）" : slot.available <= 2 ? `（剩 ${slot.available} 位）` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-earth-800">3. 預約人數</p>
        {!slotTime ? (
          <p className="mt-3 rounded-xl bg-earth-50 px-4 py-3 text-sm text-earth-500">請先選擇時段。</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[1, 2].map((count) => {
                const selectedSlot = slots.find((slot) => slot.startTime === slotTime);
                const disabled = !selectedSlot || selectedSlot.available < count;
                return (
                  <button
                    key={count}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectPeople(count)}
                    className={`h-11 rounded-xl border text-sm font-medium ${people === count ? "border-primary-600 bg-primary-50 text-primary-700" : disabled ? "cursor-not-allowed border-earth-100 bg-earth-50 text-earth-300" : "border-earth-200 bg-white text-earth-700"}`}
                  >
                    {count} 人
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">
              每人 NT$499，共 {people} 人，到店付款 <span className="font-semibold">{formatCurrency(expectedAmount)}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 grid gap-4">
        <div><label className="block text-sm font-medium text-earth-800" htmlFor="trial-name">4. 姓名</label><input id="trial-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="請輸入姓名" className="mt-2 h-12 w-full rounded-xl border border-earth-200 px-3 text-base outline-none focus:border-primary-500" /></div>
        <div><label className="block text-sm font-medium text-earth-800" htmlFor="trial-phone">5. 手機</label><input id="trial-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="例如 0912-345-678" className="mt-2 h-12 w-full rounded-xl border border-earth-200 px-3 text-base outline-none focus:border-primary-500" /></div>
      </div>

      <div className="hidden" aria-hidden="true"><label htmlFor="website">網站</label><input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
      {message && <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{message}</div>}
      <button type="button" disabled={!ready || submitting} onClick={() => void submit()} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "正在建立預約…" : `立即預約｜${formatCurrency(expectedAmount)}`}</button>
      <p className="mt-3 text-center text-xs leading-5 text-earth-500">不用註冊、不用設密碼，到店後再付款。</p>
    </section>
  );
}
