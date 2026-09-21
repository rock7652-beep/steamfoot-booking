"use client";
import { useRef, useState, useTransition } from "react";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { saveCourseLowBalanceSetting } from "@/server/actions/course-low-balance";
import { courseLowBalanceBody, courseLowBalanceSchema } from "@/lib/course-low-balance";
import { LineCardPreview } from "../../reminders/line-card-preview";

type Plan = { id: string; name: string; unit: string; isActive: boolean; lowBalanceEnabled: boolean; lowBalanceThreshold: number | null };
type Draft = { enabled: boolean; threshold: string };
const same = (a: Draft, b: Draft) => a.enabled === b.enabled && a.threshold === b.threshold;
export function CourseLowBalanceSettings({ plans }: { plans: Plan[] }) {
  const initial = () => Object.fromEntries(plans.map(p => [p.id, { enabled: p.lowBalanceEnabled, threshold: p.lowBalanceThreshold?.toString() ?? "" }]));
  const [saved, setSaved] = useState<Record<string, Draft>>(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const saving = useRef(false);
  const changes = plans.filter(p => !same(drafts[p.id], saved[p.id]));
  useSettingsPanelGuard(changes.length > 0, pending);
  const filtered = plans.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === "all" || saved[p.id].enabled));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  function update(id: string, patch: Partial<Draft>) { setDrafts(previous => ({ ...previous, [id]: { ...previous[id], ...patch } })); setMessage(""); }
  function save() {
    if (saving.current || !changes.length) return;
    const inputs = changes.map(p => ({ plan: p, parsed: courseLowBalanceSchema.safeParse({ planId: p.id, enabled: drafts[p.id].enabled, threshold: drafts[p.id].threshold === "" ? null : Number(drafts[p.id].threshold) }) }));
    const invalid = inputs.find(item => !item.parsed.success);
    if (invalid) { setMessage(`「${invalid.plan.name}」請填寫 0–1000000 的整數門檻，啟用時不可空白。`); return; }
    saving.current = true;
    start(async () => {
      let count = 0;
      try {
        for (const { plan, parsed } of inputs) {
          if (!parsed.success) continue;
          const result = await saveCourseLowBalanceSetting(parsed.data);
          if (!result.success) { setMessage(`已儲存 ${count} 項；「${plan.name}」：${result.error}。其餘修改已保留。`); return; }
          const value = { enabled: parsed.data.enabled, threshold: parsed.data.threshold?.toString() ?? "" };
          setSaved(previous => ({ ...previous, [plan.id]: value }));
          setDrafts(previous => ({ ...previous, [plan.id]: value }));
          count++;
        }
        setMessage(`已儲存 ${count} 項設定`);
      } catch { setMessage(`已儲存 ${count} 項；其餘修改已保留，請重試。`); }
      finally { saving.current = false; }
    });
  }
  return <details className="rounded-xl border border-earth-200 bg-white">
    <summary className="flex min-h-16 cursor-pointer flex-wrap items-center justify-between gap-2 p-4"><h2 className="font-semibold text-primary-900">低可用額度提醒</h2><span className="text-sm text-earth-600">已開啟 {plans.filter(p => saved[p.id].enabled).length}／{plans.length} 項 · 管理設定{changes.length > 0 ? ` · ${changes.length} 項未儲存` : ""}</span></summary>
    <div className="border-t border-earth-100">
      <div className="flex flex-wrap gap-2 p-4"><input aria-label="搜尋提醒方案" placeholder="搜尋方案名稱" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} className="min-h-11 min-w-0 flex-1 rounded-lg border px-3"/><select aria-label="篩選提醒方案" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="min-h-11 rounded-lg border px-3"><option value="all">全部方案</option><option value="enabled">已開啟</option></select></div>
      <p className="px-4 pb-3 text-xs text-earth-500">各方案獨立設定。搜尋、換頁及收合會保留修改，按儲存後才生效。</p>
      {!visible.length && <p className="p-4 text-sm text-earth-600">{plans.length ? "沒有符合條件的方案。" : "建立點數／堂數方案後，可在此設定提醒。"}</p>}
      {visible.map(plan => {
        const draft = drafts[plan.id], unit = plan.unit === "SESSION" ? "堂" : "點", open = editing === plan.id;
        return <div key={plan.id} className="border-t border-earth-100">
          <div className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="break-words font-medium text-primary-900">{plan.name}{!same(draft, saved[plan.id]) && <span className="ml-2 text-xs text-amber-700">未儲存</span>}</p><p className="mt-1 text-sm text-earth-600">{!plan.isActive ? "下架 · " : ""}{draft.enabled ? `可用 ≤ ${draft.threshold || "未設定"} ${unit}` : "未啟用"}</p></div><button type="button" aria-expanded={open} aria-controls={`reminder-${plan.id}`} onClick={() => setEditing(open ? null : plan.id)} className="min-h-11 shrink-0 rounded-lg border px-3 text-sm">{open ? "收合" : "編輯"}</button></div>
          {open && <fieldset id={`reminder-${plan.id}`} disabled={pending} className="space-y-3 bg-earth-50/60 p-4">
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft.enabled} onChange={e => update(plan.id, { enabled: e.target.checked })}/>啟用此方案低可用額度提醒</label>
            <label className="flex flex-wrap items-center gap-2 text-sm">可用額度低於或等於<input aria-label={`${plan.name} 提醒門檻`} type="number" min="0" max="1000000" step="1" value={draft.threshold} onChange={e => update(plan.id, { threshold: e.target.value })} className="min-h-11 w-24 rounded border border-earth-300 px-3"/>{unit}</label>
            <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-primary-700">訊息預覽與發送規則</summary><p className="mb-3 text-sm text-earth-600">每張卡分開判斷，使用剩餘扣除預約占用後的額度。每卡對同一位成員提醒一次；取消重約不重複提醒。</p><LineCardPreview title="方案可用額度提醒" subtitle="示意資料，非真實發送" actions={[{ label: "查看我的方案", variant: "primary" }, { label: "停止／管理此類提醒", variant: "link" }]}>{courseLowBalanceBody(plan.name, 5, 3, plan.unit)}</LineCardPreview></details>
          </fieldset>}
        </div>;
      })}
      {pages > 1 && <nav aria-label="提醒方案分頁" className="flex items-center justify-between gap-2 border-t p-3"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="min-h-11 rounded border px-3 disabled:opacity-40">上一頁</button><span className="text-sm">{currentPage}／{pages} 頁 · {filtered.length} 項</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="min-h-11 rounded border px-3 disabled:opacity-40">下一頁</button></nav>}
      <div className="sticky bottom-0 z-10 space-y-2 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p role="status" className="text-sm text-primary-800">{message || (changes.length ? `${changes.length} 項尚未儲存` : "所有設定已儲存")}</p>
        {discard ? <div role="alert"><p className="text-sm">要捨棄所有未儲存的提醒設定嗎？</p><div className="mt-2 flex gap-2"><button type="button" className="min-h-11 rounded border px-3" onClick={() => setDiscard(false)}>繼續編輯</button><button type="button" className="min-h-11 rounded border px-3" onClick={() => { setDrafts(saved); setDiscard(false); setMessage(""); }}>捨棄修改</button></div></div> : <div className="flex justify-end gap-2"><button type="button" disabled={pending || !changes.length} onClick={() => setDiscard(true)} className="min-h-11 rounded-lg border px-4 disabled:opacity-40">取消修改</button><button type="button" disabled={pending || !changes.length} onClick={save} className="min-h-11 rounded-lg bg-primary-700 px-4 text-white disabled:opacity-40">{pending ? "儲存中…" : "儲存全部修改"}</button></div>}
      </div>
    </div>
  </details>;
}
