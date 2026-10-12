"use client";
import { useState, useCallback, useEffect } from "react";
import { getCustomerPanelAdvanced } from "@/server/actions/customer-panel-advanced";
import { LineBindingSection } from "../[id]/line-binding-section";
import { CustomerStageForm } from "../[id]/customer-stage-form";
import { formatTWTime } from "@/lib/date-utils";
import { CUSTOMER_FOLLOW_UP_RESULT_LABEL } from "@/lib/customer-follow-up";
type Data=Extract<Awaited<ReturnType<typeof getCustomerPanelAdvanced>>,{success:true}>["data"];
export function CustomerPanelAdvanced({customerId,readOnly,canEdit,onMutated,embedded=false,active=false,managerSimple=false}:{managerSimple?:boolean;embedded?:boolean;active?:boolean;customerId:string;readOnly:boolean;canEdit:boolean;onMutated:()=>void}) {
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  const load=useCallback(async()=>{if(loading)return;setLoading(true);setError("");try{const result=await getCustomerPanelAdvanced(customerId);if(result.success)setData(result.data);else setError(result.error??"讀取失敗");}catch{setError("讀取失敗，請重試");}finally{setLoading(false);}},[customerId,loading]);
  useEffect(()=>{if((embedded||managerSimple)&&active&&!data&&!loading&&!error)void load();},[embedded,managerSimple,active,data,loading,error,load]);
  const c=data?.customer;
  if(managerSimple) return <section aria-label="LINE 綁定" className="border-t border-earth-100 py-2 text-sm">{loading && <p role="status">讀取LINE狀態中…</p>}{error && <p role="alert">{error}<button type="button" onClick={()=>void load()} className="min-h-11 px-3">重試</button></p>}{c && (readOnly || !canEdit ? <p>LINE：{c.lineLinkStatus === "LINKED" ? "已綁定" : "未綁定"}</p> : <LineBindingSection compact customerId={customerId} lineLinkStatus={c.lineLinkStatus} lineUserId={c.lineUserId} lineLinkedAt={c.lineLinkedAt?.toISOString()??null} lineBindingCode={c.lineBindingCode?.startsWith("trial:")?null:c.lineBindingCode} lineBindingCodeCreatedAt={c.lineBindingCodeCreatedAt?.toISOString()??null} canManageLineRebind={data.canManageLineRebind} canRunLineRebindDryRun={data.canRunLineRebindDryRun} activeLineRebindRequest={data.activeLineRebindRequest} onUpdated={()=>{void load();onMutated();}}/>)}</section>;
  const body = <div className="space-y-3 border-t border-earth-100 p-3 text-sm">
      {loading&&<p role="status">讀取中…</p>}{error&&<p role="alert">{error}<button type="button" onClick={()=>void load()} className="min-h-11 px-3 underline">重試</button></p>}
      {c&&<><section><h4 className="font-semibold">追蹤紀錄</h4>{c.followUps.length?c.followUps.map(row=><div key={row.id} className="border-b border-earth-100 py-2"><p>{CUSTOMER_FOLLOW_UP_RESULT_LABEL[row.result]}</p><p className="text-earth-500">{row.createdBy.name} · {formatTWTime(row.createdAt,{style:"short"})}</p>{row.note&&<p className="whitespace-pre-wrap">{row.note}</p>}</div>):<p className="py-2 text-earth-500">尚無追蹤紀錄</p>}</section>
      {!readOnly&&canEdit&&<CustomerStageForm customerId={customerId} currentStage={c.customerStage} onSuccess={()=>{void load();onMutated();}}/>}
      {!readOnly&&canEdit&&<LineBindingSection customerId={customerId} lineLinkStatus={c.lineLinkStatus} lineUserId={c.lineUserId} lineLinkedAt={c.lineLinkedAt?.toISOString()??null} lineBindingCode={c.lineBindingCode?.startsWith("trial:")?null:c.lineBindingCode} lineBindingCodeCreatedAt={c.lineBindingCodeCreatedAt?.toISOString()??null} canManageLineRebind={data.canManageLineRebind} canRunLineRebindDryRun={data.canRunLineRebindDryRun} activeLineRebindRequest={data.activeLineRebindRequest} onUpdated={()=>{void load();onMutated();}}/>}</>}
    </div>;
  if (embedded) return <section>{body}</section>;
  return <details onToggle={event=>{if(event.currentTarget.open&&!data&&!loading)void load();}} className="rounded-lg border border-earth-100">
    <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-primary-900">{embedded ? "追蹤紀錄與綁定操作" : "LINE 與追蹤"}</summary>
    {body}
  </details>;
}
