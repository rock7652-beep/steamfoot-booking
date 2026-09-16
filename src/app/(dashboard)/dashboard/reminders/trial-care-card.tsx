"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TRIAL_CARE_LABELS, renderTrialCareBody, type TrialCareRule } from "@/lib/trial-care";
import { saveTrialCareSettings, stopCustomerTrialCare } from "@/server/actions/trial-care";

type CareLog = { id: string; customerId: string; customerName: string; stage: number; status: string; reason: string | null; createdAt: string };
export function TrialCareCard({ storeId, storeName, initialEnabled, initialRules, logs }: { storeId: string; storeName: string; initialEnabled: boolean; initialRules: TrialCareRule[]; logs: CareLog[] }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rules, setRules] = useState(initialRules);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  function update(index: number, patch: Partial<TrialCareRule>) { setRules(previous => previous.map((rule, i) => i === index ? { ...rule, ...patch } : rule)); }
  const status: Record<string, string> = { SENT: "已發送", SKIPPED: "已略過", FAILED: "發送失敗", SENDING: "已處理，等待結果" };
  return <section className="rounded-xl border border-earth-200 bg-white p-4 shadow-sm md:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-earth-800">體驗客後續關懷</h2><p className="mt-1 text-xs text-earth-500">本店獨立設定。確認文案並儲存啟用後，僅對新完成的體驗生效。</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={pending} onChange={e => setEnabled(e.target.checked)} />啟用體驗關懷</label></div>
    <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); start(async () => { try { const result = await saveTrialCareSettings({ storeId, enabled, rules }); setMessage(result.success ? "設定已儲存" : result.error); if (result.success) router.refresh(); } catch { setMessage("儲存失敗，請稍後重試"); } }); }}>
      {rules.map((rule, i) => <details key={i} className="rounded-lg border border-earth-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-earth-800">{TRIAL_CARE_LABELS[i]} · {rule.enabled ? "開啟" : "關閉"} · 體驗後第 {rule.days} 天 {rule.time}</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm"><label><input type="checkbox" checked={rule.enabled} disabled={pending} onChange={e => update(i, { enabled: e.target.checked })} /> 開啟此提醒</label><label>體驗後 <input aria-label={`${TRIAL_CARE_LABELS[i]}天數`} type="number" min={1} max={90} className="w-16 rounded border border-earth-200 p-1" value={rule.days} onChange={e => update(i, { days: Number(e.target.value) })} /> 天</label><label>時間 <input aria-label={`${TRIAL_CARE_LABELS[i]}時間`} type="time" min="09:00" max="20:55" step={300} value={rule.time} onChange={e => update(i, { time: e.target.value })} className="rounded border border-earth-200 p-1" /></label></div>
          <label className="block text-sm">訊息內容<textarea aria-label={`${TRIAL_CARE_LABELS[i]}訊息內容`} value={rule.body} maxLength={1000} rows={4} onChange={e => update(i, { body: e.target.value })} className="mt-1 w-full rounded-lg border border-earth-200 p-2" /></label>
          <p className="text-xs text-earth-500">可使用 {"{{customerName}}"}、{"{{storeName}}"}。{i === 0 ? "建議單純關心，不加入促銷；修改天數時請一併調整「昨天」等文字。" : "可自行加入真實優惠；顧客也能直接回覆本店 LINE 詢問。"}</p>
          <div className="rounded-lg bg-earth-50 p-3 text-sm"><p className="mb-2 text-xs text-earth-500">顧客訊息預覽</p><p className="whitespace-pre-wrap">{renderTrialCareBody(rule.body, "顧客", storeName)}</p>{i > 0 && <p className="mt-3 text-primary-700">了解方案／優惠（已設定本店 LINE 連結時顯示）</p>}<p className="mt-2 text-earth-500">不再接收此類訊息</p></div>
        </div>
      </details>)}
      <p className="text-xs leading-relaxed text-earth-500">台灣時間，排程約每 5 分鐘執行。各階段至少間隔 3 天。已購買方案或儲值停止邀請，已預約略過該次邀請。顧客可一鍵停止，預約通知不受影響。每階段只發一次，不補發；停止後重新啟用只處理新體驗。</p>
      <button disabled={pending} type="submit" className="rounded-lg bg-primary-700 px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "儲存中…" : enabled && !initialEnabled ? "確認文案並啟用" : "儲存設定"}</button>
      {message && <p role="status" className="text-sm text-earth-700">{message}</p>}
    </form>
    <details className="mt-4 border-t border-earth-100 pt-3"><summary className="cursor-pointer text-sm text-earth-700">最近關懷紀錄（最多 50 筆）</summary><div className="mt-2 space-y-2">{logs.length === 0 && <p className="text-sm text-earth-500">尚無紀錄，啟用不會補發歷史體驗。</p>}{logs.map(log => <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-earth-50 p-2 text-xs"><div><p>{log.customerName} · {TRIAL_CARE_LABELS[log.stage]} · {status[log.status] ?? log.status}</p><p className="mt-1 text-earth-500">{new Date(log.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} {log.reason}</p></div><button type="button" disabled={pending} className="text-earth-600 underline" onClick={() => start(async () => { try { const result = await stopCustomerTrialCare(log.customerId); setMessage(result.success ? `已停止 ${log.customerName} 的後續體驗關懷` : result.error); router.refresh(); } catch { setMessage("停止失敗，請稍後重試"); } })}>停止此顧客關懷</button></div>)}</div></details>
  </section>;
}
