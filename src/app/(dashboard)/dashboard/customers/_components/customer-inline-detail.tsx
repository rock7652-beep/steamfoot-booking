"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getCustomerPanelContext } from "@/server/actions/customer-panel-context";
import { SettingsPanelContext, type SettingsPanelState } from "@/components/admin/settings-panel-context";
import { CustomerDetailDrawerContent } from "./customer-detail-drawer-content";
export type CustomerPanelContextData = Extract<Awaited<ReturnType<typeof getCustomerPanelContext>>,{success:true}>["data"];
type Context = CustomerPanelContextData;
export function CustomerInlineDetail({customerId,readOnly,onBack,registerCloseGuard,onUpdated, initialData, backLabel = "← 返回預約"}:{initialData?: Context; backLabel?: string; customerId:string;readOnly:boolean;onBack:()=>void;registerCloseGuard?:(guard:()=>boolean)=>void;onUpdated:()=>void}) {
  const titleId=useId(),gate=useRef(0),states=useRef(new Map<string,SettingsPanelState>());
  const [data,setData]=useState<Context|null>(initialData ?? null),[error,setError]=useState("");
  const report=useCallback((id:string,state:SettingsPanelState|null)=>{if(state)states.current.set(id,state);else states.current.delete(id);},[]);
  const allow=useCallback(()=>{const values=[...states.current.values()];return !values.some(s=>s.pending)&&(!values.some(s=>s.dirty)||window.confirm("尚有未儲存的修改，確定離開？"));},[]);
  const load=useCallback(async()=>{const token=++gate.current;try{const result=await getCustomerPanelContext(customerId);if(token!==gate.current)return;if(result.success){setData(result.data);setError("");}else setError(result.error??"讀取失敗");}catch{if(token===gate.current)setError("讀取失敗");}},[customerId]);
  useEffect(()=>{const request=gate;let mounted=true;void Promise.resolve().then(()=>{if(mounted && !initialData)void load();});return()=>{mounted=false;request.current++;};},[load,initialData]);
  useEffect(()=>{registerCloseGuard?.(allow);return()=>registerCloseGuard?.(()=>true);},[allow,registerCloseGuard]);
  return <SettingsPanelContext.Provider value={{report,navigate:()=>{}}}><div className="flex h-full min-h-0 flex-col"><button type="button" onClick={()=>{if(allow())onBack();}} className="min-h-11 shrink-0 border-b border-earth-100 px-4 text-left text-sm text-primary-700">{backLabel}</button>{error?<p role="alert" className="p-4 text-sm text-red-700">{error}<button type="button" onClick={()=>void load()} className="min-h-11 px-3 underline">重試</button></p>:data?<CustomerDetailDrawerContent {...data} readOnly={readOnly||data.readOnly} onClose={()=>{if(allow())onBack();}} allowNavigation={allow} onMutated={()=>{void load();onUpdated();}} titleId={titleId}/>:<p role="status" className="p-4 text-sm text-earth-500">讀取顧客資料中…</p>}</div></SettingsPanelContext.Provider>;
}
