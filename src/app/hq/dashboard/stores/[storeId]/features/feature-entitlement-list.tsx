"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsListRow } from "@/components/settings/settings-workspace";
import { FeatureEntitlementForm, type FeatureEntitlementFormProps } from "./feature-entitlement-form";

type FeatureRow = Omit<FeatureEntitlementFormProps, "storeId" | "featureKey" | "onEditState"> & {
  key: string; label: string; category: string; description: string;
  baseAllowed: boolean; effectiveAllowed: boolean; statusLabel: string;
  statusClass: string; sourceLabel: string; requiresLineSetup: boolean;
};

export function FeatureEntitlementList({ storeId, categories, rows }: {
  storeId: string; categories: string[]; rows: FeatureRow[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editState, setEditState] = useState({ dirty: false, pending: false });
  const [destination, setDestination] = useState<(() => void) | null>(null);
  const report = useCallback((next: { dirty: boolean; pending: boolean }) => {
    setEditState(previous => previous.dirty === next.dirty && previous.pending === next.pending ? previous : next);
  }, []);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (editState.dirty || editState.pending) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [editState.dirty, editState.pending]);

  function request(change: () => void) {
    if (editState.dirty || editState.pending) setDestination(() => change);
    else change();
  }
  function closeEditor() { setEditing(null); report({ dirty: false, pending: false }); }
  const keyword = query.trim().toLocaleLowerCase();
  const visible = rows.filter(row => (!category || row.category === category) &&
    (!status || (status === "enabled" ? row.effectiveAllowed : !row.effectiveAllowed)) &&
    (!keyword || `${row.label} ${row.key} ${row.description} ${row.sourceLabel}`.toLocaleLowerCase().includes(keyword)));

  return <div className="min-w-0 overflow-hidden rounded-lg border border-earth-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-earth-200 bg-earth-50 px-4 py-3 text-sm">
      <h2 className="font-semibold text-primary-900">功能授權清單</h2>
      <p className="text-earth-600">{visible.length}／{rows.length} 項・修改才展開</p>
    </div>
    <div className="grid gap-3 border-b border-earth-200 p-4 sm:grid-cols-[minmax(0,1fr)_160px_160px]">
      <label className="grid gap-1 text-sm text-earth-600">搜尋功能<input value={query} onChange={event => { const value = event.target.value; request(() => { closeEditor(); setQuery(value); }); }} placeholder="功能名稱、說明或來源" className="min-h-11 min-w-0 rounded-lg border border-earth-200 px-3 text-earth-900" /></label>
      <label className="grid gap-1 text-sm text-earth-600">分類<select value={category} onChange={event => { const value = event.target.value; request(() => { closeEditor(); setCategory(value); }); }} className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-earth-900"><option value="">全部分類</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="grid gap-1 text-sm text-earth-600">實際權限<select value={status} onChange={event => { const value = event.target.value; request(() => { closeEditor(); setStatus(value); }); }} className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-earth-900"><option value="">全部狀態</option><option value="enabled">已開放</option><option value="disabled">未開放</option></select></label>
    </div>
    {destination && <div role="alert" className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{editState.pending ? "設定仍在儲存，請稍候。" : "尚有未儲存的修改，要捨棄嗎？"}</p><div className="mt-2 flex gap-3"><button type="button" onClick={() => setDestination(null)} className="min-h-11 rounded-lg border border-amber-300 bg-white px-3">繼續編輯</button>{!editState.pending && <button type="button" onClick={() => { closeEditor(); destination(); setDestination(null); }} className="min-h-11 rounded-lg bg-primary-700 px-3 text-white">捨棄並繼續</button>}</div></div>}
    <div className="px-4">
      {categories.map(group => {
        const items = visible.filter(row => row.category === group);
        return items.length ? <section key={group} aria-label={group}><h3 className="border-b border-earth-200 bg-earth-50 px-2 py-2 text-sm font-semibold text-earth-700">{group}</h3>{items.map(row => <SettingsListRow key={row.key} title={row.label} summary={row.description} expanded={editing === row.key} controls={editing === row.key && editState.dirty ? <span className="text-sm text-amber-700">未儲存</span> : undefined} onEdit={() => request(() => { report({ dirty: false, pending: false }); setEditing(editing === row.key ? null : row.key); })} columns={[
          { label: "基本授權", content: <span className={row.baseAllowed ? "text-primary-700" : "text-earth-500"}>{row.baseAllowed ? "開放" : "未開放"}</span> },
          { label: "目前狀態", content: <><span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${row.statusClass}`}>{row.statusLabel}</span><p className="mt-1 text-earth-600">{row.effectiveAllowed ? "權限已開放" : "權限未開放"}</p></> },
          { label: "來源／期限", content: <><p className="text-earth-700">{row.sourceLabel}</p>{(row.startsAt || row.expiresAt) && <p className="mt-1 break-words text-earth-500">{row.startsAt || "立即"} ～ {row.expiresAt || "無期限"}</p>}</> },
        ]}>
          <p className="mb-2 text-sm text-earth-600">{row.description}</p>
          {row.requiresLineSetup && row.effectiveAllowed && <p className="mb-2 text-sm text-amber-800">LINE 須另行設定與實測發送。</p>}
          <FeatureEntitlementForm storeId={storeId} featureKey={row.key} override={row.override} source={row.source} startsAt={row.startsAt} expiresAt={row.expiresAt} note={row.note} onEditState={report} />
        </SettingsListRow>)}</section> : null;
      })}
      {!visible.length && <p className="py-10 text-center text-sm text-earth-500">沒有符合條件的資料</p>}
    </div>
  </div>;
}
