"use client";
import { useEffect, useRef, useState } from "react";
import { RightSheet } from "@/components/admin/right-sheet";
import { addCourseCompanion, loadCourseCompanionUsage, saveCourseCompanionUsage } from "@/server/actions/course-companions";

type Result = Awaited<ReturnType<typeof loadCourseCompanionUsage>>;
type Data = Extract<Result, {success: true}>["data"];
const field = "min-h-11 w-full rounded-lg border px-3 py-2 text-base";
const button = "min-h-11 rounded-lg border px-4 py-2 text-sm disabled:opacity-50";

export function CourseCompanionEditor({bookingId, coach = false, add = false, onClose, onSaved}: {bookingId: string; coach?: boolean; add?: boolean; onClose: () => void; onSaved: () => void}) {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<"RESERVER" | "TRIAL" | "MEMBER">("RESERVER");
  const [customerId, setCustomerId] = useState("");
  const [cardId, setCardId] = useState("");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!add);
  const [dirty, setDirty] = useState(false);
  const version = useRef(0), lock = useRef(false), key = useRef(crypto.randomUUID());
  async function load(query = "", initial = false) {
    const request = ++version.current;
    setLoading(true); setError("");
    try {
      const result = await loadCourseCompanionUsage({bookingId, coach, search: query});
      if (request !== version.current) return;
      if (!result.success) { setError(result.error); return; }
      setData(previous => initial || !previous ? result.data : {...result.data, booking: previous.booking});
      if (initial) {
        setMode(!result.data.booking.cardId ? "TRIAL" : result.data.booking.cardId === result.data.booking.reserverCardId ? "RESERVER" : "MEMBER");
        setCustomerId(result.data.booking.customerId ?? "");
        setCardId(result.data.booking.cardId ?? "");
      }
    } catch { if (request === version.current) setError("讀取失敗，請重試"); }
    finally { if (request === version.current) setLoading(false); }
  }
  useEffect(() => { if (!add) void load("", true); return () => { version.current++; }; }, [bookingId, coach, add]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { if (!busy && (!dirty || window.confirm("尚未儲存，要放棄修改嗎？"))) onClose(); };
  async function save() {
    if (lock.current || (!add && !data)) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = add ? await addCourseCompanion({bookingId, coach, name, requestKey: key.current}) : await saveCourseCompanionUsage({bookingId, coach, mode, customerId: customerId || undefined, cardId: mode === "MEMBER" ? cardId : undefined, expectedUpdatedAt: data!.booking.updatedAt, requestKey: key.current});
      if (!result.success) { setError(result.error); return; }
      onSaved(); onClose();
    } catch { setError("儲存結果尚未確認，請重試"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <RightSheet open presentation="centered" compact fitContent width={440} className="!z-[160]" onClose={close} labelledById="companion-title">
    <form className="space-y-4 p-5" onSubmit={event => {event.preventDefault(); void save();}}>
      <h2 id="companion-title" className="text-lg font-semibold">{add ? "新增同行" : "變更使用方式"}</h2>
      {loading && <p role="status">讀取中…</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error} {!data && !add && <button type="button" className={button} onClick={() => void load("", true)}>重試</button>}</p>}
      {add ? <label className="block space-y-1 text-sm"><span>同行姓名（選填）</span><input className={field} maxLength={100} value={name} disabled={busy} onChange={event => {setName(event.target.value); setDirty(true);}} /><span className="block text-earth-600">先使用預約人方案保留 1 個名額。</span></label> : data && <>
        <p className="text-sm">{data.booking.name} · {data.booking.planName}</p>
        <label className="block space-y-1 text-sm"><span>使用方式</span><select className={field} value={mode} disabled={busy} onChange={event => {setMode(event.target.value as typeof mode); setDirty(true);}}>
          <option value="RESERVER">使用 {data.booking.reserverName ?? "預約人"} 方案</option>
          <option value="TRIAL" disabled={!data.trialEnabled}>體驗</option><option value="MEMBER">本人方案</option>
        </select></label>
        <details open={mode === "MEMBER" || undefined}><summary className="min-h-11 cursor-pointer py-2 text-sm">連結學員{mode !== "MEMBER" ? "（選填）" : ""}</summary>
          <div className="space-y-2">
            <div className="flex gap-2"><input className={field} aria-label="搜尋學員姓名或電話" placeholder="姓名或電話" value={search} disabled={busy} onChange={event => setSearch(event.target.value)} /><button type="button" className={button} disabled={busy || loading || !search.trim()} onClick={() => void load(search)}>搜尋</button></div>
            <select className={field} aria-label="學員" value={customerId} disabled={busy || loading} onChange={event => {setCustomerId(event.target.value); setCardId(""); setDirty(true);}}><option value="">{data.customers.length ? "選擇學員" : "請先搜尋學員"}</option>{data.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select>
            {mode === "MEMBER" && <select className={field} aria-label="本人方案" value={cardId} disabled={busy || loading} onChange={event => {setCardId(event.target.value); setDirty(true);}}><option value="">選擇本人方案</option>{data.cards.filter(card => card.members.some(member => member.customerId === customerId)).map(card => <option key={card.id} value={card.id}>{card.nameSnapshot}</option>)}</select>}
          </div>
        </details>
        <p className="text-sm text-earth-600">保留原名額，自動調整方案額度。</p>
      </>}
      <div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={close}>取消</button><button type="submit" className={`${button} bg-primary-700 text-white`} disabled={busy || loading || (!add && !data) || (!add && mode === "MEMBER" && (!customerId || !cardId))}>{busy ? "儲存中…" : "確認"}</button></div>
    </form>
  </RightSheet>;
}
