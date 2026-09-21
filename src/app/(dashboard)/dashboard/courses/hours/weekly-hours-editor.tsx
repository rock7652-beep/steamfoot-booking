"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { saveCourseWeeklyHours } from "@/server/actions/course-business-hours";

type Period = { openTime: string; closeTime: string };
type Day = { dayOfWeek: number; dayName: string; isOpen: boolean; periods: Period[]; openTime: string | null; closeTime: string | null };
export function CourseWeeklyHoursEditor({ initial, canManage, onSaved }: { initial: Day[]; canManage: boolean; onSaved: (days: Day[]) => Promise<void> }) {
  const [days, setDays] = useState(() => initial.map(day => ({ ...day, periods: day.periods.length ? day.periods.map(p => ({ openTime: p.openTime, closeTime: p.closeTime })) : [{ openTime: day.openTime ?? "10:00", closeTime: day.closeTime ?? "22:00" }] })));
  const [saved, setSaved] = useState(days);
  const [source, setSource] = useState(1);
  const [targets, setTargets] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const saving = useRef(false);
  const router = useRouter();
  const changed = days.filter(day => JSON.stringify(day) !== JSON.stringify(saved.find(s => s.dayOfWeek === day.dayOfWeek)));
  useSettingsPanelGuard(changed.length > 0, pending);
  function update(dow: number, change: Partial<Day>) { setDays(previous => previous.map(day => day.dayOfWeek === dow ? { ...day, ...change } : day)); setMessage(""); }
  return <form aria-label="每週營業時間" className="rounded-xl border bg-white p-4" onSubmit={event => {
    event.preventDefault(); if (saving.current || !changed.length || !canManage) return;
    saving.current = true; setMessage(""); const submitted = days;
    start(async () => {
      try {
        const result = await saveCourseWeeklyHours(changed.map(({ dayOfWeek, isOpen, periods }) => ({ dayOfWeek, isOpen, periods })));
        if (!result.success) { setMessage(result.error ?? "儲存失敗，修改已保留"); return; }
        setSaved(submitted); setMessage("已儲存每週營業時間"); await onSaved(submitted); router.refresh();
      } catch { setMessage("連線失敗，修改已保留，請重試"); }
      finally { saving.current = false; }
    });
  }}>
    <h3 className="font-semibold">每週營業時間</h3><p className="mt-1 text-xs text-earth-600">直接調整各日，最後一次儲存。公休與多段時間皆可設定。</p>
    <fieldset disabled={!canManage || pending} className="mt-3 min-w-0 divide-y">
      {days.map(day => <div key={day.dayOfWeek} className="flex flex-wrap items-start gap-3 py-3">
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={day.isOpen} onChange={e => update(day.dayOfWeek, { isOpen: e.target.checked })} />{day.dayName}</label>
        {day.isOpen ? <div className="min-w-0 flex-1 space-y-2">{day.periods.map((period, index) => <div key={index} className="flex flex-wrap items-center gap-2">
          <input aria-label={`${day.dayName}第${index + 1}段開始`} type="time" required value={period.openTime} onChange={e => update(day.dayOfWeek, { periods: day.periods.map((p, i) => i === index ? { ...p, openTime: e.target.value } : p) })} className="min-h-11 min-w-0 rounded border px-2" /><span>至</span>
          <input aria-label={`${day.dayName}第${index + 1}段結束`} type="time" required value={period.closeTime} onChange={e => update(day.dayOfWeek, { periods: day.periods.map((p, i) => i === index ? { ...p, closeTime: e.target.value } : p) })} className="min-h-11 min-w-0 rounded border px-2" />
          {day.periods.length > 1 && <button type="button" aria-label={`移除${day.dayName}第${index + 1}段`} onClick={() => update(day.dayOfWeek, { periods: day.periods.filter((_, i) => i !== index) })} className="min-h-11 px-2 text-sm text-red-700">移除</button>}
        </div>)}</div> : <span className="py-3 text-sm text-earth-500">公休</span>}
        {day.isOpen && day.periods.length < 8 && <button type="button" onClick={() => update(day.dayOfWeek, { periods: [...day.periods, { openTime: "10:00", closeTime: "22:00" }] })} className="min-h-11 px-2 text-sm text-primary-700">＋ 時段</button>}
      </div>)}
    </fieldset>
    {canManage && <fieldset disabled={pending} className="mt-3 rounded-lg bg-earth-50 p-3 text-sm"><legend className="font-medium">相同時間一次套用</legend>
      <div className="flex flex-wrap items-center gap-2"><label>以 <select aria-label="套用來源星期" value={source} onChange={e => { setSource(Number(e.target.value)); setTargets([]); }} className="min-h-11 rounded border bg-white px-2">{days.map(day => <option key={day.dayOfWeek} value={day.dayOfWeek}>{day.dayName}</option>)}</select> 為準，套用至：</label>
        {days.filter(day => day.dayOfWeek !== source).map(day => <label key={day.dayOfWeek} className="flex min-h-11 items-center gap-1"><input type="checkbox" checked={targets.includes(day.dayOfWeek)} onChange={e => setTargets(previous => e.target.checked ? [...previous, day.dayOfWeek] : previous.filter(d => d !== day.dayOfWeek))} />{day.dayName}</label>)}
        <button type="button" disabled={!targets.length} onClick={() => { const from = days.find(day => day.dayOfWeek === source)!; setDays(previous => previous.map(day => targets.includes(day.dayOfWeek) ? { ...day, isOpen: from.isOpen, periods: from.periods.map(p => ({ ...p })) } : day)); setMessage("已套用至勾選日，請儲存生效"); }} className="min-h-11 rounded border bg-white px-3 disabled:opacity-50">套用至勾選日</button>
      </div>
    </fieldset>}
    {message && <p role="status" className="mt-3 whitespace-pre-wrap text-sm text-amber-800">{message}</p>}
    {canManage && <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center justify-end gap-3 border-t bg-white py-3"><span className="mr-auto text-xs text-earth-500">{changed.length ? `${changed.length} 天尚未儲存` : "尚未變更"}</span><button type="button" disabled={pending || !changed.length} onClick={() => { setDays(saved); setMessage(""); }} className="min-h-11 rounded border px-3 disabled:opacity-50">還原修改</button><button type="submit" disabled={pending || !changed.length} className="min-h-11 rounded bg-primary-700 px-4 text-white disabled:opacity-50">{pending ? "儲存中…" : "儲存每週設定"}</button></div>}
  </form>;
}
