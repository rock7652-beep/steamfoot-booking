"use client";

import { useEffect, useState } from "react";
import { matchCustomerSearch, type CustomerSearchOption } from "@/lib/customer-search-index";

type Snapshot = { scope: string; rows: CustomerSearchOption[]; complete: boolean; requestKey?: string };

/** Per-mounted-view memory only: never persist customer data across login/store changes. */
export function CustomerInstantSearch({ storeId, value, onChange, onSelect, id, className, filterQuery = "" }: {
  storeId: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (customer: CustomerSearchOption) => void;
  id?: string;
  className?: string;
  filterQuery?: string;
}) {
  const [text, setText] = useState(value);
  const [composing, setComposing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [remote, setRemote] = useState<{ query: string; rows: CustomerSearchOption[] } | null>(null);
  const requestKey = `/api/customers/search-index?storeId=${encodeURIComponent(storeId)}${filterQuery ? `&${filterQuery}` : ""}`;
  // A changed filter/store must never render or select the old index, even
  // during the render before the request effect clears its state.
  const activeSnapshot = snapshot?.requestKey === requestKey ? snapshot : null;
  useEffect(() => { setText(value); }, [value]);
  useEffect(() => {
    const refresh = () => { setSnapshot(null); setRemote(null); setRevision((r) => r + 1); };
    window.addEventListener("focus", refresh);
    window.addEventListener("customer-search-invalidated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("customer-search-invalidated", refresh);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null); setError(false); setRemote(null);
    fetch(requestKey, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        const data = await response.json() as Snapshot;
        if (!controller.signal.aborted) setSnapshot({ ...data, requestKey });
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [requestKey, revision]);
  const query = composing ? "" : text.trim();
  useEffect(() => {
    if (!query || !activeSnapshot || activeSnapshot.complete) return;
    const controller = new AbortController();
    setRemote(null); setError(false);
    fetch(`${requestKey}&q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("search");
        const data = await response.json() as Snapshot;
        if (data.scope !== activeSnapshot.scope) throw new Error("scope changed");
        if (!controller.signal.aborted) setRemote({ query, rows: data.rows });
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [query, activeSnapshot, requestKey]);
  const rows = activeSnapshot ? matchCustomerSearch(activeSnapshot.rows, query) : [];
  const results = activeSnapshot && remote?.query === query ? remote.rows : rows;
  const pending = !activeSnapshot || (!activeSnapshot.complete && remote?.query !== query);
  return <div className="relative min-w-0 flex-1" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }}>
    <input id={id} name="search" value={text} autoComplete="off" aria-label="搜尋姓名、電話或 LINE 名稱"
      placeholder="輸入姓名、電話或 LINE 名稱" className={className}
      onFocus={() => setFocused(true)} onBlur={(event) => {
        if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(event) => { setComposing(false); onChange(event.currentTarget.value); }}
      onKeyDown={(event) => {
        if (composing || event.nativeEvent.isComposing) {
          if (event.key === "Enter") event.preventDefault();
          return;
        }
        if (event.key === "Escape") { setFocused(false); event.stopPropagation(); }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("button")?.focus();
        }
        if (event.key === "Enter" && focused && results[0]) {
          event.preventDefault(); onSelect(results[0]); setFocused(false);
        }
      }}
      onChange={(event) => { setText(event.target.value); if (!composing && !(event.nativeEvent as InputEvent).isComposing) onChange(event.target.value); }} />
    {focused && query && <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-earth-200 bg-white shadow-lg">
      {results.map((row) => <button key={row.id} type="button" onMouseDown={(e) => e.preventDefault()}
        onClick={() => { onSelect(row); setFocused(false); }} className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-earth-100 px-3 text-left text-sm hover:bg-primary-50"><span>{row.name}</span><span className="text-xs text-earth-500">{row.phone}</span></button>)}
      {error ? <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setRevision((r) => r + 1)} className="p-3 text-xs text-amber-700">載入失敗，點此重試</button>
        : pending ? <p role="status" className="p-3 text-xs text-earth-500">{activeSnapshot ? "正在查詢其餘顧客…" : "載入顧客搜尋資料中…"}</p>
        : results.length === 0 ? <p className="p-3 text-xs text-earth-500">沒有符合的顧客</p> : null}
    </div>}
  </div>;
}
