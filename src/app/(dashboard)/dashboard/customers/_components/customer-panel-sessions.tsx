"use client";
import {VoidSessionButton} from "../[id]/void-session-button";
import {useCallback,useEffect,useState} from "react";
import {getCustomerPanelWalletSessions} from "@/server/actions/customer-panel-records";
import {WalletSessionDetail,type SessionRow} from "@/components/wallet-session-detail";
import type {PlanUsageProgress} from "@/lib/plan-usage-progress";
import {PlanUsageGrid} from "@/components/admin/plan-usage-grid";
import {walletPlanProgress} from "@/lib/wallet-plan-progress";
import {WalletSessionCorrectionForm} from '@/components/admin/wallet-session-correction-form';
import {formatTWDateTime,formatTWTime} from '@/lib/date-utils';
export function CustomerPanelSessions({customerId,walletId,storeId,totalSessions,remainingSessions,initialProgress,hideDetailsToggle=false,detailsOpen=false,onDetailsClose,canVoid=false,planName="方案",onMutated}:{customerId:string;walletId:string;storeId?:string;totalSessions:number;remainingSessions:number;initialProgress?:PlanUsageProgress;hideDetailsToggle?:boolean;detailsOpen?:boolean;onDetailsClose?:()=>void;canVoid?:boolean;planName?:string;onMutated?:()=>void}) {
 const [correcting,setCorrecting]=useState<SessionRow|null>(null);
 const [result,setResult]=useState<{key:string;rows?:SessionRow[];error?:string}>();
 const key=JSON.stringify([customerId,walletId]);
 const load=useCallback(async()=>{
  try{const value=await getCustomerPanelWalletSessions(customerId,walletId);setResult(value.success?{key,rows:value.data}:{key,error:value.error??"讀取失敗"});}
  catch{setResult({key,error:"讀取失敗，請重試"});}
 },[customerId,walletId,key]);
 useEffect(()=>{if(initialProgress)return;let active=true;void getCustomerPanelWalletSessions(customerId,walletId).then(value=>{if(active)setResult(value.success?{key,rows:value.data}:{key,error:value.error??"讀取失敗"});}).catch(()=>{if(active)setResult({key,error:"讀取失敗，請重試"});});return()=>{active=false;};},[customerId,walletId,key,initialProgress]);
 const current=result?.key===key?result:undefined;
 if(current?.error&&!initialProgress)return <p role="alert" className="text-sm text-red-700">{current.error}<button type="button" onClick={()=>void load()} className="min-h-11 px-3 underline">重試</button></p>;
 if(!current?.rows&&!initialProgress)return <p role="status" className="py-2 text-sm">讀取使用紀錄中…</p>;
 const rows=current?.rows??[];
 return <div className="w-full min-w-0"><PlanUsageGrid unitLabel="堂" progress={initialProgress??walletPlanProgress({totalSessions,remainingSessions,sessions:rows})}/>
  <details open={hideDetailsToggle?detailsOpen:undefined} aria-label={hideDetailsToggle?"使用紀錄":undefined} onToggle={e=>{if(e.currentTarget.open&&!current)void load();}}><summary className={hideDetailsToggle?"hidden":"min-h-11 cursor-pointer py-3 text-sm text-primary-700"}>使用明細與更正</summary>{hideDetailsToggle&&detailsOpen&&<div className="flex items-center justify-between"><h4 className="text-sm font-medium">使用紀錄</h4><button type="button" className="min-h-11 px-3 text-sm text-earth-600" onClick={onDetailsClose}>收合</button></div>}{current?.error&&<p role="alert">{current.error}</p>}{!current&&<p role="status">讀取明細中…</p>}<WalletSessionDetail sessions={rows} adminVoid={canVoid?{walletId,walletPlanName:planName,renderButton:session=><VoidSessionButton embedded sessionId={session.id} sessionNo={session.sessionNo} walletPlanName={planName} onSuccess={()=>{void load();onMutated?.();}}/>,renderCorrection:storeId?session=><button type="button" disabled={!!correcting} className="min-h-11 whitespace-nowrap rounded-lg border border-earth-200 px-3 text-sm" onClick={()=>setCorrecting(session)}>更正返還</button>:undefined}:undefined}/>
   {rows.flatMap(session=>session.corrections??[]).map(record=><p key={record.id} className="border-t border-earth-100 py-2 text-sm">第 {record.sessionNo} 堂 · 已更正{record.originalStatus==='BACKFILLED'?'補登':'註銷'}（原日期 {record.originalDate?formatTWTime(new Date(record.originalDate),{dateOnly:true}):'未記錄'}、原原因：{record.originalReason||'未填寫'}、原操作者：{record.originalOperatorName??'未記錄'}） · 返還 1 堂 · {record.reason} · {record.actorName} · {formatTWDateTime(new Date(record.correctedAt))}</p>)}
  </details>
  {correcting&&storeId&&<WalletSessionCorrectionForm key={correcting.id} session={correcting} storeId={storeId} customerId={customerId} walletId={walletId} onCancel={()=>setCorrecting(null)} onSaved={()=>{setCorrecting(null);void load();onMutated?.();}}/>}
 </div>;
}
