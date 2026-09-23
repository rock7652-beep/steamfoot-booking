"use client";

import { useEffect, useRef, useState } from "react";
import { CustomerInstantSearch } from "@/components/customer-instant-search";

type EntryType = "INCOME" | "EXPENSE";
type Customer = { id: string; name: string };

const input = "mt-1 block h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-0 text-base leading-normal text-earth-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
const textarea = "mt-1 block min-h-28 w-full rounded-lg border border-earth-200 bg-white p-3 text-base leading-normal text-earth-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";

/** Shared entry fields for the quick cashbook and the cash drawer action modal. */
export function CashbookEntryFields({
  storeId,
  today,
  editableDate = false,
  closedDates,
  defaultEntry,
  instantSearch = true,
  disabled = false,
}: {
  storeId: string;
  today: string;
  editableDate?: boolean;
  closedDates: string[];
  defaultEntry?: {
    type: EntryType;
    amount: number;
    category: string;
    paymentMethod: "CASH" | "OTHER";
    note: string;
    customer: Customer | null;
  } | null;
  instantSearch?: boolean;
  disabled?: boolean;
}) {
  const [entryType, setEntryType] = useState<EntryType>(defaultEntry?.type ?? "INCOME");
  const [entryDate, setEntryDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState(defaultEntry?.paymentMethod ?? "");
  const isClosed = closedDates.includes(entryDate);
  const needsConfirmation = isClosed && (paymentMethod === "CASH" || defaultEntry?.paymentMethod === "CASH");

  return <fieldset disabled={disabled} className="grid grid-cols-2 gap-4">
    {editableDate && <label className="col-span-2 text-sm font-medium text-earth-700">
      日期
      <input type="date" name="entryDate" required value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className={input} />
    </label>}
    <label className="text-sm font-medium text-earth-700">
      類型
      <select name="type" value={entryType} onChange={(event) => setEntryType(event.target.value as EntryType)} className={input}>
        <option value="INCOME">收入</option><option value="EXPENSE">支出</option>
      </select>
    </label>
    <label className="text-sm font-medium text-earth-700">
      金額
      <input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={defaultEntry?.amount ?? ""} className={input} />
    </label>
    {entryType === "INCOME" && (instantSearch
      ? <CashbookCustomerPicker key={defaultEntry?.customer?.id ?? "new"} storeId={storeId} defaultCustomer={defaultEntry?.customer ?? null} />
      : <LegacyCashbookCustomerPicker key={defaultEntry?.customer?.id ?? "new"} storeId={storeId} defaultCustomer={defaultEntry?.customer ?? null} />)}
    <label className="col-span-2 text-sm font-medium text-earth-700">
      {entryType === "INCOME" ? "消費項目" : "分類"}
      <input name="category" list={entryType === "INCOME" ? "cashbook-income-categories" : undefined}
        defaultValue={defaultEntry?.category ?? ""}
        placeholder={entryType === "INCOME" ? "例如：零售-精油、單次服務" : "例如：耗材、清潔用品"}
        className={input} />
      {entryType === "INCOME" && <>
        <datalist id="cashbook-income-categories"><option value="單次服務" /><option value="零售-其他商品" /><option value="其他收入" /></datalist>
        <span className="mt-1 block text-xs font-normal text-earth-500">以「零售-」開頭的項目會自動納入零售分析。</span>
      </>}
    </label>
    <label className="col-span-2 text-sm font-medium text-earth-700">
      付款方式
      <select name="paymentMethod" required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={input}>
        <option value="" disabled>請選擇</option><option value="CASH">現金</option><option value="OTHER">其他（轉帳／非現金）</option>
      </select>
    </label>
    <label className="col-span-2 text-sm font-medium text-earth-700">
      備註
      <textarea name="note" rows={3} defaultValue={defaultEntry?.note ?? ""} className={textarea} />
    </label>
    {isClosed && <label className="col-span-2 rounded-lg border border-gold-200 bg-gold-50 p-3 text-sm text-gold-800">
      <input type="checkbox" name="confirmClosedCashbookChange" required={needsConfirmation} /> 我知道這一天已結帳，這只是補紀錄，不會重算關帳快照。
    </label>}
  </fieldset>;
}

function CashbookCustomerPicker({ storeId, defaultCustomer }: { storeId: string; defaultCustomer: { id: string; name: string } | null }) {
  const [query, setQuery] = useState(defaultCustomer?.name ?? "");
  const [selected, setSelected] = useState(defaultCustomer);
  return <div className="col-span-2 text-sm font-medium text-earth-700">
    <label htmlFor="quick-cashbook-customer">關聯顧客 <span className="font-normal text-earth-400">（選填）</span></label>
    <input type="hidden" name="customerId" value={selected?.id ?? ""} />
    <CustomerInstantSearch key={storeId} storeId={storeId} id="quick-cashbook-customer" value={query} className={input}
      onChange={(value) => { setQuery(value); setSelected(null); }}
      onSelect={(customer) => { setSelected(customer); setQuery(customer.name); }} />
    {selected && <p className="mt-1 text-xs font-normal text-primary-700">已關聯 {selected.name}，儲存後會顯示在消費紀錄。</p>}
  </div>;
}

type CustomerOption = { id: string; name: string; phone: string };

function LegacyCashbookCustomerPicker({ defaultCustomer }: { storeId: string; defaultCustomer: { id: string; name: string } | null }) {
  const [query, setQuery] = useState(defaultCustomer?.name ?? "");
  const [selected, setSelected] = useState(defaultCustomer);
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchCache = useRef(new Map<string, CustomerOption[]>());
  useEffect(() => {
    if (selected || !query.trim()) return;
    const normalized = query.trim().toLowerCase();
    const cached = searchCache.current.get(normalized);
    if (cached) {
      setResults(cached);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/customers/search?q=${encodeURIComponent(query.trim())}&limit=8`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const rows = (await response.json()) as CustomerOption[];
        searchCache.current.set(normalized, rows);
        setResults(rows);
        setSearchError("");
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchError("暫時無法搜尋顧客，請稍後重試。");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected]);
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
