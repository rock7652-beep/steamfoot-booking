"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createLatestRequestGate } from "@/lib/latest-request-gate";
import {
  cancelTrialBookingFromChat, confirmTrialBookingFromChat,
  getTrialRescheduleSlotsFromChat, rescheduleTrialBookingFromChat,
} from "@/server/actions/trial-booking-self-service";

export function TrialBookingManager() {
  const token = useSearchParams().get("token") ?? "";
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const slotRequestGate = useRef(createLatestRequestGate()).current;
  const disabled = !token;

  async function loadRescheduleSlots() {
    const requestId = slotRequestGate.issue();
    try {
      const nextSlots = await getTrialRescheduleSlotsFromChat(token, date);
      if (slotRequestGate.isCurrent(requestId)) setSlots(nextSlots);
    } catch {
      if (slotRequestGate.isCurrent(requestId)) setMessage("無法取得可改期時段。");
    }
  }

  return <main className="mx-auto min-h-dvh max-w-lg bg-[#f7f2ea] p-6 text-earth-900">
    <h1 className="text-2xl font-bold">體驗預約自助處理</h1>
    <p className="mt-2 text-sm text-earth-600">您可確認會到、同店改期一次，或取消預約。距離預約兩小時內請直接聯絡門市。</p>
    {message && <p className="mt-4 rounded-xl bg-white p-3 text-sm">{message}</p>}
    <button disabled={disabled} className="mt-6 w-full rounded-xl bg-primary-600 p-3 font-semibold text-white disabled:opacity-40" onClick={() => void confirmTrialBookingFromChat(token).then(result => setMessage(result === "unavailable" ? "此預約目前無法自行處理，請聯絡門市。" : "已確認會到，期待見到您！"))}>確認會到</button>
    <section className="mt-4 rounded-xl bg-white p-4">
      <h2 className="font-semibold">更改時間（限一次）</h2>
      <input className="mt-3 w-full rounded border p-2" type="date" value={date} onChange={e => {
        slotRequestGate.invalidate();
        setDate(e.target.value);
        setSlots([]);
        setSelected("");
      }} />
      <button disabled={disabled || !date} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-40" onClick={() => void loadRescheduleSlots()}>查看可選時段</button>
      {slots.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{slots.map(slot => <button key={slot} className={`rounded border px-3 py-2 ${selected === slot ? "bg-primary-100" : ""}`} onClick={() => setSelected(slot)}>{slot}</button>)}</div>}
      {selected && <button className="mt-3 w-full rounded-xl border border-primary-600 p-3 text-primary-700" onClick={() => void rescheduleTrialBookingFromChat({ token, date, slotTime: selected }).then(result => setMessage(result === "rescheduled" ? "已完成改期。" : result === "slot_full" ? "該時段剛好額滿，請重新選擇。" : "此預約目前無法自行改期，請聯絡門市。"))}>確認改為 {date} {selected}</button>}
    </section>
    <button disabled={disabled} className="mt-4 w-full rounded-xl border border-red-300 p-3 text-red-700 disabled:opacity-40" onClick={() => { if (window.confirm("確定要取消這筆預約嗎？")) void cancelTrialBookingFromChat(token).then(result => setMessage(result === "cancelled" ? "預約已取消，名額已釋出。" : result === "already_cancelled" ? "這筆預約已取消。" : "此預約目前無法自行取消，請聯絡門市。")); }}>取消預約</button>
  </main>;
}
