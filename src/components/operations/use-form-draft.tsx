"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRetainedState } from "./operation-scope";

type Fields = Record<string, string | boolean>;
type Draft<T> = { base: T; values: T; revision: string | null } | null;
/** Call from a component keyed by form kind and record ID. No writes are replayed. */
export function useFormDraft<T extends Fields>(key: string, initial: T, revision: string | null = null) {
  const valid = useCallback((value: unknown): value is Draft<T> => {
    if (value === null) return true;
    if (!value || typeof value !== "object") return false;
    const d = value as Exclude<Draft<T>, null>;
    const validFields = (v: unknown) => !!v && typeof v === "object" && Object.keys(initial).every(k =>
      typeof (v as Fields)[k] === typeof initial[k] && (typeof (v as Fields)[k] !== "string" || String((v as Fields)[k]).length <= 10000));
    return validFields(d.base) && validFields(d.values) && (d.revision === null || typeof d.revision === "string");
  }, [initial]);
  const [draft, setDraft] = useRetainedState<Draft<T>>(`form:${key}`, null, valid);
  const values = draft?.values ?? initial;
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!draft) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  function setMany(patch: Partial<T>) {
    setDraft(previous => {
      const base = previous?.base ?? initial;
      const next = { ...(previous?.values ?? initial), ...patch };
      return Object.keys(base).every(k => base[k] === next[k]) ? null : { base, values: next, revision: previous?.revision ?? revision };
    });
  }
  function set<K extends keyof T>(field: K, value: T[K]) { setMany({ [field]: value } as unknown as Partial<T>); }
  function discard() {
    if (busy.current) return false;
    if (draft && !window.confirm("捨棄尚未儲存的修改，回到目前已儲存的資料？")) return false;
    setDraft(null);
    return true;
  }
  return { values, set, setMany, dirty: !!draft, expectedRevision: draft?.revision ?? revision,
    stale: !!draft && draft.revision !== revision, clear: () => setDraft(null),
    // A save may finish while its row is filtered out. Clear only the exact
    // submitted draft in this scope; a subsequent edit creates a new object.
    clearSubmitted: () => setDraft(current => current === draft ? null : current),
    discard, busy, mounted };
}
export function FormDraftNotice({ dirty, stale, onDiscard }: { dirty: boolean; stale: boolean; onDiscard: () => void }) {
  if (!dirty) return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-800" role="status">
    <span>{stale ? "資料已有更新，你的輸入已保留，請先核對目前資料。" : "尚未儲存 · 已保留草稿"}</span>
    <button type="button" className="min-h-11 underline" onClick={onDiscard}>捨棄草稿</button>
  </div>;
}
