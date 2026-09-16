"use client";
import { useEffect, useState, useTransition } from "react";
import { loadCourseHealth, saveCourseHealth } from "@/server/actions/course-health";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import { HEALTH_DISPLAY_METRICS } from "@/lib/health-display-metrics";
import { healthRecordFormData } from "@/lib/health-record-input";
import { toLocalDateStr } from "@/lib/date-utils";
type Result = Extract<Awaited<ReturnType<typeof loadCourseHealth>>, { success: true }>['data'];
const field = "min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3";
export function CourseCustomerHealth({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
  const [data, setData] = useState<Result | null>(null);
  const [edit, setEdit] = useState<Result['records'][number] | null | undefined>(undefined);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    loadCourseHealth(customerId).then((r) => { if (active) { if (r.success) setData(r.data); else setMessage(r.error); } }).catch(() => active && setMessage("健康紀錄讀取失敗，請重新開啟"));
    return () => { active = false; };
  }, [customerId]);
  return <section className="space-y-4">
    <h3 className="text-lg font-semibold text-primary-800">健康追蹤</h3>
    {message && <p role="status">{message}</p>}
    {edit === undefined ? <>
      {canEdit && <button className="min-h-11 rounded-lg bg-primary-700 px-4 text-white" onClick={() => { setEdit(null); setKey(crypto.randomUUID()); }}>新增量測</button>}
      {!data ? <p>讀取中…</p> : <>
        {data.summary.latest ? <HealthAssessmentCard summary={data.summary} /> : <p>尚無量測紀錄，可新增第一筆量測。</p>}
        <h4 className="font-medium">量測紀錄（最近 100 筆）</h4>
        <ul className="divide-y">{data.records.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-3 text-sm"><span>{r.measuredAt} · {r.weight != null ? `${r.weight} kg` : "體重未填"} · {r.note || "無備註"}</span>{canEdit && <button className="min-h-11 shrink-0 px-3 text-primary-700" onClick={() => { setEdit(r); setKey(crypto.randomUUID()); }}>編輯量測</button>}</li>)}</ul>
      </>}
    </> : <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault(); const values = healthRecordFormData(new FormData(e.currentTarget));
      start(async () => { try { const r = await saveCourseHealth({ ...values, customerId, id: edit?.id }); if (!r.success) { setMessage(r.error); return; } const fresh = await loadCourseHealth(customerId); if (fresh.success) setData(fresh.data); setEdit(undefined); setMessage("量測紀錄已儲存"); } catch { setMessage("連線中斷，請重試"); } });
    }}>
      <input type="hidden" name="requestId" value={key} />
      <label className="block">量測日期<input className={field} type="date" name="measuredAt" required max={toLocalDateStr()} defaultValue={edit?.measuredAt ?? toLocalDateStr()} /></label>
      <div className="grid grid-cols-2 gap-3">{HEALTH_DISPLAY_METRICS.map((m) => <label key={m.key} className="block text-sm">{m.label} {m.unit}<input className={field} type="number" step="any" name={m.key} defaultValue={edit?.[m.key] ?? ""} /></label>)}</div>
      <label className="block">量測備註<textarea className={field} name="note" maxLength={500} defaultValue={edit?.note ?? ""} /></label>
      <div className="sticky bottom-0 flex gap-2 border-t bg-earth-50 py-3"><button disabled={pending} className="min-h-11 rounded-lg bg-primary-700 px-4 text-white">儲存量測</button><button disabled={pending} type="button" className="min-h-11 px-4" onClick={() => setEdit(undefined)}>返回紀錄</button></div>
    </form>}
  </section>;
}
