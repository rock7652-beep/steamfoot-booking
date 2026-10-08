"use client";

import { useState } from "react";
import { useFormDraft, FormDraftNotice } from "@/components/operations/use-form-draft";
import { CONSULTATION_LEAD_STATUSES } from "@/lib/consultation-lead";
import { updateConsultationLead, type ConsultationMutationResult } from "./consultation-actions";

const control = "min-h-11 max-w-full rounded-lg border px-3 py-2 text-sm";
const button = "min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50";
type BaseProps = { id: string; revision: number };

function useLeadMutation(props: BaseProps) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ConsultationMutationResult | null>(null);
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const [savedRevision, setSavedRevision] = useState(props.revision);
  const revision = Math.max(props.revision, savedRevision);
  async function save(form: FormData, onSaved: () => void) {
    setPending(true);
    try {
      const response = await updateConsultationLead(form);
      setResult(response);
      if (response.success) {
        setSavedRevision(response.revision ?? revision);
        setConfirmedRevision(null);
        onSaved();
      }
    } catch {
      setResult({ success: false, message: "無法儲存，請確認 HQ 權限與連線。輸入已保留。" });
    } finally { setPending(false); }
  }
  return { pending, result, revision, confirmedRevision, save, acceptLatest: () => {
    if (!result?.conflict) return;
    setConfirmedRevision(result.conflict.revision);
    setResult(null);
  } };
}
function Result({ mutation }: { mutation: ReturnType<typeof useLeadMutation> }) {
  const result = mutation.result;
  return result ? <div className="space-y-2 text-sm" role={result.success ? "status" : "alert"}>
    <p className={result.success ? "text-primary-800" : "text-amber-900"}>{result.message}</p>
    {result.conflict && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p>最新修訂 {result.conflict.revision} · 狀態：{CONSULTATION_LEAD_STATUSES[result.conflict.status as keyof typeof CONSULTATION_LEAD_STATUSES] ?? result.conflict.status}</p>
      <p className="break-all">目前關聯：{result.conflict.applicationId ?? "尚未關聯"}</p>
      <button type="button" onClick={mutation.acceptLatest} className="min-h-11 underline">已核對最新資料，保留輸入繼續編輯</button>
    </div>}
  </div> : null;
}

