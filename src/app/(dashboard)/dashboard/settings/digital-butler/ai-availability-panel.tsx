"use client";
import { useEffect, useRef, useState } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { SettingsListRow } from "@/components/settings/settings-workspace";
import type { AiAvailabilityResult } from "@/server/ai/availability-contract";
import { readAiButlerSteamAvailability } from "./ai-availability-actions";

const button = "min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50";
export function AiAvailabilityPanel({ viewKey, initialDate, today }: { viewKey: string; initialDate: string; today: string }) {
  const [expanded, setExpanded] = useState(false), [date, setDate] = useState(initialDate);
  const [result, setResult] = useState<AiAvailabilityResult | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const reader = usePanelReader("ai-steam-availability", readAiButlerSteamAvailability, viewKey, 0), generation = useRef(0);
  useEffect(() => () => { generation.current++; reader.clear(); }, [reader]);
  async function query() {
    const ticket = ++generation.current, path = window.location.pathname;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await reader.refresh({ viewKey, date });
      if (ticket !== generation.current || path !== window.location.pathname) return;
      if (!response.success) setError(response.error);
      else if (response.snapshot.viewKey !== viewKey || response.snapshot.date !== date) setError("查詢範圍已變更，請重新查詢。");
      else setResult(response.snapshot);
    } catch { if (ticket === generation.current) setError("時段讀取中斷，請重新查詢；目前尚未確認可預約狀態。"); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  return <section aria-label="AI 即時空位查詢" className="min-w-0 rounded-xl border border-earth-200 bg-white px-4">
    <SettingsListRow title="即時空位查詢" summary="蒸足・隔離唯讀測試" expanded={expanded} keepMounted
      controls={<button type="button" className={button} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收合空位查詢" : "測試空位查詢"}</button>}>
      <div className="min-w-0 space-y-3 pb-4 text-sm">
        <p className="text-earth-600">依顧客預約規則查詢本店測試時段，不會建立預約。空位會隨時變動，預約時須重新確認。</p>
        <div className="flex flex-wrap items-end gap-2"><label className="min-w-0">查詢日期<input type="date" value={date} min={today} className="mt-1 block min-h-11 max-w-full rounded-lg border border-earth-200 px-3" onChange={e => {
          generation.current++; reader.clear(); setDate(e.target.value); setBusy(false); setResult(null); setError("");
        }} /></label><button type="button" className={`${button} bg-primary-700 text-white`} disabled={busy || !date} onClick={query}>查詢可預約時段</button></div>
        {busy && <p role="status">查詢時段中…</p>}
        {error && <p role="alert" className="break-words text-red-700">{error}</p>}
        {result && <div className="space-y-2"><p role="status">{result.date}・{result.slots.length ? `${result.slots.length} 個可預約時段` : "目前沒有可預約時段"}</p>
          <p className="text-earth-600">查詢時間：{result.checkedAtLabel}</p>
          {!!result.slots.length && <ul aria-label="可預約時段" className="divide-y divide-earth-100">{result.slots.map(slot => <li key={slot.startTime} className="admin-striped-row flex flex-wrap justify-between gap-2 p-3"><span>{slot.startTime}</span><span>可預約 {slot.remaining} 人</span></li>)}</ul>}
        </div>}
      </div>
    </SettingsListRow>
  </section>;
}
