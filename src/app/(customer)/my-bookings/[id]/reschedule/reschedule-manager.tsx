"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useStoreSlugRequired } from "@/lib/store-context";
import { createLatestRequestGate } from "@/lib/latest-request-gate";
import {
  getCustomerBookingRescheduleStatus,
  listCustomerBookingRescheduleSlots,
  rescheduleCustomerBooking,
} from "@/server/actions/customer-booking-reschedule";

interface Props {
  bookingId: string;
}

export function CustomerBookingRescheduleManager({ bookingId }: Props) {
  const storeSlug = useStoreSlugRequired();
  const prefix = `/s/${storeSlug}`;
  const [date, setDate] = useState("");
  const [current, setCurrent] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [canReschedule, setCanReschedule] = useState(false);
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [pending, startTransition] = useTransition();
  const [slotRequestGate] = useState(createLatestRequestGate);

  useEffect(() => {
    void getCustomerBookingRescheduleStatus(bookingId)
      .then((status) => {
        if (!status) {
          setMessage("無法取得這筆預約，請重新登入或聯絡店家。");
          return;
        }
        setDate(status.bookingDate);
        setCurrent(`${status.bookingDate} ${status.slotTime}`);
        setCanReschedule(status.canReschedule);
        setMinDate(status.todayDate);
        setMaxDate(status.bookableUntilDate);
        if (status.canReschedule) {
          const requestId = slotRequestGate.issue();
          setLoadingSlots(true);
          void listCustomerBookingRescheduleSlots(bookingId, status.bookingDate)
            .then((next) => {
              if (!slotRequestGate.isCurrent(requestId)) return;
              setSlots(next);
              setLoadingSlots(false);
              setMessage(next.length === 0 ? "這一天目前沒有開放或可預約的時段，請選擇其他日期。" : "");
            })
            .catch(() => {
              if (slotRequestGate.isCurrent(requestId)) {
                setLoadingSlots(false);
                setMessage("目前無法取得可改期時段，請稍後再試。");
              }
            });
        }
        if (!status.canReschedule) {
          const reasonMessage = {
            already_rescheduled: "這筆預約已自行改期一次，如需再次調整請聯絡店家。",
            inside_cutoff: "距離預約 12 小時內無法自行改期，請聯絡店家協助。",
            makeup_booking: "補課預約目前需由店家協助改期。",
            inactive_booking: "這筆預約目前不是可改期狀態，請聯絡店家協助。",
          } as const;
          setMessage(
            status.unavailableReason
              ? reasonMessage[status.unavailableReason]
              : "目前無法自行改期，請聯絡店家協助。",
          );
        }
      })
      .catch(() => setMessage("目前無法取得預約資訊，請稍後再試。"));
  }, [bookingId, slotRequestGate]);

  async function loadSlots(nextDate: string) {
    if (!nextDate || !canReschedule) return;
    const requestId = slotRequestGate.issue();
    setLoadingSlots(true);
    setSlots([]);
    setSelected("");
    try {
      const next = await listCustomerBookingRescheduleSlots(bookingId, nextDate);
      if (slotRequestGate.isCurrent(requestId)) {
        setSlots(next);
        setLoadingSlots(false);
        if (next.length === 0) setMessage("這一天目前沒有開放或可預約的時段，請選擇其他日期。");
        else setMessage("");
      }
    } catch {
      if (slotRequestGate.isCurrent(requestId)) {
        setLoadingSlots(false);
        setMessage("目前無法取得可改期時段，請稍後再試。");
      }
    }
  }

  function submit() {
    if (!selected || pending) return;
    startTransition(async () => {
      try {
        const result = await rescheduleCustomerBooking(bookingId, date, selected);
        if (result === "rescheduled") {
          setCurrent(`${date} ${selected}`);
          setCanReschedule(false);
          setSlots([]);
          setSelected("");
          setMessage("改期完成，預約時間已更新。");
        } else if (result === "slot_full") {
          setSelected("");
          setMessage("這個時段剛好額滿，請重新選擇。");
          await loadSlots(date);
        } else {
          setMessage("目前無法自行改期，請確認距離預約仍有 12 小時以上，或聯絡店家協助。");
        }
      } catch {
        setMessage("改期未完成，原預約時間沒有變更，請稍後再試。");
      }
    });
  }

  return (
    <div className="py-6">
      <div className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-earth-900">更改預約時間</h1>
        <p className="mt-2 text-sm text-earth-600">每筆預約可自行改期一次，且須在原預約與新時段的 12 小時以前完成。</p>
        {current && <p className="mt-4 rounded-xl bg-earth-50 p-3 text-earth-800">目前預約：<strong>{current}</strong></p>}
        {message && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}

        {canReschedule && (
          <>
            <label htmlFor="reschedule-date" className="mt-5 block text-sm font-semibold text-earth-800">選擇新日期</label>
            <input
              id="reschedule-date"
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              disabled={pending || loadingSlots}
              onChange={(event) => {
                const next = event.target.value;
                slotRequestGate.invalidate();
                setDate(next);
                void loadSlots(next);
              }}
              className="mt-2 min-h-[48px] w-full rounded-xl border border-earth-300 px-3 text-earth-900"
            />
            {loadingSlots && (
              <p className="mt-4 rounded-xl bg-primary-50 p-3 text-sm font-medium text-primary-800">
                正在載入這一天的可預約時段…
              </p>
            )}
            {slots.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    disabled={pending || loadingSlots}
                    onClick={() => setSelected(slot)}
                    className={`min-h-[44px] rounded-xl border px-3 py-2 font-medium disabled:opacity-50 ${selected === slot ? "border-primary-600 bg-primary-100 text-primary-800" : "border-earth-300 text-earth-800"}`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="mt-5 min-h-[48px] w-full rounded-xl bg-primary-600 px-4 font-semibold text-white disabled:opacity-50"
              >
                {pending ? "改期中…" : `確認改為 ${date} ${selected}`}
              </button>
            )}
          </>
        )}

        <Link href={`${prefix}/my-bookings`} className="mt-4 flex min-h-[44px] items-center justify-center text-sm font-medium text-earth-700">
          返回預約紀錄
        </Link>
      </div>
    </div>
  );
}
