"use client";

import { useEffect, useRef, useState } from "react";
import { useRetainedState } from "./operation-scope";

type Draft = { base: string | null; text: string } | null;
function validDraft(value: unknown): value is Draft {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (draft.base === null || typeof draft.base === "string") && typeof draft.text === "string" && draft.text.length <= 2000;
}
export type NoteSaveResult = { success: boolean; error?: string; currentValue?: string | null };
export function RetainedNoteEditor({ stateKey, title, hint, placeholder, value, canEdit, maxLength, tone = "green", quiet = false, optimistic = false, save, onSaved }: {
  quiet?: boolean; optimistic?: boolean; stateKey: string; title: string; hint: string; placeholder: string;
  value: string | null; canEdit: boolean; maxLength: number; tone?: "green" | "gold";
  save: (text: string | null, expected: string | null) => Promise<NoteSaveResult>;
  onSaved: (value: string | null) => void;
}) {
  const [draft, setDraft] = useRetainedState<Draft>(stateKey, null, validDraft);
  const [saved, setSaved] = useState({ source: value, value });
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<{ value: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{ before: string | null; after: string | null } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = saved.source === value ? saved.value : value;
  const dirty = !!draft && (draft.text.trim() || null) !== draft.base;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function submit(input = draft, undoing = false) {
    if (!input || busy.current || !canEdit || conflict) return;
    const next = input.text.trim() || null;
    if (next === input.base) { setDraft(null); return; }
    busy.current = true; setSaving(true); setMessage("");
    if(optimistic)setSaved({source:value,value:next});
    try {
      const result = await save(next, input.base);
      if (!mounted.current) return;
      if (!result.success) {
        if(optimistic)setSaved({source:value,value:input.base});
        setMessage(result.error ?? "尚未儲存，內容已保留");
        if (Object.prototype.hasOwnProperty.call(result, "currentValue")) setConflict({ value: result.currentValue ?? null });
        return;
      }
      setSaved({ source: value, value: next });
      setUndo(undoing ? null : { before: input.base, after: next });
      setDraft(null);
      onSaved(next);
    } catch {
      if(optimistic&&mounted.current)setSaved({source:value,value:input.base});
      if (mounted.current) setMessage("連線中斷，內容已保留。重新連線後可再儲存。");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return <div className={`${quiet ? "border-t border-earth-100 py-2" : `${tone === "gold" ? "steamfoot-brand-gold-accent" : "steamfoot-brand-green-accent"} rounded-xl border px-3 py-2.5`} col-span-2`}>
    <div className="flex min-h-11 items-center justify-between gap-3">
      <p className="text-sm font-semibold text-earth-700">{!draft && !current?.trim() ? `尚無${title}` : title}</p>
      {canEdit && !draft && <button type="button" className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary-700" onClick={() => {
        setDraft({ base: current, text: current ?? "" }); setMessage(""); setConflict(null); setUndo(null);
      }}>{current?.trim() ? "編輯" : "＋新增"}</button>}
      {canEdit && !draft && undo && current === undo.after && <button type="button" className="min-h-11 px-3 text-sm text-earth-600" onClick={() => {
        const restore = { base: undo.after, text: undo.before ?? "" };
        setDraft(restore); void submit(restore, true);
      }}>復原</button>}
    </div>
    {(draft || current?.trim()) && <p className="mb-2 text-xs text-earth-500">{hint}</p>}
    {saving && optimistic && <p role="status" className="text-xs text-earth-500">儲存中…</p>}
    {draft && canEdit && !(saving && optimistic) ? <div className="space-y-2">
      <textarea aria-label={title} value={draft.text} maxLength={maxLength} rows={3} disabled={saving}
        onChange={event => setDraft({ ...draft, text: event.target.value })} placeholder={placeholder}
        className="w-full rounded-lg border border-earth-200 bg-white p-3 text-base leading-relaxed focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100" />
      {message && <p role="alert" className="text-sm text-amber-800">{message}</p>}
      {conflict && <div className="rounded-lg bg-amber-50 p-3 text-sm">
        <p className="font-medium">目前已儲存的內容</p><p className="whitespace-pre-wrap">{conflict.value || "（空白）"}</p>
        <button type="button" className="mt-2 min-h-11 rounded-lg border px-3" onClick={() => {
          setDraft({ ...draft, base: conflict.value }); setConflict(null); setMessage("已保留你的輸入，請確認後儲存。");
        }}>保留我的輸入，繼續編輯</button>
      </div>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-earth-500">{draft.text.length} / {maxLength} 字</span>
        <div className="flex gap-2">
          <button type="button" disabled={saving} className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-50" onClick={() => {
            if (dirty && !window.confirm("捨棄這次尚未儲存的備註？")) return;
            setDraft(null); setConflict(null); setMessage("");
          }}>取消</button>
          <button type="button" disabled={saving || !!conflict} onClick={() => { void submit(); }} className="min-h-11 rounded-lg bg-primary-700 px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? "儲存中…" : "儲存"}</button>
        </div>
      </div>
    </div> : current?.trim() ? <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-earth-800">{current}</p> : null}
  </div>;
}
