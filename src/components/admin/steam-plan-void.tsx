"use client";
import {useEffect,useState} from "react";
import {getCustomerPanelWalletSessions} from "@/server/actions/customer-panel-records";
import {VoidSessionButton} from "@/app/(dashboard)/dashboard/customers/[id]/void-session-button";
import type {SessionRow} from "@/components/wallet-session-detail";

/** Uses the existing AVAILABLE-only, locked per-session void transaction. */
export function SteamPlanVoid({customerId,walletId,planName,onSaved,onCancel}:{customerId:string;walletId:string;planName:string;onSaved:()=>void;onCancel:()=>void}){
 const [rows,setRows]=useState<SessionRow[]>(),[error,setError]=useState(''),[selected,setSelected]=useState('');
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;void getCustomerPanelWalletSessions(customerId,walletId).then(result=>{if(!active)return;if(result.success){setRows(result.data.filter(row=>row.status==='AVAILABLE'));setError('');}else setError(result.error??'讀取失敗');}).catch(()=>{if(active)setError('讀取失敗，請重試');});return()=>{active=false;};},[customerId,walletId,retry]);
 const row=rows?.find(value=>value.id===selected);
 return <section aria-label="註銷堂數" className="space-y-2 rounded-lg border border-red-200 p-3 text-sm">
  <h3 className="font-semibold text-red-700">註銷堂數</h3>
  {error?<p role="alert">{error}<button type="button" className="min-h-11 px-3 underline" onClick={()=>setRetry(n=>n+1)}>重試</button></p>:!rows?<p role="status">讀取可註銷堂次中…</p>:!rows.length?<p role="status">目前沒有可註銷的堂次。</p>:!row?<label className="block">選擇堂次<select aria-label="選擇註銷堂次" className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">請選擇</option>{rows.map(value=><option key={value.id} value={value.id}>第 {value.sessionNo} 堂</option>)}</select></label>:<VoidSessionButton key={row.id} embedded initialOpen sessionId={row.id} sessionNo={row.sessionNo} walletPlanName={planName} onSuccess={onSaved} onCancel={onCancel}/>}
  {!row&&<button type="button" className="min-h-11 px-3" onClick={onCancel}>取消</button>}
 </section>;
}
