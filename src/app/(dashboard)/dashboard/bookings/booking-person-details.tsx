"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { getBookingCustomerProfile } from "@/server/actions/booking-customer-profile";
import { BookingServiceNoteEditor } from "./booking-service-note-editor";
type Profile = Extract<Awaited<ReturnType<typeof getBookingCustomerProfile>>, { success: true }>['data'];
const statusLabels: Record<string, string> = { PENDING: "預約中", CONFIRMED: "預約中", COMPLETED: "已完成", CANCELLED: "已取消", NO_SHOW: "未到" };
export function BookingPersonDetails({ customerId, revision = 0, canEditNote, onNoteSaved, onWalletCount, initial }: {
  initial?: { id: string; name: string; phone: string; serviceNote: string | null };
  customerId: string; name: string; revision?: number; canEditNote: boolean; onNoteSaved?: (value: string | null) => void; onWalletCount?: (count: number | null) => void;
}) {
  const reader = usePanelReader("booking-person-profile", getBookingCustomerProfile, String(revision));
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(initial ? { ...initial, bookings: [], wallets: [] } : null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const [assigned, setAssigned] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true); setError("");
    try {
      const result = await reader.read(customerId);
      if (version !== request.current) return;
      if (result.success && result.data.id === customerId) { setProfile(result.data); setLoaded(true); onWalletCount?.(result.data.wallets.length); }
      else { onWalletCount?.(null); setError(result.success ? "顧客資料不符，請重試" : result.error); }
    } catch { if (version === request.current) { onWalletCount?.(null); setError("資料讀取失敗，請重試。"); } }
    finally { if (version === request.current) setLoading(false); }
  }, [customerId, reader, onWalletCount]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const lifecycle = request;
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ customerId: string; pendingPayment?: boolean }>).detail;
      if (detail?.customerId !== customerId) return;
      setPendingPayment(detail.pendingPayment === true);
      reader.invalidate(customerId); onWalletCount?.(null); setAssigned(true); void load();
    };
    window.addEventListener("customer-plan-assigned", changed);
    return () => { ++lifecycle.current; window.removeEventListener("customer-plan-assigned", changed); };
  }, [customerId, reader, load, onWalletCount]);
  useEffect(() => {
    if (!assigned || loading || error) return;
    const timer = window.setTimeout(() => setAssigned(false), 5000);
    return () => window.clearTimeout(timer);
  }, [assigned, loading, error]);
  const wallets = [...(profile?.wallets ?? [])].sort((a, b) => (a.expiryDate ?? "9999-12-31").localeCompare(b.expiryDate ?? "9999-12-31") || a.id.localeCompare(b.id));
  const walletLine = (wallet: Profile["wallets"][number]) => <li key={wallet.id} className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 py-1 text-base">
    <span className="min-w-0 break-words font-medium">{wallet.name}</span>
    <span className="text-earth-700">剩 {wallet.remainingSessions}／{wallet.totalSessions} 堂</span>
    <span className="text-earth-700">{wallet.expiryDate ? `${wallet.expiryDate.replaceAll("-", "/")} 到期` : "無期限"}</span>
  </li>;
  return <div className="mt-1">
    <section aria-label="本人有效方案" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><h4 className="text-base text-earth-600">有效方案</h4>
        {assigned && !loading && !error && !pendingPayment && <span role="status" className="text-sm text-primary-700">已指派</span>}
      </div>
      {pendingPayment && <p role="status" className="text-sm text-amber-800">方案待確認付款，尚未開通。</p>}
      {loading && <p role="status" className="text-base text-earth-600">讀取中…</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2"><p>{assigned ? "已建立，方案資料更新失敗，請重新讀取。" : "暫時讀取不到方案"}</p><button type="button" onClick={() => void load()} className="min-h-11 px-3 text-primary-700">重試</button></div>}
      {loaded && !loading && !error && (wallets.length ? <>
        <ul>{walletLine(wallets[0])}</ul>
        {wallets.length > 1 && <details><summary className="min-h-11 cursor-pointer py-2 text-base text-primary-700">另有 {wallets.length - 1} 個方案</summary><ul>{wallets.slice(1).map(walletLine)}</ul></details>}
      </> : <p className="py-1 text-base text-earth-600">尚無有效方案</p>)}
    </section>
    <button type="button" aria-expanded={open} className="min-h-11 rounded-lg px-3 text-base text-primary-700" onClick={() => {
      setOpen(!open); if (!open && !loaded && !loading) void load();
    }}>{open ? "收合資料" : "顧客資料"}</button>
    {open && <div className="rounded-lg bg-earth-50 p-3">
      {profile && <>
        <p className="mb-2 text-base">電話：{profile.phone ? <a href={`tel:${profile.phone}`} className="inline-flex min-h-11 items-center text-primary-700">{profile.phone}</a> : "未提供"}</p>
        <BookingServiceNoteEditor customerId={customerId} value={profile.serviceNote} canEdit={canEditNote && loaded && !loading && !error} onSaved={value => {
          setProfile(previous => previous ? { ...previous, serviceNote: value } : previous); reader.invalidate(customerId); onNoteSaved?.(value);
        }} />
        <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-base">近期預約 {profile.bookings.length ? `（${profile.bookings.length} 筆）` : ""}</summary>
          {profile.bookings.length ? <ul className="divide-y divide-earth-200">{profile.bookings.map(booking => <li key={booking.id} className="flex flex-wrap justify-between gap-2 py-2 text-base"><span>{booking.bookingDate} {booking.slotTime}</span><span>{statusLabels[booking.bookingStatus] ?? booking.bookingStatus}</span></li>)}</ul> : <p>尚無預約紀錄</p>}
        </details>
      </>}
    </div>}
  </div>;
}
