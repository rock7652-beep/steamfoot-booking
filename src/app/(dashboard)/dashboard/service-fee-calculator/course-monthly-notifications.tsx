"use client";
import { useRef,useState } from 'react';
import { previewCourseMonthlyNotifications,notifyCourseMonthlyPerson } from '@/server/actions/course-monthly-notification';
import type { NoticeSummary,NoticeStatus } from '@/lib/course-monthly-notification';
const labels:Record<NoticeStatus,string>={READY:'可通知',SENT:'已通知',FAILED:'可重試',BUSY:'處理中',UNBOUND:'未完成綁定',BLOCKED:'需核對'};
const button='min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-sm disabled:opacity-50';
export function CourseMonthlyNotifications({month,revision,enabled,confirmed}:{month:string;revision:number;enabled:boolean;confirmed:boolean}){
 const [open,setOpen]=useState(false);
 const [summary,setSummary]=useState<NoticeSummary|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false);
 const blocked=!enabled?'請在設定開放本人收入查詢。':!confirmed?'請先確認月結。':null;
 async function preview(){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{const r=await previewCourseMonthlyNotifications({month,revision});if(r.success)setSummary(r.data);else setMessage(r.error??'讀取失敗，請重試。');}catch{setMessage('連線未完成，請重試。');}finally{lock.current=false;setBusy(false);}
 }
 async function send(){
  if(lock.current||!summary||summary.preview||summary.reason)return;
  lock.current=true;setBusy(true);setMessage('');let sent=0,failed=0;
  try{
   // One person per authenticated action; every call rechecks the current month and binding.
   for(const row of summary.rows.filter(r=>r.status==='READY'||r.status==='FAILED')){
    const r=await notifyCourseMonthlyPerson({month,revision,staffId:row.staffId});
    if(r.success&&r.data?.status==='SENT'){sent++;setSummary(s=>s?{...s,rows:s.rows.map(p=>p.staffId===row.staffId?{...p,status:'SENT',reason:''}:p)}:s);}
    else failed++;
   }
   setMessage(`本次已通知 ${sent} 人${failed?`，${failed} 人未完成，請查看下方狀態。`:'。'}`);
   const r=await previewCourseMonthlyNotifications({month,revision});if(r.success&&r.data)setSummary(r.data as NoticeSummary);
  }catch{setMessage('連線中斷，已完成的通知會保留。請重新查看通知狀態後重試。');}
  finally{lock.current=false;setBusy(false);}
 }
 const eligible=summary?.rows.filter(r=>r.status==='READY'||r.status==='FAILED').length??0;
 return <section aria-label="月結通知" className={`rounded-lg border border-earth-200 bg-white px-3 ${open?"w-full max-w-xl":""}`}>
 <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-sm" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open&&!summary&&!blocked)void preview();}}><span>通知人員</span><span aria-hidden="true">{open?'－':'＋'}</span></button>
 {open&&<div className="space-y-3 pb-4">
 {blocked?<p role="status" className="text-sm text-earth-600">{blocked}</p>:<>
 {busy&&<p role="status" className="text-sm">處理中…</p>}
 {summary&&<>
 {summary.preview&&<p className="text-xs text-earth-500">預覽模式，不會發送。</p>}
 {summary.reason?<p role="status" className="text-sm">{summary.reason}</p>:<>
 <p className="text-sm">可通知 {eligible} 人 · 已通知 {summary.rows.filter(r=>r.status==='SENT').length} 人 · 需綁定 {summary.rows.filter(r=>r.status==='UNBOUND').length} 人</p>
 <details><summary className="min-h-11 cursor-pointer py-2 text-sm">查看名單（{summary.rows.length}）</summary><ul className="divide-y">{summary.rows.map(row=><li key={row.staffId} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{row.name}</span><span className="text-earth-600">{labels[row.status]}</span>{row.reason&&row.status!=='UNBOUND'&&<p className="w-full text-xs text-earth-500">{row.reason}</p>}</li>)}</ul></details>
 <details><summary className="min-h-11 cursor-pointer py-2 text-sm">訊息預覽</summary><blockquote className="rounded-lg bg-earth-50 p-3 text-sm">{month} 收入明細已確認，可登入查看。<br/>此通知不代表款項已入帳。</blockquote></details>
 <button type="button" className={`${button} bg-primary-700 text-white`} disabled={busy||!eligible||summary.preview} onClick={send}>發送 LINE 通知（{eligible}）</button>
 </>}
 </>}
 <button type="button" className="ml-2 min-h-11 text-sm text-primary-700 disabled:opacity-50" disabled={busy} onClick={preview}>更新名單</button>
 </>}
 {message&&<p role="status" className="text-sm">{message}</p>}
 </div>}
 </section>;
}
