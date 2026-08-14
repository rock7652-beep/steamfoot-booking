"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createLatestRequestGate } from "@/lib/latest-request-gate";
import {
  cancelTrialBookingFromChat, confirmTrialBookingFromChat,
  getTrialBookingManagementStatusFromChat, getTrialRescheduleSlotsFromChat,
  rescheduleTrialBookingFromChat,
} from "@/server/actions/trial-booking-self-service";

export function TrialBookingManager() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const requestedAction = searchParams.get("action");
  const action = requestedAction === "confirm" || requestedAction === "cancel" || requestedAction === "reschedule"
    ? requestedAction
    : null;
  const [message, setMessage] = useState("");
  const [cancellationComplete, setCancellationComplete] = useState(false);
  // The signed booking projection is the source of truth for the initial
  // reschedule date. Starting from "today" can select a full or closed day
  // even when the booking's own date has available alternatives.
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [booking, setBooking] = useState<{
    bookingDate: string;
    slotTime: string;
    customerRescheduleCount: number;
    bookingStatus: string;
  } | null>(null);
  const slotRequestGate = useRef(createLatestRequestGate()).current;
  const disabled = !token;

  async function loadRescheduleSlots(requestedDate = date) {
    if (!requestedDate) return;
    const requestId = slotRequestGate.issue();
    try {
      const nextSlots = await getTrialRescheduleSlotsFromChat(token, requestedDate);
      if (slotRequestGate.isCurrent(requestId)) setSlots(nextSlots);
    } catch {
      if (slotRequestGate.isCurrent(requestId)) setMessage("無法取得可改期時段。");
    }
  }

  useEffect(() => {
    if (disabled) return;
    void getTrialBookingManagementStatusFromChat(token).then(status => {
      if (!status) {
        setMessage("無法取得預約資訊，請聯絡門市。");
        return;
      }
      setBooking(status);
      setDate(status.bookingDate);
      if (status.bookingStatus === "CANCELLED") setMessage("這筆預約已取消。");
    }).catch(() => setMessage("無法取得預約資訊，請聯絡門市。"));
  }, [disabled, token]);

  useEffect(() => {
    if (disabled || action === null) return;
    if (action === "confirm") {
      void confirmTrialBookingFromChat(token).then(result => {
        setMessage(result === "unavailable" ? "此預約目前無法自行處理，請聯絡門市。" : "已確認會到，期待見到您！");
      });
      return;
    }
    if (action === "reschedule" && booking) {
      if (booking.customerRescheduleCount >= 1 || booking.bookingStatus === "CANCELLED") return;
      void loadRescheduleSlots(booking.bookingDate);
    }
  // `action` comes from a signed management URL. A date change is handled by
  // its input event, not by re-running this initial deep-link action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, booking, disabled, token]);

  const cancelled = cancellationComplete || booking?.bookingStatus === "CANCELLED";
  const cancelButton = <button disabled={disabled || cancelled} className="mt-4 w-full rounded-xl border border-red-300 p-3 text-red-700 disabled:opacity-40" onClick={() => { if (window.confirm("確定要取消這筆預約嗎？")) void cancelTrialBookingFromChat(token).then(result => {
    if (result === "cancelled" || result === "already_cancelled") {
      setCancellationComplete(true);
      setBooking(current => current ? { ...current, bookingStatus: "CANCELLED" } : current);
    }
    setMessage(result === "cancelled" ? "預約已取消，名額已釋出。" : result === "already_cancelled" ? "這筆預約已取消。" : "此預約目前無法自行取消，請聯絡門市。");
  }); }}>確認取消預約</button>;
  const rescheduleSection = <section className="mt-4 rounded-xl bg-white p-4">
    <h2 className="font-semibold">更改時間（限一次）</h2>
    {booking && <p className="mt-2 text-sm text-earth-600">目前預約：{booking.bookingDate} {booking.slotTime}</p>}
    {booking?.customerRescheduleCount && booking.customerRescheduleCount >= 1 ? <p className="mt-3 text-sm text-earth-600">本預約已改期一次，如需調整請聯絡店家</p> : <>
    <input className="mt-3 w-full rounded border p-2" type="date" value={date} onChange={e => {
      slotRequestGate.invalidate();
      setDate(e.target.value);
      setSlots([]);
      setSelected("");
      void loadRescheduleSlots(e.target.value);
    }} />
    {slots.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{slots.map(slot => <button key={slot} className={`rounded border px-3 py-2 ${selected === slot ? "bg-primary-100" : ""}`} onClick={() => setSelected(slot)}>{slot}</button>)}</div>}
    {selected && <button className="mt-3 w-full rounded-xl border border-primary-600 p-3 text-primary-700" onClick={() => void rescheduleTrialBookingFromChat({ token, date, slotTime: selected }).then(result => {
      if (result === "rescheduled") {
        setBooking(current => current ? { ...current, bookingDate: date, slotTime: selected, customerRescheduleCount: current.customerRescheduleCount + 1 } : current);
        setSlots([]);
        setSelected("");
      }
      setMessage(result === "rescheduled" ? "已完成改期。" : result === "slot_full" ? "該時段剛好額滿，請重新選擇。" : "此預約目前無法自行改期，請聯絡門市。");
    })}>確認改為 {date} {selected}</button>}
    </>}
  </section>;

  if (cancelled) return <main className="mx-auto min-h-dvh max-w-lg bg-[#f7f2ea] p-6 text-earth-900">
    <h1 className="text-2xl font-bold">體驗預約自助處理</h1>
    <p className="mt-4 rounded-xl bg-white p-3 text-sm">{message || "這筆預約已取消。"}</p>
  </main>;

  return <main className="mx-auto min-h-dvh max-w-lg bg-[#f7f2ea] p-6 text-earth-900">
    <h1 className="text-2xl font-bold">體驗預約自助處理</h1>
    <p className="mt-2 text-sm text-earth-600">您可確認會到、同店改期一次，或取消預約。距離預約 12 小時內請直接聯絡門市。</p>
    {message && <p className="mt-4 rounded-xl bg-white p-3 text-sm">{message}</p>}
    {action === "cancel" ? cancelButton : action === "reschedule" ? rescheduleSection : action === "confirm" ? null : <>
      <button disabled={disabled} className="mt-6 w-full rounded-xl bg-primary-600 p-3 font-semibold text-white disabled:opacity-40" onClick={() => void confirmTrialBookingFromChat(token).then(result => setMessage(result === "unavailable" ? "此預約目前無法自行處理，請聯絡門市。" : "已確認會到，期待見到您！"))}>確認會到</button>
      {rescheduleSection}
      {cancelButton}
    </>}
  </main>;
}
