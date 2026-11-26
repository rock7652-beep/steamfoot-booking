"use client";
import { useEffect, useRef, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { SettingsListRow } from "@/components/settings/settings-workspace";
import { STATUS_LABEL } from "@/lib/booking-constants";
import { aiMemberResponseSchema, type AiMemberResponse } from "@/server/ai/member-bookings-contract";
type Snapshot = Extract<AiMemberResponse, { success: true }>["snapshot"];
async function read(input: { viewKey: string; date: string; page: number }) {
  const params = new URLSearchParams({ ...input, page: String(input.page) });
  const response = await fetch(`/api/ai/member-bookings?${params}`, { credentials: "same-origin", cache: "no-store" });
  const parsed = aiMemberResponseSchema.parse(await response.json());
  if (!response.ok && parsed.success) throw new Error("INVALID_RESPONSE");
  return parsed;
}
const button = "min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
export function AiMemberBookingsPanel({ viewKey, initialDate }: { viewKey: string; initialDate: string }) {
  const [expanded, setExpanded] = useState(false), [date, setDate] = useState(initialDate), [page, setPage] = useState(1);
  const [result, setResult] = useState<Snapshot | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const reader = usePanelReader("ai-confirmed-my-bookings", read, viewKey, 0), generation = useRef(0);
  useEffect(() => () => { generation.current++; reader.clear(); }, [reader]);
  async function query(target = page) {
    const ticket = ++generation.current, path = window.location.pathname;
    setBusy(true); setPage(target); setError(""); setResult(null);
    try {
      const response = await reader.refresh({ viewKey, date, page: target });
      if (ticket !== generation.current || path !== window.location.pathname) return;
      if (!response.success) setError(response.error);
      else if (response.snapshot.viewKey !== viewKey || response.snapshot.date !== date || response.snapshot.page !== target) setError("查詢範圍已變更，請重新查詢。");
      else setResult(response.snapshot);
    } catch { if (ticket === generation.current) setError("讀取中斷，尚未確認預約紀錄；請重試原查詢。"); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  return <section aria-label="AI 本人預約唯讀測試" className="mb-5 min-w-0 rounded-xl border border-earth-200 bg-white px-4">
    <SettingsListRow title="本人預約唯讀測試" summary="僅限已確認身分的合成會員" expanded={expanded} keepMounted
      controls={<button type="button" className={button} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收合本人查詢" : "測試本人查詢"}</button>}>
      <div className="min-w-0 space-y-3 pb-4 text-sm">
        <p className="text-earth-600">只查看目前登入會員的預約紀錄，不會建立、改期或取消預約。</p>
        <div className="flex flex-wrap items-end gap-2"><label className="min-w-0">預約日期<input type="date" value={date} className="mt-1 block min-h-11 max-w-full rounded-lg border border-earth-200 px-3" onChange={e => {
          generation.current++; reader.clear(); setDate(e.target.value); setPage(1); setBusy(false); setResult(null); setError("");
        }} /></label><button type="button" className={`${button} bg-primary-700 text-white`} disabled={busy || !date} onClick={() => query()}>查詢本人預約</button></div>
        {busy && <p role="status">查詢本人預約中…</p>}
        {error && <p role="alert" className="break-words text-red-700">{error}</p>}
        {result && <div className="space-y-2"><p role="status">{result.date}・共 {result.total} 筆・第 {result.page} 頁</p>
          <p className="text-earth-600">查詢時間：{result.checkedAtLabel}</p>
          {!result.bookings.length ? <p>{result.total ? "這一頁沒有預約，請返回上一頁核對。" : "這一天沒有預約紀錄。"}</p> :
            <ul aria-label="本人預約紀錄" className="divide-y divide-earth-100">{result.bookings.map((booking, index) => <li key={`${booking.time}-${index}`} className="admin-striped-row flex flex-wrap justify-between gap-2 p-3"><span>{booking.time}・{booking.people} 人</span><span>{STATUS_LABEL[booking.status]}</span></li>)}</ul>}
          <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || result.page <= 1} onClick={() => query(result.page - 1)}>上一頁預約</button>
            <button type="button" className={button} disabled={busy || result.page * result.pageSize >= result.total} onClick={() => query(result.page + 1)}>下一頁預約</button></div>
        </div>}
      </div>
    </SettingsListRow>
  </section>;
}
