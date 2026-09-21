"use client";
import { courseCompactField } from "@/components/admin/course-ui";
import { useRef, useState, useTransition } from "react";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { saveCoursePlanReminderSetting } from "@/server/actions/course-plan-reminders";
import { courseLowBalanceBody } from "@/lib/course-low-balance";
import { LineCardPreview } from "../../reminders/line-card-preview";

import { coursePlanReminderSchema } from "@/lib/course-plan-reminders";

type Plan = { id: string; name: string; unit: string; isActive: boolean; lowBalanceEnabled: boolean; lowBalanceThreshold: number | null; expiry?: {enabled:boolean;days:number[]} };
type Draft = { enabled: boolean; threshold: string; expiryEnabled: boolean; expiryDays: string };
const same = (a: Draft, b: Draft) => a.enabled === b.enabled && a.threshold === b.threshold && a.expiryEnabled === b.expiryEnabled && a.expiryDays === b.expiryDays;
export function CourseLowBalanceSettings({ plans }: { plans: Plan[] }) {
  const initial = () => Object.fromEntries(plans.map(p => [p.id, { enabled: p.lowBalanceEnabled, threshold: p.lowBalanceThreshold?.toString() ?? "", expiryEnabled: p.expiry?.enabled ?? true, expiryDays: (p.expiry?.days ?? [14,7]).join(", ") }]));
  const [saved, setSaved] = useState<Record<string, Draft>>(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const saving = useRef(false);
  const changes = plans.filter(p => !same(drafts[p.id], saved[p.id]));
  useSettingsPanelGuard(changes.length > 0, pending);
  const filtered = plans.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === "all" || (filter === "expiry" ? saved[p.id].expiryEnabled : saved[p.id].enabled)));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  function update(id: string, patch: Partial<Draft>) { setDrafts(previous => ({ ...previous, [id]: { ...previous[id], ...patch } })); setMessage(""); }
  function save() {
    if (saving.current || !changes.length) return;
    const inputs = changes.map(p => ({ plan: p, parsed: coursePlanReminderSchema.safeParse({ planId: p.id, enabled: drafts[p.id].enabled, threshold: drafts[p.id].threshold === "" ? null : Number(drafts[p.id].threshold), expiry: { enabled: drafts[p.id].expiryEnabled, days: drafts[p.id].expiryDays.split(/[,，、\s]+/).filter(Boolean).map(Number) } }) }));
    const invalid = inputs.find(item => !item.parsed.success);
    if (invalid) { setMessage(`「${invalid.plan.name}」請確認額度為 0–1000000 的整數，到期天數為 1–365（最多 6 次），欄位不可缺漏。`); return; }
    saving.current = true;
    start(async () => {
      let count = 0;
      try {
        for (const { plan, parsed } of inputs) {
          if (!parsed.success) continue;
          const result = await saveCoursePlanReminderSetting(parsed.data);
          if (!result.success) { setMessage(`已儲存 ${count} 項；「${plan.name}」：${result.error}。其餘修改已保留。`); return; }
          const value = { enabled: parsed.data.enabled, threshold: parsed.data.threshold?.toString() ?? "", expiryEnabled: parsed.data.expiry.enabled, expiryDays: parsed.data.expiry.days.join(", ") };
          setSaved(previous => ({ ...previous, [plan.id]: value }));
          setDrafts(previous => ({ ...previous, [plan.id]: value }));
          count++;
        }
        setMessage(`已儲存 ${count} 項設定`);
      } catch { setMessage(`已儲存 ${count} 項；其餘修改已保留，請重試。`); }
      finally { saving.current = false; }
    });
  }
  return <details open className="rounded-xl border border-earth-200 bg-white">
    <summary className="flex min-h-16 cursor-pointer flex-wrap items-center justify-between gap-2 p-4"><h2 className="font-semibold text-primary-900">各方案提醒</h2><span className="text-sm text-earth-600">共 {plans.length} 項方案{changes.length > 0 ? ` · ${changes.length} 項未儲存` : ""}</span></summary>
    <div className="border-t border-earth-100">
      <div className="flex flex-wrap gap-2 p-4"><input aria-label="搜尋提醒方案" placeholder="搜尋方案名稱" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} className={`${courseCompactField} flex-1`}/><select aria-label="篩選提醒方案" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className={courseCompactField}><option value="all">全部方案</option><option value="enabled">低額度已開啟</option><option value="expiry">到期已勾選</option></select></div>
      <p className="px-4 pb-3 text-xs text-earth-500">直接調整後一次儲存；搜尋與換頁保留修改。到期天數以逗號分隔，例如 14, 7；須開啟上方到期提醒總開關才會發送。</p>
      {!visible.length && <p className="p-4 text-sm text-earth-600">{plans.length ? "沒有符合條件的方案。" : "建立點數／堂數方案後，可在此設定提醒。"}</p>}
      <div className="hidden grid-cols-[minmax(130px,1fr)_160px_190px_52px] gap-3 border-t bg-earth-50 px-4 py-2 text-xs text-earth-600 lg:grid"><span>方案</span><span>低額度提醒</span><span>到期前幾天提醒</span><span>預覽</span></div>
      {visible.map(plan => {
        const draft = drafts[plan.id], unit = plan.unit === "SESSION" ? "堂" : "點";
        return <div key={plan.id} className="border-t border-earth-100">
          <fieldset disabled={pending} className="grid min-w-0 items-center gap-3 px-4 py-2 sm:grid-cols-2 lg:grid-cols-[minmax(130px,1fr)_160px_190px_52px]">
            <div className="min-w-0"><p className="break-words text-sm font-medium text-primary-900">{plan.name}{!same(draft, saved[plan.id]) && <span className="ml-2 text-xs text-amber-700">未儲存</span>}</p>{!plan.isActive && <span className="text-xs text-earth-500">已下架</span>}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm"><label className="flex min-h-11 items-center gap-1"><input aria-label={`${plan.name} 啟用提醒`} type="checkbox" checked={draft.enabled} onChange={e => update(plan.id, { enabled: e.target.checked })}/><span className="lg:hidden">低額度</span><span className="hidden lg:inline">≤</span></label><input aria-label={`${plan.name} 提醒門檻`} type="number" min="0" max="1000000" step="1" value={draft.threshold} onChange={e => update(plan.id, { threshold: e.target.value })} className={`${courseCompactField} w-20`}/>{unit}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm"><label className="flex min-h-11 items-center gap-1"><input aria-label={`${plan.name} 啟用到期提醒`} type="checkbox" checked={draft.expiryEnabled} onChange={e => update(plan.id, { expiryEnabled: e.target.checked })}/><span className="lg:hidden">到期前</span></label><input aria-label={`${plan.name} 到期提醒天數`} type="text" value={draft.expiryDays} placeholder="14, 7" onChange={e => update(plan.id, { expiryDays: e.target.value })} className={`${courseCompactField} w-28`}/>天</div>
            <button type="button" aria-label={`預覽${plan.name}提醒`} aria-expanded={preview === plan.id} onClick={() => setPreview(preview === plan.id ? null : plan.id)} className="min-h-11 text-sm text-primary-700">{preview === plan.id ? "收合" : "預覽"}</button>
          </fieldset>
          {preview === plan.id && <div className="grid gap-3 bg-earth-50 p-4 md:grid-cols-2"><LineCardPreview title="方案可用額度提醒" subtitle="示意資料，非真實發送" actions={[{ label: "查看我的方案", variant: "primary" }, { label: "停止／管理此類提醒", variant: "link" }]}>{courseLowBalanceBody(plan.name, 5, 3, plan.unit)}</LineCardPreview><LineCardPreview title="方案即將到期提醒" subtitle={`設定：到期前 ${draft.expiryDays || "尚未填寫"} 天`} actions={[{label:"查看方案與期限"}]}><p>{plan.name}</p><p>示意：剩餘 5 {unit}／占用 3 {unit}／可用 2 {unit}。</p><p>通知會帶入該張方案的實際到期日。</p></LineCardPreview></div>}
        </div>;
      })}
      <details className="border-t px-4 text-xs text-earth-600"><summary className="min-h-11 cursor-pointer py-3">共用發送規則</summary><p className="pb-3">每張卡獨立計算可用額度（剩餘扣除預約占用）；低額度對同一位成員每卡提醒一次。到期提醒依各方案設定天數於 18:00 發送，每位成員每個到期階段只成功送達一次；額度已全部占用、已結清或退款時不發送。更改天數不補發已過的提醒，也不變更方案期限。每項可設定 1–365 天，最多 6 次。</p></details>
      {pages > 1 && <nav aria-label="提醒方案分頁" className="flex items-center justify-between gap-2 border-t p-3"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded border px-3 disabled:opacity-40">上一頁</button><span className="text-sm">{currentPage}／{pages} 頁 · {filtered.length} 項</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded border px-3 disabled:opacity-40">下一頁</button></nav>}
      <div className="sticky bottom-0 z-10 space-y-2 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p role="status" className="text-sm text-primary-800">{message || (changes.length ? `${changes.length} 項尚未儲存` : "所有設定已儲存")}</p>
        {discard ? <div role="alert"><p className="text-sm">要捨棄所有未儲存的提醒設定嗎？</p><div className="mt-2 flex gap-2"><button type="button" className="min-h-11 rounded border px-3" onClick={() => setDiscard(false)}>繼續編輯</button><button type="button" className="min-h-11 rounded border px-3" onClick={() => { setDrafts(saved); setDiscard(false); setMessage(""); }}>捨棄修改</button></div></div> : <div className="flex justify-end gap-2"><button type="button" disabled={pending || !changes.length} onClick={() => setDiscard(true)} className="min-h-11 rounded-lg border px-4 disabled:opacity-40">取消修改</button><button type="button" disabled={pending || !changes.length} onClick={save} className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-40">{pending ? "儲存中…" : "儲存全部修改"}</button></div>}
      </div>
    </div>
  </details>;
}
