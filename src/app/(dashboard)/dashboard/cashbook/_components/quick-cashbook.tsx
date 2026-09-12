"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { RightSheet } from "@/components/admin/right-sheet";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { fetchQuickCashbook, saveQuickCashbook, deleteQuickCashbook } from "@/server/actions/quick-cashbook";

type Data = Awaited<ReturnType<typeof fetchQuickCashbook>>;
type Entry = Data["entries"][number];
const button = "min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-sm font-medium text-primary-700 disabled:opacity-50";
const input = "mt-1 w-full rounded-lg border border-earth-200 bg-white p-3 text-base";
const money = (value: number) => `NT$ ${value.toLocaleString("zh-TW")}`;

export function QuickCashbook({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const locked = useRef(false);
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
  return <>
    <button type="button" className={button} onClick={() => { setOpen(true); setEditing(null); setData(null); void refresh(); }}>現金收支</button>
    {open && <RightSheet open onClose={close} width={640} labelledById="quick-cashbook-title">
      <header className="flex items-center justify-between border-b border-earth-200 px-5 py-4">
        <div><h2 id="quick-cashbook-title" className="text-lg font-semibold">現金收支</h2><p className="text-sm text-earth-500">{data?.today ?? "今日"} · 手動收支紀錄</p></div>
        <button type="button" className={button} disabled={busy} onClick={close} aria-label="關閉現金收支">關閉</button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {error && <div role="alert" className="mb-3 text-red-700">{error} <button type="button" onClick={() => void refresh()} className={button}>重試</button></div>}
        {loading && <p role="status" className="mb-3 text-earth-600">讀取中…</p>}
        {data && <>
          {data.canDrawer && <div className="mb-4 rounded-xl border border-earth-200 bg-earth-50 p-4"><p className="text-sm text-earth-600">{data.balanceLabel}</p>{data.balance !== null && <p className="mt-1 text-2xl font-semibold text-primary-700">{money(data.balance)}</p>}</div>}
          {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }} className="space-y-4">
            <h3 className="font-semibold">{entry ? "編輯收支" : "新增收支"}</h3>
            <p className="text-sm text-earth-500">登記日期：{data.today}。補登其他日期請至完整現金管理。</p>
            <fieldset disabled={busy} className="grid grid-cols-2 gap-4">
              <label>類型<select name="type" defaultValue={entry?.type ?? "EXPENSE"} className={input}><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select></label>
              <label>金額<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={entry?.amount ?? ""} className={input} /></label>
              <label className="col-span-2">分類<input name="category" defaultValue={entry?.category ?? ""} placeholder="例如：耗材、清潔用品、其他收入" className={input} /></label>
              <label className="col-span-2">付款方式<select name="paymentMethod" required defaultValue={entry?.paymentMethod ?? ""} className={input}><option value="" disabled>請選擇</option><option value="CASH">現金</option><option value="OTHER">其他（轉帳／非現金）</option></select></label>
              <label className="col-span-2">備註<textarea name="note" rows={3} defaultValue={entry?.note ?? ""} className={input} /></label>
              {data.closedDates.length > 0 && <label className="col-span-2 rounded-lg bg-amber-50 p-3 text-sm"><input type="checkbox" name="confirmClosedCashbookChange" /> 我知道今日已結帳，這只是補紀錄，不會重算關帳快照。</label>}
            </fieldset>
            <div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => { if (window.confirm("放棄尚未儲存的內容？")) setEditing(null); }}>取消</button><button type="submit" disabled={busy} className={`${button} bg-primary-600 text-white`}>{busy ? "儲存中…" : "儲存"}</button></div>
          </form> : <>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">今日收支 · {data.total} 筆</h3>{data.canWrite && <button type="button" disabled={loading || busy} onClick={() => setEditing("new")} className={`${button} bg-primary-600 text-white`}>＋ 記一筆</button>}</div>
            <p className="mb-3 text-sm text-earth-500">預約與方案的現金收款已計入抽屜，請勿重複登記。</p>
            {!data.entries.length && <p className="py-8 text-center text-earth-500">今日尚無手動收支紀錄</p>}
            {data.entries.map(e => <article key={e.id} className="border-b border-earth-100 py-3"><div className="flex justify-between gap-3"><div><p className="font-medium">{e.type === "INCOME" ? "收入" : e.type === "EXPENSE" ? "支出" : e.type === "WITHDRAW" ? "提領" : "調整"} · {e.category || "未分類"}</p><p className="text-sm text-earth-500">{e.paymentMethod === "CASH" ? "現金" : "其他"}</p>{e.note && <p className="whitespace-pre-wrap break-words text-sm">{e.note}</p>}</div><p className="shrink-0 font-semibold">{money(e.amount)}</p></div>{e.canEdit && (e.type === "INCOME" || e.type === "EXPENSE") && <div className="mt-2 flex justify-end gap-2"><button type="button" className={button} disabled={busy || loading} onClick={() => setEditing(e)}>編輯</button><button type="button" className={`${button} text-red-700`} disabled={busy || loading} onClick={() => void remove(e)}>刪除</button></div>}</article>)}
            {data.total > 20 && <div className="mt-4 flex justify-between"><button className={button} disabled={loading || data.page === 1} onClick={() => void refresh(data.page - 1)}>上一頁</button><span>{data.page} / {Math.ceil(data.total / 20)}</span><button className={button} disabled={loading || data.page * 20 >= data.total} onClick={() => void refresh(data.page + 1)}>下一頁</button></div>}
          </>}
        </>}
      </div>
      <footer className="border-t border-earth-200 p-4">{editing || busy ? <span className="text-sm text-earth-500">儲存或取消後可查看完整現金管理</span> : <Link href="/dashboard/cashbook" className="text-primary-700">查看完整現金管理 →</Link>}</footer>
    </RightSheet>}
  </>;
}
