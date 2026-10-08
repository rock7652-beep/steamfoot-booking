"use client";
import { useState } from "react";
import { useFormDraft, FormDraftNotice } from "@/components/operations/use-form-draft";
import { applicationStatuses } from "@/lib/trial-application";
import { updateApplication } from "./actions";
const control = "min-h-11 max-w-full rounded-lg border px-3 py-2 text-sm";
const button = "min-h-11 rounded-lg bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-50";
/** Retain unsaved progress when live filters temporarily remove a formal row. */
export function TrialApplicationStatusForm({ id, name, status }: { id: string; name: string; status: string }) {
  const draft = useFormDraft(`trial-application-status:${id}`, { status }, status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <form data-intake-dirty={draft.dirty || undefined} className="space-y-2" onSubmit={async event => {
    event.preventDefault(); if (draft.busy.current) return;
    draft.busy.current = true; setPending(true); setError("");
    try { await updateApplication(new FormData(event.currentTarget)); draft.clearSubmitted(); }
    catch { setError("無法更新進度，輸入已保留，請稍後再試。"); }
    finally { draft.busy.current = false; setPending(false); }
  }}>
    <input type="hidden" name="id" value={id} />
    <fieldset disabled={pending} className="flex flex-wrap items-center gap-3">
      <label className="text-sm">處理狀態 <select name="status" aria-label={`${name}處理狀態`} value={draft.values.status}
        onChange={event => draft.set("status", event.target.value)} className={control}>
        {Object.entries(applicationStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button className={button} disabled={!draft.dirty}>{pending ? "更新中…" : "更新進度"}</button>
    </fieldset>
    <FormDraftNotice dirty={draft.dirty} stale={draft.stale} onDiscard={draft.discard} />
    {error && <p role="alert" className="text-sm text-amber-900">{error}</p>}
  </form>;
}
