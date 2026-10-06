"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalPanel } from "@/components/admin/modal-panel";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { SteamBookingDrawer } from "../../bookings/steam-booking-drawer";
import { SpaBookingFields } from "../../bookings/new/spa-booking-fields";
import { BookingCreateForm, BookingCreateSubmit } from "../../bookings/new/booking-create-form";
import { loadCustomerCareBooking } from "@/server/actions/customer-care-booking";
import { createCourseBooking } from "@/server/actions/course-members";
import { createSpaQuickBooking } from "@/server/actions/spa-quick-booking";
import { formatTWTime, toLocalDateStr } from "@/lib/date-utils";
import type { CareItem } from "./care-section";
const button = "min-h-11 rounded-lg border border-earth-200 px-3 text-sm text-earth-700 disabled:opacity-50";
type Options = Extract<Awaited<ReturnType<typeof loadCustomerCareBooking>>, { success: true }>["data"];
export function CareBookingButton({ item }: { item: CareItem }) {
  const router = useRouter();
  const titleId = useId();
  const reader = usePanelReader("customer-care-booking", loadCustomerCareBooking, "", 0);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [cardId, setCardId] = useState("");
  const [pending, start] = useTransition();
  const [spaPending, setSpaPending] = useState(false);
  const version = useRef(0), lock = useRef(false), dirty = useRef(false), requestKey = useRef("");
  useEffect(() => () => { version.current++; }, []);
  function close() { if (pending || lock.current) return; if (dirty.current && !window.confirm("尚有未儲存的預約資料，要捨棄嗎？")) return; version.current++; setOpen(false); }
  async function show() {
    const current = ++version.current; setOpen(true); setLoading(true); setError(""); setOptions(null); dirty.current = false; requestKey.current = crypto.randomUUID();
    try { const res = await reader.read(item.customerId); if (current !== version.current) return; if (!res.success) setError(res.error); else setOptions(res.data); }
    catch { if (current === version.current) setError("載入失敗，請重試。"); }
    finally { if (current === version.current) setLoading(false); }
  }
  function done() { reader.invalidate(item.customerId); dirty.current = false; setOpen(false); router.refresh(); }
  if (!item.module || item.module === "steamfoot") return <SteamBookingDrawer date={toLocalDateStr()} triggerLabel="預約" triggerClassName={button} defaultCustomerId={item.customerId} defaultCustomerLabel={item.name} onCreated={() => router.refresh()}/>;
  const course = options?.module === "course" ? options : null;
  return <>
    <button className={button} type="button" onClick={() => void show()}>預約</button>
    <ModalPanel open={open} onClose={close} labelledById={titleId} pending={pending || spaPending} width={760}>
      <div className="space-y-4 p-5" onChangeCapture={() => { dirty.current = true; }}><header className="flex items-center justify-between"><h2 id={titleId} className="font-semibold text-primary-900">{item.name} · 新增預約</h2><button className={button} disabled={pending} type="button" onClick={close}>關閉</button></header>
        {loading && <p role="status">載入預約選項中…</p>}
        {error && <p className="text-sm text-red-700" role="alert">{error}{!options && <button className={button} type="button" onClick={() => void show()}>重新載入</button>}</p>}
        {course && (course.sessions.length ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (lock.current) return; lock.current = true; setError(""); start(async () => { try { const res = await createCourseBooking({ sessionId, cardId, customerId: item.customerId, requestKey: requestKey.current }); if (res.success) done(); else setError(res.error); } catch { setError("建立失敗，請重試。"); } finally { lock.current = false; } }); }}>
          <label className="block text-sm">課程<select required className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3" value={sessionId} disabled={pending} onChange={e => { setSessionId(e.target.value); setCardId(course.sessions.find(s => s.id === e.target.value)?.cardIds[0] ?? ""); }}><option value="">選擇課程</option>{course.sessions.map(s => <option key={s.id} value={s.id}>{formatTWTime(new Date(s.at))} · {s.name}</option>)}</select></label>
          <label className="block text-sm">使用方案<select required className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 px-3" value={cardId} disabled={pending} onChange={e => setCardId(e.target.value)}><option value="">選擇方案</option>{course.cards.filter(c => course.sessions.find(s => s.id === sessionId)?.cardIds.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <button className={`${button} bg-primary-600 !text-white`} disabled={pending} type="submit">{pending ? "建立中…" : "建立預約"}</button>
        </form> : <p className="text-sm text-earth-600">未來 60 天內沒有適用此顧客有效方案的課程。請先確認方案及排課。</p>)}
        {options?.module === "spa" && <BookingCreateForm preserveOnFailure action={async form => {
          if (lock.current) return { error: "建立中…" }; lock.current = true; setSpaPending(true);
          try { const res = await createSpaQuickBooking({ customerId: item.customerId, bookingDate: String(form.get("bookingDate") ?? ""), serviceStaffId: String(form.get("serviceStaffId") ?? ""), slotTime: String(form.get("slotTime") ?? ""), treatmentIds: form.getAll("treatmentIds").map(String), notes: String(form.get("notes") ?? ""), requestKey: requestKey.current }); if (!res.success) return { error: res.error }; done(); }
          finally { lock.current = false; setSpaPending(false); }
        }}><input type="hidden" name="customerId" value={item.customerId}/><SpaBookingFields days={options.days} defaultDate={options.days[0] ?? toLocalDateStr()} treatments={options.treatments}/><BookingCreateSubmit/></BookingCreateForm>}
      </div>
    </ModalPanel>
  </>;
}
