"use client";
import { useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { getBookingCustomerProfile } from "@/server/actions/booking-customer-profile";
import { BookingServiceNoteEditor } from "./booking-service-note-editor";
type Profile = Extract<Awaited<ReturnType<typeof getBookingCustomerProfile>>, { success: true }>['data'];
const statusLabels: Record<string, string> = { PENDING: "預約中", CONFIRMED: "預約中", COMPLETED: "已完成", CANCELLED: "已取消", NO_SHOW: "未到" };
export function BookingPersonDetails({ customerId, name, canEditNote, onNoteSaved, initial }: {
  initial?: { id: string; name: string; phone: string; serviceNote: string | null };
  customerId: string; name: string; canEditNote: boolean; onNoteSaved?: (value: string | null) => void;
}) {
  const reader = usePanelReader("booking-person-profile", getBookingCustomerProfile);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(initial ? { ...initial, bookings: [] } : null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError("");
    try {
      const result = await reader.read(customerId);
      if (result.success && result.data.id === customerId) setProfile(result.data);
      else setError(result.success ? "顧客資料不符，請重試" : result.error);
    } catch { setError("資料讀取失敗，請重試。"); }
    finally { setLoading(false); }
  }
  return <div className="mt-1">
    <button type="button" aria-expanded={open} className="min-h-11 rounded-lg px-3 text-base text-primary-700" onClick={() => {
      setOpen(!open); if (!open && !loading) void load();
    }}>{open ? "收合資料" : "資料與紀錄"}</button>
    {open && <div className="rounded-lg bg-earth-50 p-3">
      <p className="mb-2 break-words text-base font-semibold text-earth-900">{name}</p>
      {loading && <p role="status">讀取中…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => void load()} className="min-h-11 px-3 text-primary-700">重試</button></div>}
      {profile && <>
        <p className="mb-2 text-base">電話：{profile.phone ? <a href={`tel:${profile.phone}`} className="inline-flex min-h-11 items-center text-primary-700">{profile.phone}</a> : "未提供"}</p>
        <BookingServiceNoteEditor customerId={customerId} value={profile.serviceNote} canEdit={canEditNote} onSaved={value => {
          setProfile(previous => previous ? { ...previous, serviceNote: value } : previous); reader.invalidate(customerId); onNoteSaved?.(value);
        }} />
        <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-base">近期預約 {profile.bookings.length ? `（${profile.bookings.length} 筆）` : ""}</summary>
          {profile.bookings.length ? <ul className="divide-y divide-earth-200">{profile.bookings.map(booking => <li key={booking.id} className="flex flex-wrap justify-between gap-2 py-2 text-base"><span>{booking.bookingDate} {booking.slotTime}</span><span>{statusLabels[booking.bookingStatus] ?? booking.bookingStatus}</span></li>)}</ul> : <p>尚無預約紀錄</p>}
        </details>
      </>}
    </div>}
  </div>;
}
