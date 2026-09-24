"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmCourseMonthlySettlement, saveCourseSettlementSettings, payCourseProfit, correctCourseProfit } from "@/server/actions/course-monthly-settlement";
import type { SettlementLine } from "@/lib/course-monthly-settlement";
import type { SettlementSettings } from "@/server/services/course-monthly-settlement";
const field="min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";
const button="min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-sm disabled:opacity-50";
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
export function CourseMonthlyConfirm({month,fingerprint,revision,disabled}:{month:string;fingerprint:string;revision:number;disabled:boolean}){
 const [reason,setReason]=useState(revision?"":"首次月結確認");const submit=useSubmit();
 return <form className="space-y-2 rounded-xl border border-earth-200 bg-white p-4" onSubmit={e=>{e.preventDefault();submit.run(()=>confirmCourseMonthlySettlement({month,fingerprint,revision,reason}));}}><p className="text-sm">確認只保存本次金額，不代表付款。修正版會保留所有舊版。</p><label className="block text-sm">{revision?"修訂原因":"確認備註"}<input className={field} value={reason} maxLength={500} required disabled={disabled||submit.pending} onChange={e=>setReason(e.target.value)}/></label><button className={`${button} bg-primary-700 text-white`} disabled={disabled||submit.pending||!reason.trim()}>{submit.pending?"處理中…":revision?"確認修正版":"確認本月金額"}</button>{submit.message&&<p role="status">{submit.message}</p>}</form>;
}
export function CourseProfitPay({month,line}:{month:string;line:SettlementLine}){
 const remaining=(line.amount??0)-line.paid;const [open,setOpen]=useState(false),[amount,setAmount]=useState(String(remaining)),[method,setMethod]=useState<"OTHER"|"CASH">("OTHER"),[note,setNote]=useState(""),[key,setKey]=useState("");const submit=useSubmit();
 if(!open)return <button className={button} onClick={()=>{setKey(crypto.randomUUID());setOpen(true);}}>登錄利潤已付</button>;
 return <form className="max-w-md space-y-2 rounded-lg bg-earth-50 p-3" onSubmit={e=>{e.preventDefault();submit.run(()=>payCourseProfit({month,purchaseId:line.id,amount:Number(amount),expectedRemaining:remaining,method,note,requestKey:key}));}}><p>僅登錄已支付款項，不會自動匯款。可分次付款。</p><label className="block">本次已付金額<input className={field} type="number" min={1} max={Math.min(remaining,1000000)} step={1} required value={amount} disabled={submit.pending} onChange={e=>setAmount(e.target.value)}/></label><label className="block">付款方式<select className={field} value={method} disabled={submit.pending} onChange={e=>setMethod(e.target.value as "OTHER"|"CASH")}><option value="OTHER">轉帳／其他非現金</option><option value="CASH">現金</option></select></label><label className="block">付款備註<input className={field} required maxLength={500} disabled={submit.pending} value={note} onChange={e=>setNote(e.target.value)}/></label><button className={button} disabled={submit.pending||!note.trim()}>確認登錄</button><button className={button} type="button" disabled={submit.pending} onClick={()=>setOpen(false)}>收合</button>{submit.message&&<p role="status">{submit.message}</p>}</form>;
}
export function CourseProfitCorrect({paymentId}:{paymentId:string}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState("");const submit=useSubmit();
 if(!open)return <button className={button} onClick={()=>setOpen(true)}>更正誤登</button>;
 return <form className="space-y-2" onSubmit={e=>{e.preventDefault();submit.run(()=>correctCourseProfit({paymentId,reason}));}}><p>只更正誤登，不代表已收回款項。實際溢付請先核對，不可用誤登更正代替收回款項。</p><label>更正原因<input className={field} required maxLength={500} value={reason} disabled={submit.pending} onChange={e=>setReason(e.target.value)}/></label><button className={button} disabled={submit.pending||!reason.trim()}>確認更正</button><button className={button} type="button" disabled={submit.pending} onClick={()=>setOpen(false)}>收合</button>{submit.message&&<p role="status">{submit.message}</p>}</form>;
}
