"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { usePanelReader } from "@/components/operations/panel-read-cache";
import { getCustomerPanelAdvanced } from "@/server/actions/customer-panel-advanced";
import { LineBindingSection } from "../[id]/line-binding-section";
import { CustomerStageForm } from "../[id]/customer-stage-form";
import { formatTWTime } from "@/lib/date-utils";
import { CUSTOMER_FOLLOW_UP_RESULT_LABEL } from "@/lib/customer-follow-up";
type Data=Extract<Awaited<ReturnType<typeof getCustomerPanelAdvanced>>,{success:true}>["data"];
export function CustomerPanelAdvanced({customerId,readOnly,canEdit,onMutated,embedded=false,active=false,managerSimple=false}:{managerSimple?:boolean;embedded?:boolean;active?:boolean;customerId:string;readOnly:boolean;canEdit:boolean;onMutated:()=>void}) {
  const reader = usePanelReader("customer-support", getCustomerPanelAdvanced);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ customerId: string; data?: Data; error?: string } | null>(null);
  const [requested, setRequested] = useState(false);
  const generation = useRef(0);
  const visible = result?.customerId === customerId ? result : null;
  const data = visible?.data ?? null;
  const error = visible?.error ?? "";
  const loading = (requested || ((embedded || managerSimple) && active)) && !visible;
  const load = useCallback(() => { reader.invalidate(customerId); setResult(null); setRequested(true); setRevision(value => value + 1); }, [reader, customerId]);
  useEffect(() => {
    if (!requested && !((embedded || managerSimple) && active)) return;
    const current = ++generation.current;
    let live = true;
    reader.read(customerId).then(response => {
      if (!live || current !== generation.current) return;
      setResult(response.success ? { customerId, data: response.data } : { customerId, error: response.error ?? "讀取失敗" });
    }).catch(() => { if (live && current === generation.current) setResult({ customerId, error: "讀取失敗，請重試" }); });
    return () => { live = false; };
  }, [reader, customerId, requested, embedded, managerSimple, active, revision]);
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
