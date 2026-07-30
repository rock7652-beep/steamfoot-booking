"use client";

import { useState, useTransition } from "react";
import { applyZhubeiMessengerV13PublishAction, previewZhubeiMessengerV13PublishAction } from "./flow-v13-publish-actions";
import type { V13Preview } from "@/server/services/zhubei-messenger-v13-publish";

const confirmationText = "PUBLISH_ZHUBEI_MESSENGER_V13";

export function FlowV13PublishPanel() {
  const [preview, setPreview] = useState<V13Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const loadPreview = () => startTransition(async () => {
    const result = await previewZhubeiMessengerV13PublishAction();
    if (!result.success) return setMessage(result.error);
    setPreview(result.preview); setMessage(null);
  });
  const apply = () => startTransition(async () => {
    const result = await applyZhubeiMessengerV13PublishAction(confirmation);
    if (!result.success) return setMessage(result.error);
    setMessage(result.result === "ALREADY_UPGRADED" ? "流程已升級；未建立新版本。" : `已安全發布 v${result.version.version}。`);
    setPreview(result.preview); setConfirmation("");
  });
  const ready = preview?.status === "READY" && preview.activeVersion === 12 && preview.targetVersion === 13 && preview.createLeadStepKey === "inquiry-create-lead" && preview.currentSelector === "MISSING";
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
    <h2 className="text-base font-semibold text-amber-950">Messenger Flow v13 發布</h2>
    <p className="mt-1 text-sm text-amber-900">僅限竹北 OWNER。先唯讀檢查，再以固定確認字串發布不可變更的新版本。</p>
    <button type="button" disabled={pending} onClick={loadPreview} className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">檢查發布內容</button>
    {preview ? <div className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-950">
      <p>Store：{preview.storeSlug}</p><p>Active version：v{preview.activeVersion}</p><p>Target version：{preview.targetVersion === null ? "—" : `v${preview.targetVersion}`}</p>
      <p>CREATE_LEAD step：{preview.createLeadStepKey ?? "—"}</p><p>Selector：{preview.currentSelector} → {preview.plannedSelector}</p>
      <p>建立新版本：{preview.willCreateNewVersion ? "是" : "否"}；切換 active：{preview.willSwitchActiveVersion ? "是" : "否"}</p>
      <p>v12／conversation／lead／submittedAnswers：均不修改</p><p>狀態：<strong>{preview.status}</strong></p>
      {ready ? <div className="mt-3 border-t border-amber-100 pt-3"><label className="block font-medium" htmlFor="v13-confirmation">輸入 {confirmationText} 確認發布<input id="v13-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded border border-amber-300 px-3 py-2 font-mono text-sm" /></label><button type="button" disabled={pending || confirmation !== confirmationText} onClick={apply} className="mt-3 rounded-lg bg-amber-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">確認發布 v13</button></div> : null}
    </div> : null}
    {message ? <p className="mt-3 text-sm text-amber-900">{message}</p> : null}
  </section>;
}
