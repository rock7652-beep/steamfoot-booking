"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fetchDaySlots } from "@/server/actions/slots";
import {
  submitLiffTrialBooking,
  type SubmitLiffTrialBookingResult,
} from "@/server/actions/liff-trial-booking";
import { useBookingRequestKey } from "@/hooks/use-booking-request-key";
import type { SlotAvailability } from "@/types";

function taiwanToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function resultMessage(result: SubmitLiffTrialBookingResult): string {
  switch (result.status) {
    case "already_has_trial":
      return `你已經有一筆體驗預約：${result.existingBookingDate} ${result.existingSlotTime}`;
    case "no_customer":
      return "請先完成會員註冊或登入，再進行體驗預約。";
    case "profile_incomplete":
      return "請先補齊姓名與手機資料，再進行體驗預約。";
    case "slot_full":
      return "這個時段剛剛已額滿，請重新選擇。";
    case "slot_unavailable":
      return "這個時段目前無法預約，請重新選擇。";
    case "booking_limit_reached":
      return "目前預約數已達上限，請聯繫門市協助。";
    case "store_subscription_expired":
      return "門市目前暫時無法接受線上預約，請聯繫門市。";
    case "invalid_input":
    case "idempotency_key_reused":
    case "service_unavailable":
      return "預約暫時沒有完成，請稍後再試或聯繫門市。";
    case "ok":
      return "";
  }
}

export function ZhubeiTrialBookingForm() {
  const requestKey = useBookingRequestKey();
  const minDate = useMemo(taiwanToday, []);
  const [bookingDate, setBookingDate] = useState("");
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [slotTime, setSlotTime] = useState("");
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
      const result = await fetchDaySlots(date);
      setSlots(result.slots);
      if (result.slots.length === 0) {
        setMessage("這一天目前沒有可預約時段，請選擇其他日期。");
      }
    } catch {
      setMessage("目前無法取得可預約時段，請稍後再試。");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function submit() {
    if (!bookingDate || !slotTime || submitting) return;
    setSubmitting(true);
    setMessage("");

    try {
      const result = await submitLiffTrialBooking({
        bookingDate,
        slotTime,
        requestKey: requestKey.current(),
      });

      if (result.status === "ok") {
        requestKey.complete();
        setSuccess({ date: result.bookingDate, time: result.slotTime });
        return;
      }

      if (result.status === "idempotency_key_reused") {
        requestKey.handleError("IDEMPOTENCY_KEY_REUSED");
      }
      setMessage(resultMessage(result));
      if (result.status === "slot_full" || result.status === "slot_unavailable") {
        await loadSlots(bookingDate);
      }
    } catch {
      setMessage("預約暫時沒有完成，請稍後再試或聯繫門市。");
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
        <p className="mt-4 text-xs leading-5 text-earth-500">
          到店後由門市夥伴協助收款與完成服務，不會扣除任何正式方案堂數。
        </p>
        <a
          href="https://lin.ee/Nki2OjA"
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex h-11 items-center justify-center rounded-xl border border-primary-200 text-sm font-medium text-primary-700"
        >
          加入官方 LINE
        </a>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
      <label className="block text-sm font-medium text-earth-800" htmlFor="trial-date">
        1. 選擇日期
      </label>
      <input
        id="trial-date"
        type="date"
        min={minDate}
        value={bookingDate}
        onChange={(event) => void loadSlots(event.target.value)}
        className="mt-2 h-12 w-full rounded-xl border border-earth-200 px-3 text-base outline-none focus:border-primary-500"
      />

      <div className="mt-6">
        <p className="text-sm font-medium text-earth-800">2. 選擇可預約時段</p>
        {loadingSlots ? (
          <p className="mt-3 text-sm text-earth-500">正在讀取可預約時段…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {slots.map((slot) => {
              const available = slot.available;
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!available}
                  onClick={() => setSlotTime(slot.time)}
                  className={`min-h-11 rounded-xl border px-3 text-sm font-medium transition ${
                    slotTime === slot.time
                      ? "border-primary-600 bg-primary-50 text-primary-700"
                      : available
                        ? "border-earth-200 bg-white text-earth-700"
                        : "cursor-not-allowed border-earth-100 bg-earth-50 text-earth-300"
                  }`}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {message && (
        <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          {message}
          {message.includes("註冊或登入") && (
            <Link
              href="/s/zhubei/register?next=%2Fpricing%2Fexperience%2Fzhubei%2Fbook"
              className="mt-2 block font-semibold underline"
            >
              前往註冊／登入
            </Link>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!bookingDate || !slotTime || submitting}
        onClick={() => void submit()}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? "正在建立預約…" : "確認預約 NT$499 蒸足體驗"}
      </button>

      <p className="mt-3 text-center text-xs leading-5 text-earth-500">
        原價 NT$799，首次體驗優惠限尚未完成過首次體驗的顧客。
      </p>
    </section>
  );
}
