"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCustomerPanelRecords, type CustomerPanelRecords } from "@/server/actions/customer-panel-records";
import { formatTWTime } from "@/lib/date-utils";
import { STATUS_LABEL } from "@/lib/booking-constants";

export function CustomerPanelRecordsList({customerId, kind, revision, active = true}: {customerId:string; kind:"bookings" | "consumption"; revision:string; active?:boolean}) {
  const [scope,setScope] = useState<"past" | "all">("past");
  const [data,setData] = useState<CustomerPanelRecords | null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const request = useRef(0);
  const loadedRevision = useRef<string | null>(null);
  const load = useCallback(async (page:number, append=false) => {
    const token = ++request.current;
    setLoading(true); setError("");
    try {
      const result = await getCustomerPanelRecords(customerId,kind,page,kind === "bookings" ? scope : "all");
      if(token !== request.current) return;
      if(!result.success) {setError(result.error ?? "讀取失敗");return;}
      setData(previous => ({...result.data, rows:append && previous ? [...previous.rows,...result.data.rows] : result.data.rows}));
    } catch {if(token===request.current)setError("讀取失敗，請重試");}
    finally {if(token===request.current)setLoading(false);}
  }, [customerId,kind,scope]);
  useEffect(() => {
    if (!active || loadedRevision.current === `${revision}:${scope}`) return;
    loadedRevision.current = `${revision}:${scope}`;
    void load(1);

  },[load,revision,active,scope]);
  useEffect(() => {const gate=request;return()=>{gate.current++;};},[]);
  return <div hidden={!active} role="tabpanel" aria-label={kind === "bookings" ? "預約紀錄" : "消費紀錄"}>
    {kind === "bookings" && <div className="flex gap-2"><button type="button" aria-pressed={scope === "past"} onClick={()=>setScope("past")} className="min-h-11 px-3 text-sm text-primary-700">過往</button><button type="button" aria-pressed={scope === "all"} onClick={()=>setScope("all")} className="min-h-11 px-3 text-sm text-primary-700">全部</button></div>}
    {data?.rows.map(row => <details key={row.id} className="border-b border-earth-100">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span className="min-w-0"><span className="block break-words font-medium">{row.label}</span><span className="text-earth-500">{formatTWTime(row.date,{dateOnly:true})}</span></span>
        <span className="shrink-0">{row.amount !== undefined ? `NT$ ${row.amount.toLocaleString()}` : STATUS_LABEL[row.status] ?? row.status}<span aria-hidden="true"> ▾</span></span>
      </summary>
      <div className="space-y-1 pb-3 text-sm text-earth-600"><p>{STATUS_LABEL[row.status] ?? row.status}{row.payment ? ` · ${row.payment}` : ""}</p>{row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}</div>
    </details>)}
    {!loading && data?.rows.length === 0 && <p className="py-3 text-sm text-earth-500">尚無紀錄</p>}
    {error && <p role="alert" className="py-2 text-sm text-red-700">{error} <button type="button" onClick={() => void load(data ? data.page+1 : 1,!!data)} className="min-h-11 px-3 underline">重試</button></p>}
    {loading ? <p role="status" className="py-3 text-sm text-earth-500">讀取中…</p> : data?.hasMore && <button type="button" onClick={() => void load(data.page+1,true)} className="min-h-11 px-3 text-sm text-primary-700">載入更多</button>}
  </div>;
}