export function ConsultationStatusForm(props: BaseProps & { status: string }) {
  const mutation = useLeadMutation(props);
  const draft = useFormDraft(`consultation-status:${props.id}`, { status: props.status }, String(mutation.revision));
  return <form className="space-y-2" onSubmit={async event => {
    event.preventDefault(); if (draft.busy.current) return; draft.busy.current = true;
    const form = new FormData(event.currentTarget);
    try { await mutation.save(form, draft.clear); } finally { draft.busy.current = false; }
  }}>
    <input type="hidden" name="id" value={props.id} /><input type="hidden" name="revision" value={mutation.confirmedRevision ?? draft.expectedRevision ?? mutation.revision} />
    <input type="hidden" name="operation" value="status" />
    <fieldset disabled={mutation.pending} className="flex flex-wrap items-center gap-3">
      <label className="min-w-0 text-sm">處理狀態 <select name="status" className={control} value={draft.values.status} onChange={event => draft.set("status", event.target.value)}>
        {Object.entries(CONSULTATION_LEAD_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button className={button} disabled={!draft.dirty || !!mutation.result?.conflict}>{mutation.pending ? "儲存中…" : "儲存狀態"}</button>
    </fieldset>
    <FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={draft.discard} /><Result mutation={mutation} />
  </form>;
}

export function ConsultationNoteForm(props: BaseProps) {
  const mutation = useLeadMutation(props);
  const draft = useFormDraft(`consultation-note:${props.id}`, { note: "" }, String(mutation.revision));
  return <form className="space-y-2" onSubmit={async event => {
    event.preventDefault(); if (draft.busy.current) return; draft.busy.current = true;
    const form = new FormData(event.currentTarget);
    try { await mutation.save(form, draft.clear); } finally { draft.busy.current = false; }
  }}>
    <input type="hidden" name="id" value={props.id} /><input type="hidden" name="revision" value={mutation.confirmedRevision ?? draft.expectedRevision ?? mutation.revision} />
    <input type="hidden" name="operation" value="note" />
    <fieldset disabled={mutation.pending} className="space-y-2">
      <label className="block text-sm">新增聯繫紀錄
        <textarea name="note" rows={3} required maxLength={2000} value={draft.values.note} onChange={event => draft.set("note", event.target.value)}
          className="mt-1 w-full min-w-0 rounded-lg border p-3 text-base" placeholder="記錄已完成的聯繫與下一步；儲存後保留原紀錄。" />
      </label>
      <p className="text-sm text-earth-600">紀錄只會新增，含操作人與時間；不會發送訊息。</p>
      <button className={button} disabled={!draft.values.note.trim() || !!mutation.result?.conflict}>{mutation.pending ? "儲存中…" : "新增紀錄"}</button>
    </fieldset>
    <FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={draft.discard} /><Result mutation={mutation} />
  </form>;
}

export function ConsultationLinkForm(props: BaseProps & { applicationId: string | null }) {
  const mutation = useLeadMutation(props);
  const draft = useFormDraft<{ applicationId: string; verified: boolean }>(`consultation-link:${props.id}`, { applicationId: props.applicationId ?? "", verified: false }, String(mutation.revision));
  return <form className="space-y-3" onSubmit={async event => {
    event.preventDefault(); if (draft.busy.current) return; draft.busy.current = true;
    const form = new FormData(event.currentTarget);
    try { await mutation.save(form, draft.clear); } finally { draft.busy.current = false; }
  }}>
    <input type="hidden" name="id" value={props.id} /><input type="hidden" name="revision" value={mutation.confirmedRevision ?? draft.expectedRevision ?? mutation.revision} />
    <input type="hidden" name="operation" value="link" />
    <fieldset disabled={mutation.pending} className="space-y-3">
      <p className="text-sm text-earth-600">先在「體驗版開通資料」核對原始聯絡資訊，再貼上完整編號。系統不會依同名或 Email 自動配對。</p>
      <label className="block text-sm">體驗版開通資料編號
        <input name="applicationId" required maxLength={100} value={draft.values.applicationId} onChange={event => draft.setMany({ applicationId: event.target.value, verified: false })}
          className={`${control} mt-1 w-full min-w-0`} placeholder="完整的開通資料編號" autoComplete="off" />
      </label>
      <label className="flex min-h-11 items-start gap-2 text-sm leading-6">
        <input type="checkbox" name="verified" value="yes" required checked={draft.values.verified} onChange={event => draft.set("verified", event.target.checked)} className="mt-1.5 h-4 w-4 shrink-0" />
        我已人工核對，確認這個完整編號與本筆諮詢屬於同一店家，並同意儲存這次關聯。
      </label>
      <button className={button} disabled={!draft.values.verified || !!mutation.result?.conflict}>{mutation.pending ? "儲存中…" : props.applicationId ? "確認更改關聯" : "確認建立關聯"}</button>
    </fieldset>
    <FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={draft.discard} /><Result mutation={mutation} />
  </form>;
}

export function CopyLineId({ value }: { value: string }) {
  const [message, setMessage] = useState("");
  return <span className="inline-flex flex-wrap items-center gap-2">
    <span className="select-all break-all">{value}</span>
    <button type="button" className={control} onClick={async () => {
      try { await navigator.clipboard.writeText(value); setMessage("已複製 LINE ID"); }
      catch { setMessage("請選取 LINE ID 文字複製"); }
    }}>複製 LINE ID</button>
    <span role="status" className="text-sm">{message}</span>
  </span>;
}
