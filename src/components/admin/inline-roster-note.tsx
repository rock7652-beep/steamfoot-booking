"use client";

import { useEffect, useRef, useState } from "react";
import { useRetainedState } from "@/components/operations/operation-scope";
import type { NoteSaveResult } from "@/components/operations/retained-note-editor";
import styles from "./roster-reminders.module.css";

export type InlineRosterNote = {
  scopeKey: string;
  maxLength: number;
  save: (notes: string | null, expected: string | null) => Promise<NoteSaveResult>;
  onSaved: (notes: string | null) => void;
};
type Draft = { base: string | null; text: string } | null;
const validDraft = (value: unknown): value is Draft => value === null || (!!value && typeof value === "object" &&
  "base" in value && (value.base === null || typeof value.base === "string") &&
  "text" in value && typeof value.text === "string" && value.text.length <= 2000);

/** A keyed, retained row editor. Server adapters own module permissions and validation. */
export function InlineRosterNoteEditor({ name, value, canEdit, config }: {
  name: string; value: string | null; canEdit: boolean; config: InlineRosterNote;
}) {
  const [draft, setDraft] = useRetainedState<Draft>(`inline-roster-note:${config.scopeKey}`, null, validDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<{ value: string | null } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const expanded = draft !== null;
  useEffect(() => { if (expanded) textarea.current?.focus({ preventScroll: true }); }, [expanded]);
  const dirty = !!draft && (draft.text.trim() || null) !== (draft.base?.trim() || null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function cancel() {
    if (busy.current) return;
    if (dirty && !window.confirm("捨棄這次尚未儲存的備註？")) return;
    setDraft(null); setError(""); setConflict(null);
    trigger.current?.focus({ preventScroll: true });
  }
  async function submit() {
    if (!draft || !canEdit || busy.current || conflict) return;
    const submitted = draft;
    const next = draft.text.trim() || null;
    if (next === (draft.base?.trim() || null)) { setDraft(null); trigger.current?.focus({ preventScroll: true }); return; }
    busy.current = true; setSaving(true); setError("");
    try {
      const result = await config.save(next, draft.base);
      if (!mounted.current) {
        // Filtering can unmount a row while its write succeeds. Clear only the
        // exact submitted draft in its old retained scope, never newer input.
        if (result.success) setDraft(current => current?.base === submitted.base && current.text === submitted.text ? null : current);
        return;
      }
      if (!result.success) {
        setError(result.error || "尚未儲存，內容已保留");
        if (Object.prototype.hasOwnProperty.call(result, "currentValue")) setConflict({ value: result.currentValue ?? null });
        return;
      }
      config.onSaved(next);
      setDraft(null);
      trigger.current?.focus({ preventScroll: true });
    } catch {
      if (mounted.current) setError("連線中斷，內容已保留。請再試一次。");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return <>
    <span className={styles.actionSlot}>
      {canEdit && <button ref={trigger} type="button" className={styles.iconAction} aria-label={`${name} 本次備註`}
        aria-expanded={expanded} title={value?.trim() ? "編輯本次備註" : "新增本次備註"}
        onClick={event => {
          event.stopPropagation();
          if (expanded) { textarea.current?.focus({ preventScroll: true }); return; }
          setDraft({ base: value, text: value ?? "" }); setError(""); setConflict(null);
        }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m15 4 5 5M4 20l4-1 12-12a2.1 2.1 0 0 0-3-3L5 16Z"/></svg>
      </button>}
    </span>
    {draft && <div ref={editor} className={styles.inlineEditor} data-inline-roster-note onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
      }}>
      <label className="block text-sm font-medium">本次備註
        <textarea ref={textarea} aria-label={`${name} 本次備註內容`} value={draft.text} rows={3} maxLength={config.maxLength}
          disabled={saving || !canEdit} onChange={event => setDraft({ ...draft, text: event.target.value })}
          className="mt-1 block w-full min-w-0 resize-y rounded-lg border border-earth-200 bg-white p-2 text-sm leading-relaxed focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100" />
      </label>
      {!canEdit && <p role="alert" className="text-sm text-amber-800">目前無編輯權限，草稿已保留。</p>}
      {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
      {conflict && <div className="space-y-1 text-sm"><p className="whitespace-pre-wrap break-words">目前備註：{conflict.value || "（空白）"}</p>
        <button type="button" disabled={saving || !canEdit} className="min-h-11 rounded border px-3" onClick={() => {
          setDraft({ ...draft, base: conflict.value }); setConflict(null); setError("請確認後再儲存。");
        }}>保留我的輸入</button></div>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-sm text-earth-500">未儲存</span>}
        <button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3 text-sm disabled:opacity-50" disabled={saving} onClick={cancel}>取消</button>
        <button type="button" className="min-h-11 rounded-lg bg-primary-700 px-3 text-sm text-white disabled:opacity-50" disabled={saving || !canEdit || !!conflict} onClick={() => { void submit(); }}>{saving ? "儲存中…" : "儲存"}</button>
      </div>
    </div>}
  </>;
}
