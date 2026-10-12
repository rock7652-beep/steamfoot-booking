"use client";
import { useEffect, useRef, useState } from "react";
import { getCustomerPanelSummary, type CustomerPanelSummary } from "@/server/actions/customer-panel-summary";
import { confirmTransactionPayment } from "@/server/actions/transaction";
import { useSettingsPanelGuard } from "@/components/admin/settings-panel-context";
import { formatTWTime } from "@/lib/date-utils";
import { formatPaymentMethod } from "@/lib/data-export-labels";

export function CustomerPanelSummaryView({customerId,readOnly,onMutated,revision,initialData}:{initialData?:CustomerPanelSummary;customerId:string;readOnly:boolean;onMutated:()=>void;revision:number}) {
  const [data,setData]=useState<CustomerPanelSummary|null>(initialData ?? null);
  const [error,setError]=useState("");
  const [confirm,setConfirm]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const request=useRef(0);
  useSettingsPanelGuard(false,pending);
  useEffect(()=>{
    const gate=request;
    const token=++gate.current;
    if (initialData) { void Promise.resolve().then(()=>{if(token===request.current)setData(initialData);}); return ()=>{gate.current++;}; }
    void getCustomerPanelSummary(customerId).then(result=>{if(token!==request.current)return;if(result.success)setData(result.data);else setError(result.error ?? "讀取失敗");}).catch(()=>{if(token===request.current)setError("讀取失敗");});
    return()=>{gate.current++;};
  },[customerId,revision,initialData]);
  async function receive(id:string) {
    if(pending)return;
    setPending(true);setError("");
    try {const result=await confirmTransactionPayment(id);if(!result.success){setError(result.error ?? "確認失敗");return;}setConfirm(null);onMutated();}
    catch {setError("連線中斷，請核對入帳狀態後重試");}
    finally {setPending(false);}
  }
  return <div className="space-y-2 text-sm">
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data?.next && <p className="border-b border-earth-100 py-2"><span className="text-earth-500">下次預約 </span>{formatTWTime(data.next.date,{dateOnly:true})} {data.next.time}</p>}
    {data?.pending.map(t=><div key={t.id} className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><span>{t.label} · 待收 NT$ {t.amount.toLocaleString()}</span>{!readOnly && data.canConfirm && <button type="button" disabled={pending} onClick={()=>setConfirm(t.id)} className="min-h-11 px-3 font-medium text-primary-800">確認入帳</button>}</div>
      {confirm===t.id && <div className="border-t border-amber-200 pt-2"><p>確認已收到 NT$ {t.amount.toLocaleString()}（{formatPaymentMethod(t.method)}）？</p><div className="flex gap-2"><button type="button" disabled={pending} onClick={()=>void receive(t.id)} className="min-h-11 rounded bg-primary-700 px-3 text-white">{pending?"處理中…":"確認已收到"}</button><button type="button" disabled={pending} onClick={()=>setConfirm(null)} className="min-h-11 px-3">取消</button></div></div>}
    </div>)}
    {data?.healthEnabled && <details className="border-b border-earth-100 py-2"><summary className="min-h-11 cursor-pointer font-medium text-primary-900">健康資料</summary>{data.health ? <div><p className="text-earth-500">{data.health.measuredAt}</p><dl className="grid grid-cols-2 gap-2 py-2">{[["體重",data.health.weight,"kg"],["BMI",data.health.bmi,""],["體脂",data.health.bodyFat,"%"],["肌肉量",data.health.muscleMass,"kg"]].map(([label,value,unit])=><div key={String(label)}><dt className="text-earth-500">{label}</dt><dd>{value == null ? "—" : `${value}${unit}`}</dd></div>)}</dl>{data.health.note && <p className="whitespace-pre-wrap">{data.health.note}</p>}</div>:<p className="py-2 text-earth-500">尚無量測</p>}</details>}
  </div>;
}
