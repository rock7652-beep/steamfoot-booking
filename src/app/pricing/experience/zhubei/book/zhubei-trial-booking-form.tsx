"use client";

import { useMemo, useState } from "react";
import {
  fetchPublicTrialSlots,
  submitPublicTrialBooking,
  type PublicTrialBookingResult,
  type PublicTrialDayStatus,
} from "@/server/actions/public-trial-booking";
import type { SlotAvailability } from "@/types";

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
    case "slot_full": return "這個時段剛剛已額滿，請重新選擇。";
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

export function ZhubeiTrialBookingForm() {
  const minDate = useMemo(taiwanToday, []);
  const [bookingDate, setBookingDate] = useState("");
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [slotTime, setSlotTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<{ date: string; time: string } | null>(null);

  async function loadSlots(date: string) {
    setBookingDate(date);
    setSlotTime("");
    setMessage("");
    setSlots([]);
    if (!date) return;

    setLoadingSlots(true);
    try {
      const result = await fetchPublicTrialSlots(date);
      setSlots(result.slots);
      if (result.dayStatus !== "open") setMessage(dayStatusMessage(result.dayStatus));
    } catch {
      setMessage("目前無法取得可預約時段，請稍後再試。");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function submit() {
    if (!bookingDate || !slotTime || !name.trim() || !phone.trim() || submitting) return;
    setSubmitting(true);
    setMessage("");

    try {
      const result = await submitPublicTrialBooking({ name, phone, bookingDate, slotTime, website });
      if (result.status === "ok") {
        setSuccess({ date: result.bookingDate, time: result.slotTime });
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
        <p className="mt-2 text-sm text-earth-600">首次蒸足體驗 NT$499｜約 45 分鐘</p>
        <p className="mt-4 text-xs leading-5 text-earth-500">到店後再付款即可。這次預約不需要會員帳號，也不會扣除任何正式方案堂數。</p>
        <a href="https://lin.ee/Nki2OjA" target="_blank" rel="noreferrer" className="mt-5 flex h-11 items-center justify-center rounded-xl border border-primary-200 text-sm font-medium text-primary-700">加入官方 LINE（選填）</a>
      </section>
    );
  }

  const ready = bookingDate && slotTime && name.trim() && phone.trim();

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <label className="block text-sm font-medium text-earth-800" htmlFor="trial-date">1. 選擇日期</label>
      <input id="trial-date" type="date" min={minDate} value={bookingDate} onChange={(event) => void loadSlots(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-earth-200 px-3 text-base outline-none focus:border-primary-500" />
      <p className="mt-2 text-xs text-earth-500">日期會依竹北店的公休、進修與實際開放班表同步判斷。</p>

      <div className="mt-6">
        <p className="text-sm font-medium text-earth-800">2. 選擇時段</p>
        {loadingSlots ? (
          <p className="mt-3 text-sm text-earth-500">正在同步門市可預約時段…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {slots.map((slot) => {
              const available = slot.isEnabled && !slot.isPast && slot.available > 0;
              return (
                <button key={slot.startTime} type="button" disabled={!available} onClick={() => setSlotTime(slot.startTime)} className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition ${slotTime === slot.startTime ? "border-primary-600 bg-primary-50 text-primary-700" : available ? "border-earth-200 bg-white text-earth-700" : "cursor-not-allowed border-earth-100 bg-earth-50 text-earth-300"}`}>
                  {slot.startTime}
                  {!available ? "（已額滿）" : slot.available <= 2 ? `（剩 ${slot.available} 位）` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-4">
        <div><label className="block text-sm font-medium text-earth-800" htmlFor="trial-name">3. 姓名</label><input id="trial-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="請輸入姓名" className="mt-2 h-12 w-full rounded-xl border border-earth-200 px-3 text-base outline-none focus:border-primary-500" /></div>
        <div><label className="block text-sm font-medium text-earth-800" htmlFor="trial-phone">4. 手機</label><input id="trial-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="例如 0912-345-678" className="mt-2 h-12 w-full rounded-xl border border-earth-200 px-3 text-base outline-none focus:border-primary-500" /></div>
      </div>

      <div className="hidden" aria-hidden="true"><label htmlFor="website">網站</label><input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>

      {message && <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{message}</div>}

      <button type="button" disabled={!ready || submitting} onClick={() => void submit()} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "正在建立預約…" : "立即預約 NT$499 體驗"}</button>
      <p className="mt-3 text-center text-xs leading-5 text-earth-500">不用註冊、不用設密碼，到店後再付款。</p>
    </section>
  );
}
