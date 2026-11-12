"use client";
import {rebaseFormDraft} from "@/lib/form-draft-rebase";

import { useCallback, useEffect, useRef } from "react";
import { useRetainedState } from "./operation-scope";

type Fields = Record<string, string | boolean>;
type Draft<T> = { base: T; values: T; revision: string | null } | null;
/** Call from a component keyed by form kind and record ID. No writes are replayed. */
export function useFormDraft<T extends Fields>(key: string, initial: T, revision: string | null = null,options?:{reconcile:boolean;sameRevision:(left:string|null,right:string|null)=>boolean}) {
  const valid = useCallback((value: unknown): value is Draft<T> => {
    if (value === null) return true;
    if (!value || typeof value !== "object") return false;
    const d = value as Exclude<Draft<T>, null>;
    const validFields = (v: unknown) => !!v && typeof v === "object" && Object.keys(initial).every(k =>
      typeof (v as Fields)[k] === typeof initial[k] && (typeof (v as Fields)[k] !== "string" || String((v as Fields)[k]).length <= 10000));
    return validFields(d.base) && validFields(d.values) && (d.revision === null || typeof d.revision === "string");
  }, [initial]);
  const [retainedDraft, setDraft] = useRetainedState<Draft<T>>(`form:${key}`, null, valid);
  const sameRevision=options?.sameRevision??Object.is;
  function currentDraft(saved:Draft<T>):Draft<T>{
    if(!saved||!options?.reconcile||sameRevision(saved.revision,revision))return saved;
    const conflicts=Object.keys(initial).some(key=>saved.values[key]!==saved.base[key]&&initial[key]!==saved.base[key]&&initial[key]!==saved.values[key]);
    if(conflicts)return saved;
    const merged=rebaseFormDraft(saved.base,saved.values,initial);
    return Object.keys(initial).every(key=>merged[key]===initial[key])?null:{base:initial,values:merged,revision};
  }
  const draft=currentDraft(retainedDraft);
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
      previous=currentDraft(previous);
      const base = {...(previous?.base ?? initial)};
      // Editing an actually changed field acknowledges its current value;
      // other conflicting fields remain protected until edited in turn.
      if(options?.reconcile&&previous&&!sameRevision(previous.revision,revision)){
        for(const key of Object.keys(patch) as Array<keyof T>)if(previous.values[key]!==previous.base[key]&&initial[key]!==previous.base[key]&&initial[key]!==previous.values[key])base[key]=initial[key];
      }
      const next = { ...(previous?.values ?? initial), ...patch };
      return Object.keys(base).every(k => base[k] === next[k]) ? null : { base, values: next, revision: previous?.revision ?? revision };
    });
  }
  function set<K extends keyof T>(field: K, value: T[K]) { setMany({ [field]: value } as unknown as Partial<T>); }
  function discard() {
    if (busy.current) return false;
    setDraft(null);
    return true;
  }
  function rebase() {
    if(busy.current||!draft)return false;
    const merged=rebaseFormDraft(draft.base,draft.values,initial);
    setDraft(Object.keys(initial).every(key=>merged[key]===initial[key])?null:{base:initial,values:merged,revision});
    return true;
  }
  const reviewChanges=draft?Object.keys(draft.base).filter(key=>draft.values[key]!==draft.base[key]||initial[key]!==draft.base[key]).map(key=>({key,current:initial[key],value:draft.values[key],edited:draft.values[key]!==draft.base[key]})):[];
  const conflictingFields=draft?Object.keys(initial).filter(key=>draft.values[key]!==draft.base[key]&&initial[key]!==draft.base[key]&&initial[key]!==draft.values[key]):[];
  return { values, set, setMany, rebase, reviewChanges, conflictingFields, dirty: !!draft, expectedRevision: draft?.revision ?? revision,
    stale: !!draft && !sameRevision(draft.revision,revision), clear: () => setDraft(null),
    // A save may finish while its row is filtered out. Clear only the exact
    // submitted draft in this scope; a subsequent edit creates a new object.
    clearSubmitted: () => setDraft(current => current === retainedDraft ? null : current),
    discard, busy, mounted };
}
export function FormDraftNotice({ dirty, stale, onDiscard, onRebase, changes=[], disabled=false }: { dirty: boolean; stale: boolean; onDiscard: () => void; onRebase?:()=>void; changes?:{label:string;current:string;value:string;edited?:boolean}[];disabled?:boolean }) {
  if (!dirty) return null;
  return <div className="space-y-2 text-sm text-amber-800" role="status">
    <div className="flex flex-wrap items-center justify-between gap-2"><span>{stale ? "資料已有更新，你的輸入已保留，請先核對目前資料。" : "尚未儲存 · 已保留草稿"}</span>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled} className="min-h-11 underline disabled:opacity-50" onClick={onDiscard}>{stale&&onRebase?"使用最新資料":"捨棄草稿"}</button>
    {stale&&onRebase&&<button type="button" disabled={disabled} className="min-h-11 underline disabled:opacity-50" onClick={onRebase}>保留修改，重新確認</button>}</div></div>
    {stale&&onRebase&&changes.length>0&&<details><summary className="min-h-11 cursor-pointer py-2">比較本次修改（{changes.length} 項）</summary><dl className="space-y-2 rounded-lg border border-amber-200 p-3">{changes.map(change=><div key={change.label} className="min-w-0 break-words"><dt className="font-medium">{change.label}</dt><dd>最新資料：{change.current||"未填"}</dd><dd>{change.edited===false?"原畫面值":"本次修改"}：{change.value||"未填"}</dd>{change.edited===false&&<dd>本欄未修改，重新確認時採用最新資料。</dd>}</div>)}</dl></details>}
  </div>;
}
