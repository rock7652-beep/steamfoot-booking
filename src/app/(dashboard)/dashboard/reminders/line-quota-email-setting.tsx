"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { getLineQuotaNotificationSetting, saveLineQuotaNotificationSetting, sendLineQuotaTestEmail } from "@/server/actions/line-quota-notifications";
import { quotaThreshold } from "@/lib/line-quota-policy";
import { DashboardLink } from "@/components/dashboard-link";

type Data = Awaited<ReturnType<typeof getLineQuotaNotificationSetting>>;
export function LineQuotaEmailSetting({ initial, baseHref = "/dashboard/reminders" }: { initial: Data; baseHref?: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState({ enabled: initial.enabled });
  const [draft, setDraft] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const submitting = useRef(false);
  const dirty = draft.enabled !== saved.enabled;
  useSettingsPanelGuard(dirty, busy);
  const snapshots = initial.snapshot && typeof initial.snapshot === "object" && !Array.isArray(initial.snapshot) ? initial.snapshot : {};
  const warnings = Object.entries(snapshots).flatMap(([source, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.used !== "number" || !(value.limit === null || typeof value.limit === "number")) return [];
    const quota = { used: value.used, limit: value.limit };
    const threshold = quotaThreshold(quota);
    return threshold ? [`${source === "CENTRAL" ? "共用" : "分店"} LINE：${quota.used}／${quota.limit} 則${threshold === 100 ? "，額度已用完" : "，額度即將用完"}`] : [];
  });
  async function run(test: boolean) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setFeedback("");
    try {
      if (test) {
        const result = await sendLineQuotaTestEmail();
        setFeedback(result.success ? ("message" in result ? result.message : "請確認收件匣") : result.error);
      } else {
        const result = await saveLineQuotaNotificationSetting(draft);
        if (result.success) { setSaved(draft); setEditing(false); setFeedback("已儲存"); }
        else setFeedback(result.error);
      }
      router.refresh();
    } catch { setFeedback("目前無法完成，請稍後再試"); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section aria-label="LINE 額度 Email 通知" className="space-y-3 rounded-xl border border-earth-200 bg-white p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1 break-words"><h2 className="font-semibold">LINE 額度 Email 通知</h2><p className="mt-1 text-earth-600">{saved.enabled ? "開啟" : "尚未開啟"}{`・${initial.recipients.length} 個老闆信箱`}</p></div>
      {!editing && <button type="button" onClick={() => setEditing(true)} className="min-h-11 px-3 text-primary-700">修改</button>}
    </div>
    <p className="text-earth-600">額度達 80%、95% 或用完時提醒，並彙整發送失敗紀錄。</p>
    <details className="rounded-lg border border-earth-200">
      <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-medium text-primary-700">收件信箱與通知預覽</summary>
    <div className="space-y-3 border-t border-earth-100 p-3 text-earth-600">
      <p>自動通知本店所有啟用中老闆的登入信箱。</p>
      {initial.recipients.length > 0 ? <ul className="space-y-1">{initial.recipients.map(email => <li key={email} className="break-all">{email}</li>)}</ul> : <p role="status" className="text-amber-800">老闆尚未設定有效登入 Email，請至人員管理補齊。</p>}
      {initial.missingEmailCount > 0 && <p role="status" className="text-amber-800">有 {initial.missingEmailCount} 位老闆缺少有效登入 Email，無法收到通知。</p>}
      <div className="space-y-2 rounded-lg bg-earth-50 p-3"><p className="font-medium">Email 示範・不會寄出</p><p>本店 LINE 訊息額度已使用 95% 以上，請確認方案與剩餘額度。</p><p>昨日有 LINE 發送失敗紀錄時，會另外寄送摘要。</p></div>
      {initial.recipients.length > 0 && !editing && <button type="button" disabled={busy || !initial.readiness.configured || initial.readiness.blocked} onClick={() => void run(true)} className="min-h-11 rounded-lg border border-earth-300 px-4 disabled:opacity-50">{busy ? "處理中…" : "寄送測試信給所有老闆"}</button>}
    </div></details>
    {initial.readiness.blocked ? <p className="text-amber-800">預覽環境不會實際寄信。</p> : !initial.readiness.configured ? <p role="alert" className="text-amber-800">寄信服務尚未設定完成，請聯絡蒸管家。</p> : null}
    {warnings.length > 0 && <div role="alert" className="space-y-1 rounded-lg bg-amber-50 p-3 text-amber-900">{warnings.map(text => <p key={text}>{text}</p>)}<DashboardLink className="inline-flex min-h-11 items-center underline" href={`${baseHref}?tab=logs&status=FAILED`}>查看未成功送出的提醒</DashboardLink><p>請確認 LINE 方案或加購額度；共用 LINE 請聯絡蒸管家。</p></div>}
    {initial.lastError && <p role="alert" className="break-words text-amber-800">{initial.lastError}；目前資料可能不是最新狀態。</p>}
    {initial.latest?.status === "FAILED" && <p role="alert" className="text-red-700">{initial.latest.error ?? "Email 未成功寄出"}</p>}
    {initial.lastCheckedAt && <p className="text-earth-500">上次檢查：{new Date(initial.lastCheckedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</p>}
    {editing && <form className="space-y-3 border-t border-earth-100 pt-3" onSubmit={event => { event.preventDefault(); void run(false); }}>

      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />開啟額度通知與每日失敗摘要</label>
      <div className="flex flex-wrap gap-3"><button disabled={busy || (draft.enabled && !initial.recipients.length)} className="min-h-11 rounded-lg bg-primary-700 px-4 text-white">{busy ? "處理中…" : "儲存"}</button><button type="button" disabled={busy} className="min-h-11 px-3" onClick={() => { setDraft(saved); setEditing(false); }}>取消</button></div>
    </form>}
    {feedback && <p role="status" className="break-words text-earth-700">{feedback}</p>}
  </section>;
}
