"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { defaultTrialCareRules, TRIAL_CARE_LABELS, renderTrialCareBody, type TrialCareRule } from "@/lib/trial-care";
import { saveTrialCareSettings, stopCustomerTrialCare } from "@/server/actions/trial-care";

type CareLog = { id: string; customerId: string; customerName: string; stage: number; status: string; reason: string | null; createdAt: string };
const STATUS: Record<string, string> = { SENT: "已發送", SKIPPED: "已略過", FAILED: "發送失敗", SENDING: "已處理，等待結果" };

function CareSwitch({ checked, label, disabled, onChange }: { checked: boolean; label: string; disabled: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`inline-flex h-9 w-14 shrink-0 items-center rounded-full p-1 transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600 disabled:opacity-50 ${checked ? "bg-primary-600" : "bg-earth-200"}`}><span className={`h-7 w-7 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} /></button>;
}

export function TrialCareCard({ storeId, storeName, hasOfferLink, initialEnabled, initialRules, logs }: { storeId: string; storeName: string; hasOfferLink: boolean; initialEnabled: boolean; initialRules: TrialCareRule[]; logs: CareLog[] }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rules, setRules] = useState(initialRules);
  const [saved, setSaved] = useState({ enabled: initialEnabled, rules: initialRules });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const textareas = useRef<(HTMLTextAreaElement | null)[]>([]);
  const id = useId();
  const router = useRouter();
  const dirty = enabled !== saved.enabled || JSON.stringify(rules) !== JSON.stringify(saved.rules);
  function update(index: number, patch: Partial<TrialCareRule>) {
    setMessage("");
    setRules(previous => previous.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  }
  function insert(index: number, token: string) {
    const field = textareas.current[index];
    const body = rules[index].body;
    const from = field?.selectionStart ?? body.length;
    const to = field?.selectionEnd ?? from;
    if (body.length - (to - from) + token.length > 1000) { setMessage("訊息最多 1000 字，請先縮短內容。"); return; }
    update(index, { body: body.slice(0, from) + token + body.slice(to) });
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(from + token.length, from + token.length); });
  }
  return <section className="rounded-2xl border border-earth-200 bg-white shadow-sm md:col-span-2">
    <header className="flex items-start justify-between gap-4 p-5">
      <div><h2 className="font-semibold text-earth-900">體驗客後續關懷</h2><p className="mt-1 text-sm text-earth-500">先關心，再邀請。各店獨立設定，僅適用於啟用後新完成的體驗。</p></div>
      <CareSwitch checked={enabled} label="啟用整組體驗關懷" disabled={pending} onChange={value => { setEnabled(value); setMessage(""); }} />
    </header>
    <div role="status" className={`mx-5 rounded-xl px-4 py-3 text-sm ${saved.enabled ? "bg-primary-50 text-primary-800" : "bg-earth-50 text-earth-700"}`}>
      <p className="font-medium">{saved.enabled ? "整組已啟用，依已儲存設定發送" : "整組尚未啟用，不會發送"}</p>
      {dirty && <p className="mt-1 text-xs">有尚未儲存的變更，按下方儲存後才會生效。</p>}
    </div>
    <form className="mt-4" onSubmit={e => {
      e.preventDefault();
      start(async () => {
        try {
          const result = await saveTrialCareSettings({ storeId, enabled, rules });
          if (result.success) { setSaved({ enabled, rules }); setMessage("設定已儲存"); router.refresh(); }
          else setMessage(result.error);
        } catch { setMessage("儲存失敗，請稍後重試"); }
      });
    }}>
      <div className="space-y-3 px-5">
        {rules.map((rule, i) => <div key={i} className="overflow-hidden rounded-xl border border-earth-200">
          <div className="flex items-center gap-3 p-4">
            <button type="button" aria-expanded={expanded === i} aria-controls={`${id}-stage-${i}`} onClick={() => setExpanded(expanded === i ? null : i)} className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-primary-600">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">{i + 1}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-earth-900">{TRIAL_CARE_LABELS[i]}</span><span className="mt-1 block text-xs text-earth-500">體驗後第 {rule.days} 天 · {rule.time} · {rule.enabled ? (saved.enabled && enabled ? "發送" : "啟用後發送") : "不發送"}</span></span>
              <span aria-hidden="true" className="text-earth-400">{expanded === i ? "⌃" : "⌄"}</span>
            </button>
            <CareSwitch checked={rule.enabled} label={`${TRIAL_CARE_LABELS[i]}開關`} disabled={pending} onChange={value => update(i, { enabled: value })} />
          </div>
          {expanded === i && <div id={`${id}-stage-${i}`} className="grid gap-5 border-t border-earth-100 bg-earth-50/40 p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <fieldset disabled={pending} className="min-w-0 space-y-4">
              <legend className="sr-only">{TRIAL_CARE_LABELS[i]}編輯</legend>
              <div className="flex flex-wrap items-center gap-4 text-sm text-earth-700">
                <label>體驗後 <input aria-label={`${TRIAL_CARE_LABELS[i]}天數`} type="number" required min={1} max={90} className="mx-1 w-16 rounded-lg border border-earth-200 bg-white p-2" value={rule.days} onChange={e => update(i, { days: Number(e.target.value) })} /> 天</label>
                <label>傳送時間 <input aria-label={`${TRIAL_CARE_LABELS[i]}時間`} type="time" required min="09:00" max="20:55" step={300} value={rule.time} onChange={e => update(i, { time: e.target.value })} className="rounded-lg border border-earth-200 bg-white p-2" /></label>
              </div>
              <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label htmlFor={`${id}-body-${i}`} className="text-sm font-medium text-earth-800">訊息內容</label><button type="button" onClick={() => update(i, { body: defaultTrialCareRules()[i].body })} className="text-xs text-primary-700 underline">使用預設文案</button></div>
                <div className="mb-2 flex flex-wrap gap-2">{[{ label: "插入顧客姓名", token: "{{customerName}}" }, { label: "插入店名", token: "{{storeName}}" }].map(item => <button type="button" key={item.token} onClick={() => insert(i, item.token)} className="rounded-full border border-primary-200 bg-white px-3 py-1.5 text-xs text-primary-700 hover:bg-primary-50">＋{item.label}</button>)}</div>
                <textarea id={`${id}-body-${i}`} aria-label={`${TRIAL_CARE_LABELS[i]}訊息內容`} ref={element => { textareas.current[i] = element; }} value={rule.body} maxLength={1000} required rows={6} onChange={e => update(i, { body: e.target.value })} className="w-full rounded-xl border border-earth-200 bg-white p-3 text-sm leading-7" />
                <p className="mt-1 text-xs text-earth-500">姓名與店名會自動帶入。{i === 0 ? "這封以關心感受為主。" : "可加入本店優惠，顧客也能直接回覆 LINE 詢問。"}</p>
              </div>
              {i > 0 && !hasOfferLink && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">尚未設定本店官方 LINE 連結，因此不顯示「了解方案／優惠」按鈕。請至店家設定補上連結；停止接收按鈕仍會保留。</p>}
            </fieldset>
            <div className="min-w-0"><p className="mb-2 text-xs font-medium text-earth-500">LINE 卡片預覽 · 示意，按鈕不會發送訊息</p><div className="rounded-2xl bg-[#e5ece8] p-4"><p className="mb-2 text-xs text-earth-600">{storeName}</p><div className="mx-auto max-w-[320px] overflow-hidden rounded-2xl bg-white shadow-sm"><div className="whitespace-pre-wrap break-words p-5 text-sm leading-7 text-earth-800">{renderTrialCareBody(rule.body, "小雅", storeName) || "請輸入訊息內容"}</div><div className="space-y-2 px-4 pb-4">{i > 0 && hasOfferLink && <div className="rounded-lg bg-[#376452] px-3 py-3 text-center text-sm font-medium text-white">了解方案／優惠</div>}<div className="px-2 py-2 text-center text-sm text-primary-700">不再接收此類訊息</div></div></div></div><p className="mt-2 text-xs text-earth-500">停止接收為固定按鈕，不影響預約通知。</p></div>
          </div>}
        </div>)}
        <details className="px-1 py-2 text-xs text-earth-500"><summary className="cursor-pointer">發送規則與避免打擾</summary><p className="mt-2 leading-6">台灣時間，每 5 分鐘檢查。各階段至少間隔 3 天。已購買方案或儲值停止邀請；已預約略過該次邀請。每階段只發一次，不補發、不循環。重新啟用整組關懷只處理新體驗。</p></details>
      </div>
      <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-earth-200 bg-white/95 px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] backdrop-blur-sm">
        <p role="status" className="text-sm text-earth-600">{message || (dirty ? "有尚未儲存的變更" : "設定與文案修改後，請儲存生效")}</p><button disabled={pending || !dirty} type="submit" className="rounded-lg bg-primary-700 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{pending ? "儲存中…" : enabled && !saved.enabled ? "確認文案並啟用" : "儲存設定"}</button>
      </div>
    </form>
    <details className="border-t border-earth-100 p-5"><summary className="cursor-pointer text-sm text-earth-700">最近關懷紀錄</summary><div className="mt-3 space-y-2">{logs.length === 0 && <p className="text-sm text-earth-500">尚無紀錄，啟用不會補發歷史體驗。</p>}{logs.map(log => <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-earth-50 p-3 text-xs"><div><p>{log.customerName} · {TRIAL_CARE_LABELS[log.stage]} · {STATUS[log.status] ?? log.status}</p><p className="mt-1 text-earth-500">{new Date(log.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} {log.reason}</p></div><button type="button" disabled={pending} className="text-earth-600 underline" onClick={() => start(async () => { try { const result = await stopCustomerTrialCare(log.customerId); setMessage(result.success ? `已停止 ${log.customerName} 的後續體驗關懷` : result.error); router.refresh(); } catch { setMessage("停止失敗，請稍後重試"); } })}>停止此顧客關懷</button></div>)}</div></details>
  </section>;
}
