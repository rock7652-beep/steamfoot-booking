"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCustomerPanelRecords, type CustomerPanelRecords } from "@/server/actions/customer-panel-records";
import { formatTWTime } from "@/lib/date-utils";
import { STATUS_LABEL } from "@/lib/booking-constants";

export function CustomerPanelRecordsList({customerId, kind, revision, active = true}: {customerId:string; kind:"bookings" | "consumption"; revision:string; active?:boolean}) {
  const [scope,setScope] = useState<"past" | "all">("past");
  const recordScope = `${customerId}:${kind}:${scope}`;
  const [snapshot,setSnapshot] = useState<{key:string; value:CustomerPanelRecords} | null>(null);
  const data = snapshot?.key === recordScope ? snapshot.value : null;
  const [requestedPage, setRequestedPage] = useState(1);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const request = useRef(0);
  const loadedRevision = useRef<string | null>(null);
  const load = useCallback(async (page:number) => {
    const token = ++request.current;
    setRequestedPage(page); setLoading(true); setError("");
    try {
      const result = await getCustomerPanelRecords(customerId,kind,page,kind === "bookings" ? scope : "all");
      if(token !== request.current) return;
      if(!result.success) {setError(result.error ?? "讀取失敗");return;}
      setSnapshot({key:`${customerId}:${kind}:${scope}`,value:result.data});
    } catch {if(token===request.current)setError("讀取失敗，請重試");}
    finally {if(token===request.current)setLoading(false);}
  }, [customerId,kind,scope]);
  useEffect(() => {
    if (!active || loadedRevision.current === `${customerId}:${kind}:${revision}:${scope}`) return;
    loadedRevision.current = `${customerId}:${kind}:${revision}:${scope}`;
    void load(1);

  },[load,revision,active,scope,customerId,kind]);
  useEffect(() => {const gate=request;return()=>{gate.current++;};},[]);
  return <div hidden={!active} role="tabpanel" aria-label={kind === "bookings" ? "預約紀錄" : "消費紀錄"}>
    {kind === "bookings" && <div className="flex gap-2"><button type="button" aria-pressed={scope === "past"} onClick={()=>setScope("past")} className="min-h-11 px-3 text-sm text-primary-700">過往</button><button type="button" aria-pressed={scope === "all"} onClick={()=>setScope("all")} className="min-h-11 px-3 text-sm text-primary-700">全部</button></div>}
    <div className="overflow-x-auto rounded-lg border border-earth-200" aria-busy={loading}>
      <div className="min-w-[440px]">
        <div className="grid grid-cols-[9rem_minmax(0,1fr)_7rem] gap-3 bg-earth-50 px-3 py-2 text-sm font-medium text-earth-600"><span>日期</span><span>{kind === "bookings" ? "時間／服務／人數" : "消費項目"}</span><span className="text-right">{kind === "bookings" ? "狀態" : "金額"}</span></div>
        {data?.rows.map(row => <details key={row.id} className="border-t border-earth-100">
          <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[9rem_minmax(0,1fr)_7rem] items-center gap-3 px-3 py-2 text-sm hover:bg-earth-50">
            <span className="tabular-nums text-earth-600">{formatTWTime(row.date,{dateOnly:true})}</span>
            <span className="min-w-0 break-words font-medium text-earth-900">{row.label}</span>
            <span className={`text-right ${row.status === "CANCELLED" ? "text-earth-500" : row.status === "NO_SHOW" ? "text-amber-800" : "text-primary-800"}`}>{row.amount !== undefined ? `NT$ ${row.amount.toLocaleString()}` : STATUS_LABEL[row.status] ?? row.status}<span aria-hidden="true"> ▾</span></span>
          </summary>
          <div className="space-y-1 bg-earth-50 px-3 py-2 text-sm text-earth-600"><p>{STATUS_LABEL[row.status] ?? row.status}{row.payment ? ` · ${row.payment}` : ""}</p>{row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}</div>
        </details>)}
      </div>
    </div>
    {!loading && data?.rows.length === 0 && <p className="py-3 text-sm text-earth-500">尚無紀錄</p>}
    {error && <p role="alert" className="py-2 text-sm text-red-700">{error} <button type="button" onClick={() => void load(requestedPage)} className="min-h-11 px-3 underline">重試</button></p>}
    {loading && <p role="status" className="py-2 text-sm text-earth-500">讀取中…</p>}
    {data && <div className="flex items-center justify-end gap-2 pt-2 text-sm"><button type="button" disabled={loading || data.page <= 1} onClick={() => void load(data.page - 1)} className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40">上一頁</button><span className="tabular-nums">第 {data.page} 頁</span><button type="button" disabled={loading || !data.hasMore} onClick={() => void load(data.page + 1)} className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40">下一頁</button></div>}
  </div>;
}
