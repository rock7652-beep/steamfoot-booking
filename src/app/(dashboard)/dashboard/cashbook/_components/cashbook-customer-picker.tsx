"use client";
import { useEffect, useState } from "react";
import { searchQuickCashbookCustomers } from "@/server/actions/quick-cashbook";
const input = "mt-1 block h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-base text-earth-800";
type CustomerOption = { id: string; name: string; phone: string };

export function CashbookCustomerPicker({ storeId, defaultCustomer }: { storeId: string; defaultCustomer: { id: string; name: string } | null }) {
  const [query, setQuery] = useState(defaultCustomer?.name ?? "");
  const [selected, setSelected] = useState(defaultCustomer);
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    if (selected || !query.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("SEARCH_TIMEOUT")), 4000));
      void Promise.race([searchQuickCashbookCustomers(storeId, query), timeout])
        .then((rows) => { if (!cancelled) setResults(rows); })
        .catch((error) => { if (!cancelled) { setResults([]); setSearchError(error instanceof Error && error.message === "SEARCH_TIMEOUT" ? "搜尋時間較久，請再輸入一個字或使用手機前幾碼。" : "暫時無法搜尋顧客，請稍後重試。"); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 100);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, selected, storeId]);
  return <div className="col-span-2 text-sm font-medium text-earth-700">
    <label htmlFor="quick-cashbook-customer">關聯顧客 <span className="font-normal text-earth-400">（選填）</span></label>
    <input type="hidden" name="customerId" value={selected?.id ?? ""}/>
    <input id="quick-cashbook-customer" value={query} onChange={(event) => { const value=event.target.value; setQuery(value); setSelected(null); setResults([]); setSearchError(""); setSearching(Boolean(value.trim())); }} placeholder="輸入姓名、手機前幾碼或 LINE 名稱" autoComplete="off" className={input}/>
    {searching && <p role="status" className="mt-1 text-xs font-normal text-primary-700">搜尋顧客中…</p>}
    {results.length > 0 && <div className="mt-1 overflow-hidden rounded-lg border border-earth-200 bg-white shadow-lg">{results.map((customer) => <button key={customer.id} type="button" onClick={() => { setSelected(customer); setQuery(customer.name); setResults([]); setSearching(false); setSearchError(""); }} className="flex min-h-11 w-full items-center justify-between border-b border-earth-100 px-3 text-left last:border-0 hover:bg-primary-50"><span>{customer.name}</span><span className="text-xs font-normal text-earth-500">{customer.phone}</span></button>)}</div>}
    {searchError && <p role="alert" className="mt-1 text-xs font-normal text-amber-700">{searchError}</p>}
    {!searching && !searchError && query.trim() && !selected && results.length === 0 && <p className="mt-1 text-xs font-normal text-earth-500">沒有符合的顧客，請再輸入完整姓名或手機號碼。</p>}
    {selected && <p className="mt-1 text-xs font-normal text-primary-700">已關聯 {selected.name}，儲存後會顯示在消費紀錄。</p>}
  </div>;
}
