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
import type { TrialNotificationSetup } from "@/server/services/trial-notification-binding";
import { ZHUBEI_PUBLIC_TRIAL_LIFF_URL } from "@/lib/liff/public-trial-config";

function DirectTrialLiffEntry() {
  useEffect(() => {
    // Enter through LINE's canonical LIFF URL, not initLiff on the public
    // marketing URL (which is outside the registered LIFF endpoint).
    window.location.replace(ZHUBEI_PUBLIC_TRIAL_LIFF_URL);
  }, []);
  return <section className="mt-6 rounded-2xl border border-primary-100 bg-white p-6 text-center">
    <h2 className="text-xl font-bold text-earth-900">正在開啟體驗預約</h2>
    <a href={ZHUBEI_PUBLIC_TRIAL_LIFF_URL} className="mt-4 inline-flex min-h-11 items-center text-primary-700 underline">未自動開啟？點此繼續</a>
  </section>;
}

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
  successGuideId = "first-visit-guide",
  lineTrialPilot = false,
}: {
  entry?: string;
  storeSlug?: "zhubei" | "hsinchu" | "taichung";
  contactUrl?: string;
  successGuideId?: string;
  lineTrialPilot?: boolean;
}) {
  const pilot = storeSlug === "zhubei" && lineTrialPilot;
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
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState<{ date: string; time: string; people: number; expectedAmount: number; notificationSetup?: TrialNotificationSetup } | null>(null);

  useEffect(() => {
    if (!success || (success.notificationSetup && success.notificationSetup.status !== "linked")) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById(successGuideId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [success, successGuideId]);

  useEffect(() => {
    if (pilot && !entry) return;
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
  }, [entry, storeSlug, viewYear, viewMonth, pilot]);

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
    if (!noticeAccepted) {
      setMessage("請先閱讀並勾選蒸足前須知與貼心提醒。");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const result = await submitPublicTrialBooking({ name, phone, bookingDate, slotTime, people, website, entry, storeSlug, noticeAccepted, lineTrialPilot: pilot });
      if (result.status === "ok") {
        setSuccess({
          date: result.bookingDate,
          time: result.slotTime,
          people: result.people,
          expectedAmount: result.expectedAmount,
          notificationSetup: result.notificationSetup,
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
        <p className="mt-4 rounded-xl bg-primary-50 px-4 py-3 text-sm leading-6 text-primary-800">以下是第一次到店前需要知道的事項，建議先看完並儲存門市導航。</p>
        <a href={`#${successGuideId}`} className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-primary-200 px-4 text-base font-bold text-primary-700">查看到店前提醒</a>
        {success.notificationSetup ? <div className="mt-5 rounded-xl border border-primary-100 p-4" aria-live="polite">
          <p className="font-semibold text-primary-800">{success.notificationSetup?.status === "linked" ? "LINE 通知已連結" : "預約已成功，LINE 通知尚未完成設定"}</p>
          {success.notificationSetup?.status === "pending" ? <>
            <p className="mt-2 text-sm leading-6 text-earth-600">不用再輸入電話、不用儲值。請用手機開啟 LINE，將自動帶入的驗證訊息按「送出」，看到「通知設定完成」即可。請勿轉傳此專屬連結。</p>
            <a href={success.notificationSetup.url} rel="noreferrer" className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-[#06C755] px-4 text-base font-bold text-white">開啟 LINE 完成通知設定</a>
            <p className="mt-2 text-xs leading-5 text-earth-500">連結限 24 小時內使用。尚未加好友請先加入；請保持未封鎖，才能接收後續提醒。電腦填表者請將此頁的按鈕連結傳到自己的手機開啟。</p>
          </> : <>
            <p className="mt-2 text-sm leading-6 text-earth-600">{success.notificationSetup?.status === "linked" ? "不必再輸入電話。請保持本店 LINE 好友且未封鎖，系統會依預約與店家設定安排提醒。" : "您的時段已保留。通知身分需要門市協助確認；加入好友本身不代表已完成通知綁定。"}</p>
            <a href={contactUrl} target="_blank" rel="noreferrer" className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-primary-200 px-4 text-base font-bold text-primary-700">聯繫官方 LINE</a>
          </>}
        </div> : <>
          <a href={contactUrl} target="_blank" rel="noreferrer" className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-[#06C755] px-4 text-base font-bold text-white">加入官方 LINE，接收預約提醒</a>
          <p className="mt-2 text-xs leading-5 text-earth-500">若原本已完成 LINE 綁定，系統會以既有身分發送體驗提醒；首次加入後，也可從 LINE 內取得專屬預約入口。</p>
        </>}
      </section>
    );
  }

  if (pilot && !entry) {
    return <DirectTrialLiffEntry />;
  }

  const firstDow = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
  const isCurrentMonth = viewYear === initialMonth.year && viewMonth === initialMonth.month;
  const ready = bookingDate && slotTime && people && name.trim() && phone.trim() && noticeAccepted;
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

      <section aria-labelledby="trial-notice-title" className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/60 p-4 sm:p-5">
        <h3 id="trial-notice-title" className="font-semibold text-primary-800">6. 蒸足前須知與貼心提醒</h3>
        <p className="mt-3 text-sm font-semibold text-earth-800">預約前，請先留意自己是否有以下狀況：</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-earth-700">
          <li>目前懷孕中。</li>
          <li>腳部有傷口、破皮或尚未癒合的部位。</li>
          <li>近期接受手術，仍在術後療養中。</li>
          <li>腳部有香港腳、黴菌感染或其他皮膚疾病，正在治療中。</li>
        </ul>
        <p className="mt-3 text-sm leading-6 text-earth-700">若有上述狀況，請於預約前先聯繫門市，並諮詢醫療人員是否適合蒸足；請勿僅因已告知或勾選就直接進行體驗。體驗中如有任何不適，請立即停止並告知現場人員。</p>
        <a href={contactUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 underline underline-offset-4">有上述狀況？先用 LINE 聯繫門市</a>
        <div className="mt-4 border-t border-primary-100 pt-4">
          <h4 className="text-sm font-semibold text-earth-800">貼心提醒｜建議攜帶物品</h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-earth-700">
            <li>可依個人衛生與穿著習慣，自備短袖、短褲，於蒸足時穿著。</li>
            <li>女性顧客可依需要，多準備一件內衣替換。</li>
            <li>攜帶襪子、長褲或長內搭褲，於蒸足後換穿。</li>
          </ul>
          <p className="mt-2 text-sm leading-6 text-earth-700">蒸足後可先擦乾汗水、更換乾爽衣物，並依個人感受適度保暖。</p>
        </div>
        {people > 1 && <p className="mt-4 text-sm font-medium leading-6 text-primary-800">兩人同行：請將以上須知與攜帶物品提醒轉告同行者；每位體驗者如有上述狀況，都需事先告知門市。</p>}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-primary-200 bg-white p-4 text-sm leading-6 text-earth-800">
          <input type="checkbox" checked={noticeAccepted} disabled={submitting} onChange={(event) => setNoticeAccepted(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#557969]" />
          <span>我已閱讀蒸足前須知與貼心提醒，若有上述身體狀況，會於體驗前主動告知門市。<span className="ml-1 font-semibold text-primary-700">（必填）</span></span>
        </label>
        {!noticeAccepted && <p className="mt-2 text-xs leading-5 text-earth-600">請先勾選閱讀確認，才可送出預約。</p>}
      </section>

      <div className="hidden" aria-hidden="true"><label htmlFor="website">網站</label><input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
      {message && <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{message}</div>}
      <button type="button" disabled={!ready || submitting} onClick={() => void submit()} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "正在建立預約…" : `立即預約｜${formatCurrency(expectedAmount)}`}</button>
      <p className="mt-3 text-center text-xs leading-5 text-earth-500">不用註冊、不用設密碼，到店後再付款。</p>
    </section>
  );
}
