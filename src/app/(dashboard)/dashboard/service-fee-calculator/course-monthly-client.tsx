"use client";
import { Children, type ReactNode, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmCourseMonthlySettlement, saveCourseSettlementSettings, payCourseProfit, correctCourseProfit } from "@/server/actions/course-monthly-settlement";
import type { SettlementLine } from "@/lib/course-monthly-settlement";
import type { SettlementSettings } from "@/server/services/course-monthly-settlement";
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";
const button="min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-sm disabled:opacity-50";
export function CourseMonthlyPeople({entries,children,actions}:{entries:{id:string;name:string;pending:boolean;priority:number}[];children?:ReactNode;actions?:ReactNode}){
 const [query,setQuery]=useState("");
 const nodes=Children.toArray(children);
 const sorted=entries.map((entry,index)=>({...entry,node:nodes[index]})).sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name,"zh-Hant"));
 const visible=sorted.filter(e=>e.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <section className="space-y-2" aria-label="人員月結清單">
 <div className="flex flex-wrap items-start gap-2" aria-label="月結工具列">
 {entries.length>1&&<input type="search" aria-label="搜尋人員" placeholder="搜尋人員" className={`${field} sm:max-w-xs`} value={query} onChange={e=>setQuery(e.target.value)}/>}
 {actions&&<div className="ml-auto flex min-w-0 flex-1 flex-wrap items-start justify-end gap-2">{actions}</div>}
 </div>
 <div className="overflow-hidden rounded-xl border border-earth-200 bg-white">
 <div className="hidden grid-cols-[minmax(8rem,1fr)_1fr_1fr_1fr_5rem] gap-x-4 border-b bg-earth-50 px-4 py-3 text-xs text-earth-500 md:grid"><span>人員</span><span className="text-right">店長利潤</span><span className="text-right">授課費</span><span className="text-right">應領合計</span><span className="sr-only">明細</span></div>
 {!entries.length?children:sorted.map(e=><div key={e.id} hidden={!visible.some(v=>v.id===e.id)}>{e.node}</div>)}
 {!!entries.length&&!visible.length&&<p role="status" className="p-4 text-sm">找不到符合的人員。</p>}
 </div></section>;
}

function useSubmit(){
 const router=useRouter(),lock=useRef(false);const [pending,start]=useTransition(),[message,setMessage]=useState("");
 return {pending,message,run:(action:()=>Promise<{success:boolean;error?:string}>)=>{if(lock.current)return;lock.current=true;setMessage("");start(async()=>{try{const result=await action();if(!result.success)setMessage(result.error??"操作失敗");else{setMessage("已儲存");router.refresh();}}catch{setMessage("連線未完成，內容已保留，請重試。");}finally{lock.current=false;}});}};
}
export function CourseMonthlySettings({settings,canEdit}:{settings:SettlementSettings;canEdit:boolean}){
 const [profitEnabled,setProfit]=useState(settings.profitEnabled),[feeEnabled,setFee]=useState(settings.feeEnabled),[personalIncomeEnabled,setIncome]=useState(settings.personalIncomeEnabled);const submit=useSubmit();
 return <details className="group/settings rounded-lg border border-earth-200 bg-white px-3 open:w-full open:max-w-xl"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm"><span>設定</span><span aria-hidden="true" className="group-open/settings:hidden">＋</span><span aria-hidden="true" className="hidden group-open/settings:inline">－</span></summary><form className="space-y-3 pb-4" onSubmit={e=>{e.preventDefault();submit.run(()=>saveCourseSettlementSettings({profitEnabled,feeEnabled,personalIncomeEnabled,revision:settings.revision}));}}>
 <h3 className="font-medium">計算項目</h3>
 <p className="text-sm text-earth-600">變更只影響新購買／新排課，既有紀錄保留。</p>
 <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={profitEnabled} disabled={!canEdit||submit.pending} onChange={e=>setProfit(e.target.checked)}/>計算店長利潤</label>
 <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={feeEnabled} disabled={!canEdit||submit.pending} onChange={e=>setFee(e.target.checked)}/>計算教練授課費（每堂固定）</label>
 <h3 className="border-t pt-4 font-medium">人員查詢</h3>
 <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={personalIncomeEnabled} disabled={!canEdit||submit.pending} onChange={e=>setIncome(e.target.checked)}/>開放人員查看本人收入</label>
 <p className="text-sm text-earth-600">人員只能查看本人已確認的金額與明細。</p>
 {canEdit&&<button className={button} disabled={submit.pending||(profitEnabled===settings.profitEnabled&&feeEnabled===settings.feeEnabled&&personalIncomeEnabled===settings.personalIncomeEnabled)}>儲存設定</button>}
 {submit.message&&<p role="status">{submit.message}</p>}</form></details>;
}
export function CourseMonthlyConfirm({month,fingerprint,revision,disabled,blockedReason}:{month:string;fingerprint:string;revision:number;disabled:boolean;blockedReason?:string}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState(revision?"":"首次月結確認");const submit=useSubmit();
 return <div className="space-y-2">
 {!open?<button type="button" className={`${button} bg-primary-700 text-white`} disabled={disabled} onClick={()=>setOpen(true)}>{revision?"重新確認":"確認月結"}</button>:<form className="space-y-3 rounded-lg border border-earth-200 bg-white p-4" onSubmit={e=>{e.preventDefault();submit.run(()=>confirmCourseMonthlySettlement({month,fingerprint,revision,reason}));}}>
 <p className="text-sm">確認 {month} 的收入金額？</p>
 {revision>0&&<label className="block text-sm">調整原因<input className={field} value={reason} maxLength={500} required disabled={disabled||submit.pending} onChange={e=>setReason(e.target.value)}/></label>}
 <div className="flex gap-2"><button className={`${button} bg-primary-700 text-white`} disabled={disabled||submit.pending||!reason.trim()}>{submit.pending?"處理中…":"確認"}</button><button type="button" className={button} disabled={submit.pending} onClick={()=>setOpen(false)}>取消</button></div>
 </form>}
 {blockedReason&&<p role="status" className="text-sm text-amber-800">{blockedReason}</p>}{submit.message&&<p role="status">{submit.message}</p>}
 </div>;
}

