"use client";
import { VoidSessionButton } from "../[id]/void-session-button";
import { useState } from "react";
import { getCustomerPanelWalletSessions } from "@/server/actions/customer-panel-records";
import { WalletSessionDetail, type SessionRow } from "@/components/wallet-session-detail";
export function CustomerPanelSessions({customerId,walletId,canVoid=false,planName="方案",onMutated}:{customerId:string;walletId:string;canVoid?:boolean;planName?:string;onMutated?:()=>void}) {
  const [rows,setRows]=useState<SessionRow[]|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
  async function load(){if(loading)return;setLoading(true);setError("");try{const result=await getCustomerPanelWalletSessions(customerId,walletId);if(result.success)setRows(result.data);else setError(result.error??"讀取失敗");}catch{setError("讀取失敗，請重試");}finally{setLoading(false);}}
  return <details className="w-full border-t border-earth-100" onToggle={event=>{if(event.currentTarget.open && !rows && !loading)void load();}}><summary className="min-h-11 cursor-pointer py-3 text-sm text-primary-700">堂數明細</summary>{loading?<p role="status" className="py-2 text-sm">讀取中…</p>:error?<p role="alert" className="text-sm text-red-700">{error}<button type="button" onClick={()=>void load()} className="min-h-11 px-3 underline">重試</button></p>:rows&&<WalletSessionDetail sessions={rows} adminVoid={canVoid?{walletId,walletPlanName:planName,renderButton:session=><VoidSessionButton embedded sessionId={session.id} sessionNo={session.sessionNo} walletPlanName={planName} onSuccess={()=>{void load();onMutated?.();}}/>}:undefined}/>}</details>;
}
