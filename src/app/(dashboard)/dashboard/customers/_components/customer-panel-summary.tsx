"use client";
import {SteamCustomerHealthTracking} from "@/components/steam-customer-health-tracking";
import { useEffect, useRef, useState } from "react";
import type { CustomerPanelSummary } from "@/server/actions/customer-panel-summary";
import { readCustomerPanelSummary } from "@/lib/customer-panel-summary-read";
import { confirmTransactionPayment } from "@/server/actions/transaction";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { formatTWTime } from "@/lib/date-utils";
import { formatPaymentMethod } from "@/lib/data-export-labels";

export function CustomerPanelSummaryView({customerId,readOnly,onMutated,revision,initialData,onHealthEnabled,section = "all"}:{onHealthEnabled?:(enabled:boolean)=>void;section?:"all" | "overview" | "health";initialData?:CustomerPanelSummary;customerId:string;readOnly:boolean;onMutated:()=>void;revision:number}) {
  const [attempt,setAttempt]=useState(0);
  const [result,setResult]=useState<{customerId:string;revision:number;attempt:number;data:CustomerPanelSummary|null;error:string}|null>(null);
  const [paymentError,setPaymentError]=useState("");
  const current=result?.customerId===customerId && result.revision===revision && result.attempt===attempt ? result : null;
  const data=current?.data ?? (revision===0 && attempt===0 ? initialData : null);
  const error=current?.error ?? "";
  const loading=!data && !error;
  const [confirm,setConfirm]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const request=useRef(0);
  useSettingsPanelGuard(false,pending);
  useEffect(()=>{
    const gate=request;
    const token=++gate.current;
    if (initialData && revision===0 && attempt===0) return ()=>{gate.current++;};
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    void Promise.race([
      readCustomerPanelSummary(customerId, controller.signal),
      new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error("讀取逾時"));},15_000);}),
    ]).then(response=>{
      if(token!==request.current)return;
      setResult({customerId,revision,attempt,data:response.success ? response.data : null,error:response.success ? "" : response.error ?? "讀取失敗"});
    }).catch(()=>{
      if(token===request.current)setResult({customerId,revision,attempt,data:null,error:"摘要暫時無法載入"});
    }).finally(()=>clearTimeout(timeout));
    return()=>{gate.current++;clearTimeout(timeout);controller.abort();};
  },[customerId,revision,initialData,attempt]);
  useEffect(()=>{if(data)onHealthEnabled?.(data.healthEnabled);},[data,onHealthEnabled]);
  async function receive(id:string) {
    if(pending)return;
    setPending(true);setPaymentError("");
    try {const result=await confirmTransactionPayment(id);if(!result.success){setPaymentError(result.error ?? "確認失敗");return;}setConfirm(null);onMutated();}
    catch {setPaymentError("連線中斷，請核對入帳狀態後重試");}
    finally {setPending(false);}
  }
  return <div className="space-y-2 text-sm">
    {loading && <p role="status" className="text-earth-500">預約、待收款與健康摘要載入中…</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-red-700"><span>{error}</span><button type="button" onClick={()=>setAttempt(value=>value+1)} className="min-h-11 px-3 font-medium">重新載入摘要</button></div>}
    {paymentError && <p role="alert" className="text-red-700">{paymentError}</p>}
    {section !== "health" && data?.next && <p className="border-b border-earth-100 py-2"><span className="text-earth-500">下次預約 </span>{formatTWTime(data.next.date,{dateOnly:true})} {data.next.time}</p>}
    {section !== "health" && data?.pending.map(t=><div key={t.id} className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span>{t.label} · 待收 NT$ {t.amount.toLocaleString()}</span>{!readOnly && data.canConfirm && <button type="button" disabled={pending} onClick={()=>setConfirm(t.id)} className="min-h-11 px-3 font-medium text-primary-800">確認入帳</button>}</div>
      {confirm===t.id && <div className="border-t border-amber-200 pt-2"><p>確認已收到 NT$ {t.amount.toLocaleString()}（{formatPaymentMethod(t.method)}）？</p><div className="flex gap-2"><button type="button" disabled={pending} onClick={()=>void receive(t.id)} className="min-h-11 rounded bg-primary-700 px-3 text-white">{pending?"處理中…":"確認已收到"}</button><button type="button" disabled={pending} onClick={()=>setConfirm(null)} className="min-h-11 px-3">取消</button></div></div>}
    </div>)}
    {section !== "overview" && data?.healthEnabled && <SteamCustomerHealthTracking customerId={customerId} revision={revision}/>}
  </div>;
}