export function CourseProfitPay({month,line}:{month:string;line:SettlementLine}){
 const remaining=(line.amount??0)-line.paid;const [open,setOpen]=useState(false),[amount,setAmount]=useState(String(remaining)),[method,setMethod]=useState<"OTHER"|"CASH">("OTHER"),[note,setNote]=useState(""),[key,setKey]=useState("");const submit=useSubmit();
 if(!open)return <button className={button} onClick={()=>{setKey(crypto.randomUUID());setOpen(true);}}>登錄利潤已付</button>;
 return <form className="max-w-md space-y-2 rounded-lg bg-earth-50 p-3" onSubmit={e=>{e.preventDefault();submit.run(()=>payCourseProfit({month,purchaseId:line.id,amount:Number(amount),expectedRemaining:remaining,method,note,requestKey:key}));}}><p>僅登錄已支付款項，不會自動匯款。可分次付款。</p><label className="block">本次已付金額<input className={field} type="number" min={1} max={Math.min(remaining,1000000)} step={1} required value={amount} disabled={submit.pending} onChange={e=>setAmount(e.target.value)}/></label><label className="block">付款方式<select className={field} value={method} disabled={submit.pending} onChange={e=>setMethod(e.target.value as "OTHER"|"CASH")}><option value="OTHER">轉帳／其他非現金</option><option value="CASH">現金</option></select></label><label className="block">付款備註<input className={field} required maxLength={500} disabled={submit.pending} value={note} onChange={e=>setNote(e.target.value)}/></label><button className={button} disabled={submit.pending||!note.trim()}>確認登錄</button><button className={button} type="button" disabled={submit.pending} onClick={()=>setOpen(false)}>收合</button>{submit.message&&<p role="status">{submit.message}</p>}</form>;
}
export function CourseProfitCorrect({paymentId}:{paymentId:string}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState("");const submit=useSubmit();
 if(!open)return <button className={button} onClick={()=>setOpen(true)}>更正誤登</button>;
 return <form className="space-y-2" onSubmit={e=>{e.preventDefault();submit.run(()=>correctCourseProfit({paymentId,reason}));}}><p>確認後會保留原付款紀錄，並同步沖回對應支出。僅適用於記錯的付款，不代表已收回款項；真實溢付不可用更正誤登代替收回。</p><label>更正原因<input className={field} required maxLength={500} value={reason} disabled={submit.pending} onChange={e=>setReason(e.target.value)}/></label><button className={button} disabled={submit.pending||!reason.trim()}>確認更正</button><button className={button} type="button" disabled={submit.pending} onClick={()=>setOpen(false)}>收合</button>{submit.message&&<p role="status">{submit.message}</p>}</form>;
}
