"use client";
import { Children, type ReactNode, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmCourseMonthlySettlement, saveCourseSettlementSettings, payCourseProfit, correctCourseProfit } from "@/server/actions/course-monthly-settlement";
import type { SettlementLine } from "@/lib/course-monthly-settlement";
import type { SettlementSettings } from "@/server/services/course-monthly-settlement";
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";
const button="min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-sm disabled:opacity-50";
export function CourseMonthlyPeople({entries,children}:{entries:{id:string;name:string;pending:boolean;priority:number}[];children?:ReactNode}){
 const [filter,setFilter]=useState("ALL");
 const nodes=Children.toArray(children);
 const sorted=entries.map((entry,index)=>({...entry,node:nodes[index]})).sort((a,b)=>a.priority-b.priority||a.name.localeCompare(b.name,"zh-Hant"));
 const visible=sorted.filter(e=>filter==="ALL"||(filter==="PENDING"?e.pending:!e.pending));
 if(!entries.length)return <section aria-label="人員月結清單">{children}</section>;
 return <section className="space-y-3" aria-label="人員月結清單">
 <div className="flex flex-wrap gap-2" aria-label="月結人員篩選">{[["ALL","全部"],["PENDING","待處理"],["SETTLED","已結清／無需付款"]].map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)} className={`${button} ${filter===key?"bg-primary-700 text-white":"bg-white"}`}>{label}（{entries.filter(e=>key==="ALL"||(key==="PENDING"?e.pending:!e.pending)).length}）</button>)}</div>
 <p className="text-xs text-earth-500" role="status">顯示 {visible.length} 位 · 待核對、溢付及未付清優先；上方總額仍為整月金額。</p>
 {visible.length?visible.map(e=><div key={e.id}>{e.node}</div>):<p className="rounded-lg border p-4 text-sm">沒有符合條件的人員。</p>}
 </section>;
}
function useSubmit(){
 const router=useRouter(),lock=useRef(false);const [pending,start]=useTransition(),[message,setMessage]=useState("");
 return {pending,message,run:(action:()=>Promise<{success:boolean;error?:string}>)=>{if(lock.current)return;lock.current=true;setMessage("");start(async()=>{try{const result=await action();if(!result.success)setMessage(result.error??"操作失敗");else{setMessage("已儲存");router.refresh();}}catch{setMessage("連線未完成，內容已保留，請重試。");}finally{lock.current=false;}});}};
}
export function CourseMonthlySettings({settings,canEdit}:{settings:SettlementSettings;canEdit:boolean}){
 const [profitEnabled,setProfit]=useState(settings.profitEnabled),[feeEnabled,setFee]=useState(settings.feeEnabled);const submit=useSubmit();
 return <details className="rounded-xl border border-earth-200 bg-white p-4"><summary className="min-h-11 cursor-pointer font-medium">月結設定</summary><form className="space-y-4" onSubmit={e=>{e.preventDefault();submit.run(()=>saveCourseSettlementSettings({profitEnabled,feeEnabled,revision:settings.revision}));}}>
 <p className="text-sm text-earth-600">關閉只影響新購買／新排課。既有待核帳訂單、課次、待付金額與歷史紀錄保留；已登錄的付款不會再記一次支出。</p>
 <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={profitEnabled} disabled={!canEdit||submit.pending} onChange={e=>setProfit(e.target.checked)}/>計算店長利潤</label>
 <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={feeEnabled} disabled={!canEdit||submit.pending} onChange={e=>setFee(e.target.checked)}/>計算教練授課費（每堂固定）</label>
 {canEdit&&<button className={button} disabled={submit.pending||(profitEnabled===settings.profitEnabled&&feeEnabled===settings.feeEnabled)}>儲存設定</button>}
 {submit.message&&<p role="status">{submit.message}</p>}</form></details>;
}
export function CourseMonthlyConfirm({month,fingerprint,revision,disabled,blockedReason}:{month:string;fingerprint:string;revision:number;disabled:boolean;blockedReason?:string}){
 const [reason,setReason]=useState(revision?"":"首次月結確認");const submit=useSubmit();
 return <form className="space-y-2 rounded-xl border border-earth-200 bg-white p-4" onSubmit={e=>{e.preventDefault();submit.run(()=>confirmCourseMonthlySettlement({month,fingerprint,revision,reason}));}}>{blockedReason&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blockedReason}</p>}<p className="text-sm">確認只保存本次金額，不代表付款。修正版會保留所有舊版。</p><label className="block text-sm">{revision?"修訂原因":"確認備註"}<input className={field} value={reason} maxLength={500} required disabled={disabled||submit.pending} onChange={e=>setReason(e.target.value)}/></label><button className={`${button} bg-primary-700 text-white`} disabled={disabled||submit.pending||!reason.trim()}>{submit.pending?"處理中…":revision?"確認修正版":"確認本月金額"}</button>{submit.message&&<p role="status">{submit.message}</p>}</form>;
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
