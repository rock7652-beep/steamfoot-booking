"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { fetchQuickCashbook, saveQuickCashbook, deleteQuickCashbook } from "@/server/actions/quick-cashbook";

type Data = Awaited<ReturnType<typeof fetchQuickCashbook>>;
type Entry = Data["entries"][number];
const button = "min-h-11 rounded-lg border border-earth-200 bg-white px-4 py-2 text-sm font-medium text-primary-700 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50 disabled:opacity-50";
const input = "mt-1 block h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-0 text-base leading-normal text-earth-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
const textarea = "mt-1 block min-h-28 w-full rounded-lg border border-earth-200 bg-white p-3 text-base leading-normal text-earth-800 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100";
const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;

export function QuickCashbook({ storeId, triggerClassName }: { storeId: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [entryType, setEntryType] = useState<"INCOME" | "EXPENSE">("INCOME");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const locked = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  const closeRef = useRef<() => void>(() => undefined);
  async function refresh(page = 1) {
    const version = ++request.current;
    setLoading(true); setError("");
    try { const result = await fetchQuickCashbook(storeId, page); if (version === request.current) setData(result); }
    catch { if (version === request.current) setError("收支紀錄暫時無法讀取，請重試。"); }
    finally { if (version === request.current) setLoading(false); }
  }
  useEffect(() => () => { request.current++; }, []);
  function close() {
    if (locked.current) return;
    if (editing && !window.confirm("離開編輯？尚未儲存的內容將不保留。")) return;
    request.current++; setOpen(false); setEditing(null);
  }
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);
  async function save(form: FormData) {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const result = await saveQuickCashbook(storeId, editing && editing !== "new" ? editing.id : null, form);
      if (!result.success) { toast.error(result.error ?? "儲存失敗"); return; }
      setEditing(null); toast.success("已儲存收支紀錄"); await refresh();
    } catch { toast.error("儲存失敗，請重試，表單內容已保留"); }
    finally { locked.current = false; setBusy(false); }
  }
  async function remove(entry: Entry) {
    if (locked.current || !window.confirm(`刪除 ${entry.category || "收支"} ${money(entry.amount)}？${data?.closedDates.length ? "這一天已結帳，刪除不會重算關帳快照。" : ""}此操作無法復原。`)) return;
    locked.current = true; setBusy(true);
    try {
      const result = await deleteQuickCashbook(storeId, entry.id);
      if (!result.success) { toast.error(result.error ?? "刪除失敗"); return; }
      toast.success("已刪除收支紀錄"); await refresh();
    } catch { toast.error("刪除失敗，請重試"); }
    finally { locked.current = false; setBusy(false); }
  }
  const entry = editing && editing !== "new" ? editing : null;
  const drawerNeedsAttention = data?.balanceLabel?.includes("尚未關帳") ?? false;
  return <>
    <button type="button" className={`${button} ${triggerClassName ?? ""}`} onClick={() => { setOpen(true); setEditing(null); setData(null); void refresh(); }}>現金收支</button>
    {open && createPortal(<div className="fixed inset-0 z-[100] flex items-end bg-earth-950/35 sm:items-center sm:justify-center sm:p-5">
      <button type="button" aria-label="關閉現金收支" onClick={close} className="absolute inset-0 cursor-default" />
      <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="quick-cashbook-title" className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl outline-none sm:h-auto sm:max-h-[calc(100dvh-2.5rem)] sm:max-w-3xl sm:rounded-2xl">
      <header className="flex items-center justify-between border-b border-earth-200 bg-gradient-to-r from-primary-50 to-gold-50 px-5 py-4">
        <div>
          <div className="mb-1 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gold-500" aria-hidden="true" /><h2 id="quick-cashbook-title" className="text-lg font-semibold text-primary-900">現金收支</h2></div>
          <p className="text-sm text-earth-500">{data?.today ?? "今日"} · 手動收支紀錄</p>
        </div>
        <button type="button" className={button} disabled={busy} onClick={close} aria-label="關閉現金收支">關閉</button>
      </header>
      <div className="flex-1 overflow-y-auto bg-earth-50/40 p-5">
        {error && <div role="alert" className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 text-red-700">{error} <button type="button" onClick={() => void refresh()} className={button}>重試</button></div>}
        {loading && <p role="status" className="mb-3 text-primary-700">讀取中…</p>}
        {data && <>
          {data.canDrawer && <div className={`${drawerNeedsAttention ? "border-amber-300 bg-amber-50/80" : "steamfoot-brand-gold-accent"} mb-4 rounded-xl border p-4 shadow-sm`}><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${drawerNeedsAttention ? "bg-amber-500" : "bg-gold-500"}`} aria-hidden="true" /><p className={`text-sm font-medium ${drawerNeedsAttention ? "text-amber-800" : "text-earth-600"}`}>{data.balanceLabel}</p></div>{data.balance !== null && <p className={`mt-1 text-2xl font-semibold tracking-tight ${drawerNeedsAttention ? "text-amber-900" : "text-primary-800"}`}>{money(data.balance)}</p>}</div>}
          {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }} className="steamfoot-brand-card space-y-4 rounded-xl border p-4">
            <h3 className="font-semibold text-primary-900">{entry ? "編輯收支" : "新增記帳"}</h3>
            <p className="text-sm text-earth-500">登記日期：{data.today}。補登其他日期請至完整現金管理。</p>
            <fieldset disabled={busy} className="grid grid-cols-2 gap-4">
              <label className="text-sm font-medium text-earth-700">類型<select name="type" value={entryType} onChange={(event) => setEntryType(event.target.value as "INCOME" | "EXPENSE")} className={input}><option value="INCOME">收入</option><option value="EXPENSE">支出</option></select></label>
              <label className="text-sm font-medium text-earth-700">金額<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={entry?.amount ?? ""} className={input} /></label>
              {entryType === "INCOME" && <CashbookCustomerPicker key={entry?.id ?? "new"} storeId={storeId} defaultCustomer={entry?.customer ?? null} />}
              <label className="col-span-2 text-sm font-medium text-earth-700">{entryType === "INCOME" ? "消費項目" : "分類"}<input name="category" list={entryType === "INCOME" ? "quick-income-categories" : undefined} defaultValue={entry?.category ?? ""} placeholder={entryType === "INCOME" ? "例如：零售-精油、單次服務" : "例如：耗材、清潔用品"} className={input} />{entryType === "INCOME" && <><datalist id="quick-income-categories"><option value="單次服務"/><option value="零售-其他商品"/><option value="其他收入"/></datalist><span className="mt-1 block text-xs font-normal text-earth-500">以「零售-」開頭的項目會自動納入零售分析。</span></>}</label>
              <label className="col-span-2 text-sm font-medium text-earth-700">付款方式<select name="paymentMethod" required defaultValue={entry?.paymentMethod ?? ""} className={input}><option value="" disabled>請選擇</option><option value="CASH">現金</option><option value="OTHER">其他（轉帳／非現金）</option></select></label>
              <label className="col-span-2 text-sm font-medium text-earth-700">備註<textarea name="note" rows={3} defaultValue={entry?.note ?? ""} className={textarea} /></label>
              {data.closedDates.length > 0 && <label className="col-span-2 rounded-lg border border-gold-200 bg-gold-50 p-3 text-sm text-gold-800"><input type="checkbox" name="confirmClosedCashbookChange" /> 我知道今日已結帳，這只是補紀錄，不會重算關帳快照。</label>}
            </fieldset>
            <div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => { if (window.confirm("放棄尚未儲存的內容？")) setEditing(null); }}>取消</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-800 disabled:opacity-50">{busy ? "儲存中…" : "儲存"}</button></div>
          </form> : <>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-earth-800">今日收支 · {data.total} 筆</h3>{data.canWrite && <button type="button" disabled={loading || busy} onClick={() => { setEntryType("INCOME"); setEditing("new"); }} className="min-h-11 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-800 disabled:opacity-50">＋ 記一筆</button>}</div>
            <p className="mb-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">預約與方案的現金收款已計入抽屜，請勿重複登記。</p>
            {!data.entries.length && <p className="steamfoot-brand-card rounded-xl border py-8 text-center text-earth-500">今日尚無手動收支紀錄</p>}
            <div className="space-y-2">{data.entries.map(e => <article key={e.id} className="steamfoot-brand-card rounded-xl border p-3"><div className="flex justify-between gap-3"><div><p className="font-medium text-earth-800">{e.type === "INCOME" ? "收入" : e.type === "EXPENSE" ? "支出" : e.type === "WITHDRAW" ? "提領" : "調整"} · {e.category || "未分類"}</p><p className="text-sm text-earth-500">{e.paymentMethod === "CASH" ? "現金" : "其他"}{e.customer ? ` · ${e.customer.name}` : ""}</p>{e.note && <p className="whitespace-pre-wrap break-words text-sm text-earth-700">{e.note}</p>}</div><p className={`shrink-0 font-semibold ${e.type === "INCOME" ? "text-primary-700" : "text-earth-800"}`}>{money(e.amount)}</p></div>{e.canEdit && (e.type === "INCOME" || e.type === "EXPENSE") && <div className="mt-2 flex justify-end gap-2"><button type="button" className={button} disabled={busy || loading} onClick={() => { setEntryType(e.type === "INCOME" ? "INCOME" : "EXPENSE"); setEditing(e); }}>編輯</button><button type="button" className={`${button} text-red-700 hover:border-red-200 hover:bg-red-50`} disabled={busy || loading} onClick={() => void remove(e)}>刪除</button></div>}</article>)}</div>
            {data.total > 20 && <div className="mt-4 flex items-center justify-between"><button className={button} disabled={loading || data.page === 1} onClick={() => void refresh(data.page - 1)}>上一頁</button><span className="text-sm text-earth-500">{data.page} / {Math.ceil(data.total / 20)}</span><button className={button} disabled={loading || data.page * 20 >= data.total} onClick={() => void refresh(data.page + 1)}>下一頁</button></div>}
          </>}
        </>}
      </div>
      <footer className="border-t border-earth-200 bg-white p-4">{editing || busy ? <span className="text-sm text-earth-500">儲存或取消後可查看完整現金管理</span> : <Link href="/dashboard/cashbook" className="font-medium text-primary-700 hover:text-primary-800">查看完整現金管理 →</Link>}</footer>
      </section>
    </div>, document.body)}
  </>;
}

type CustomerOption = { id: string; name: string; phone: string };

function CashbookCustomerPicker({ defaultCustomer }: { storeId: string; defaultCustomer: { id: string; name: string } | null }) {
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
