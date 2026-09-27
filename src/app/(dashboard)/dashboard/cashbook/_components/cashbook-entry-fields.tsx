"use client";

import { useEffect, useRef, useState } from "react";
import { CustomerInstantSearch } from "@/components/customer-instant-search";
import { cashbookCategoryForKind, isRetailCashbookCategory, type CashbookEntryKind } from "@/lib/cashbook-entry-kind";

type EntryType = "INCOME" | "EXPENSE";
type Customer = { id: string; name: string };

const input = "mt-1 block h-[52px] w-full rounded-lg border border-earth-200 bg-white px-3 py-0 text-base leading-normal text-earth-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
const textarea = "mt-1 block min-h-28 w-full rounded-lg border border-earth-200 bg-white p-3 text-base leading-normal text-earth-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";

function initialKind(entry: { type: EntryType; category: string } | null | undefined): CashbookEntryKind | null {
  if (!entry) return null;
  if (entry.type === "EXPENSE") return "EXPENSE";
  return isRetailCashbookCategory(entry.category) ? "RETAIL" : "OTHER";
}

function initialItem(entry: { type: EntryType; category: string } | null | undefined) {
  if (!entry) return "";
  if (entry.type === "INCOME" && isRetailCashbookCategory(entry.category)) {
    return entry.category.slice("零售-".length);
  }
  return entry.category === "其他收入" ? "" : entry.category;
}

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
  const [kind, setKind] = useState<CashbookEntryKind | null>(initialKind(defaultEntry));
  const [item, setItem] = useState(initialItem(defaultEntry));
  const entryType: EntryType = kind === "EXPENSE" ? "EXPENSE" : "INCOME";
  const category = cashbookCategoryForKind(kind, item);
  const [entryDate, setEntryDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState(defaultEntry?.paymentMethod ?? "");
  const isClosed = closedDates.includes(entryDate);
  const needsConfirmation = isClosed && (paymentMethod === "CASH" || defaultEntry?.paymentMethod === "CASH");

  return <fieldset disabled={disabled} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2 text-sm font-medium text-earth-700">
      <span className="mb-2 block">這筆是什麼收支？</span>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="收支分類">
        {([ ["RETAIL", "零售收入"], ["OTHER", "其他收入"], ["EXPENSE", "支出"] ] as const).map(([value, label]) => (
          <label key={value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-sm font-medium focus-within:ring-2 focus-within:ring-primary-300 ${kind === value ? "border-primary-600 bg-primary-50 text-primary-800" : "border-earth-200 bg-white text-earth-700"}`}>
            <input type="radio" name="entryKind" value={value} required checked={kind === value}
              onChange={() => { setKind(value); setItem(""); }} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      <input type="hidden" name="type" value={entryType} />
      <input type="hidden" name="category" value={category} />
    </div>
    <label className="min-w-0 text-sm font-medium text-earth-700">日期
      {editableDate ? <input type="date" name="entryDate" required value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className={input} />
        : <span className={`${input} flex items-center`}>{entryDate}</span>}
    </label>
    <label className="min-w-0 text-sm font-medium text-earth-700">金額
      <input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={defaultEntry?.amount ?? ""} className={input} />
    </label>
    {kind !== null && entryType === "INCOME" && (instantSearch
      ? <CashbookCustomerPicker key={defaultEntry?.customer?.id ?? "new"} storeId={storeId} defaultCustomer={defaultEntry?.customer ?? null} />
      : <LegacyCashbookCustomerPicker key={defaultEntry?.customer?.id ?? "new"} storeId={storeId} defaultCustomer={defaultEntry?.customer ?? null} />)}
    <label className="min-w-0 text-sm font-medium text-earth-700">
      {kind === "RETAIL" ? "商品名稱" : kind === "OTHER" ? "收入項目" : "支出項目"} <span className="font-normal text-earth-400">（選填）</span>
      <input value={item} onChange={(event) => setItem(event.target.value)}
        placeholder={kind === "RETAIL" ? "例如：精油" : kind === "OTHER" ? "例如：單次服務" : "例如：耗材"}
        className={input} />
    </label>
    <label className="min-w-0 text-sm font-medium text-earth-700">
      付款方式
      <select name="paymentMethod" required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={input}>
        <option value="" disabled>請選擇</option><option value="CASH">現金</option><option value="OTHER">其他（轉帳／非現金）</option>
      </select>
    </label>
    <label className="sm:col-span-2 text-sm font-medium text-earth-700">
      備註
      <textarea name="note" rows={3} defaultValue={defaultEntry?.note ?? ""} className={textarea} />
    </label>
    {isClosed && <label className="sm:col-span-2 rounded-lg border border-gold-200 bg-gold-50 p-3 text-sm text-gold-800">
      <input type="checkbox" name="confirmClosedCashbookChange" required={needsConfirmation} /> 我知道這一天已結帳，這只是補紀錄，不會重算關帳快照。
    </label>}
  </fieldset>;
}

function CashbookCustomerPicker({ storeId, defaultCustomer }: { storeId: string; defaultCustomer: { id: string; name: string } | null }) {
  const [query, setQuery] = useState(defaultCustomer?.name ?? "");
  const [selected, setSelected] = useState(defaultCustomer);
  return <div className="sm:col-span-2 text-sm font-medium text-earth-700">
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
  return <div className="sm:col-span-2 text-sm font-medium text-earth-700">
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
