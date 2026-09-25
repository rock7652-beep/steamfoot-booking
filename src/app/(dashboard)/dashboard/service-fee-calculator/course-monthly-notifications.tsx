"use client";
import { useRef,useState } from 'react';
import { previewCourseMonthlyNotifications,notifyCourseMonthlyPerson } from '@/server/actions/course-monthly-notification';
import type { NoticeSummary,NoticeStatus } from '@/lib/course-monthly-notification';
const labels:Record<NoticeStatus,string>={READY:'可通知',SENT:'已通知',FAILED:'可重試',BUSY:'處理中',UNBOUND:'未完成綁定',BLOCKED:'需核對'};
const button='min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-sm disabled:opacity-50';
export function CourseMonthlyNotifications({month,revision,enabled,confirmed}:{month:string;revision:number;enabled:boolean;confirmed:boolean}){
 const [summary,setSummary]=useState<NoticeSummary|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false);
 const blocked=!enabled?'請先於月結設定開放人員查看本人收入。':!confirmed?'請先確認本月金額；調整中的月結暫不通知。':null;
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
 return <section aria-label="月結通知" className="space-y-3 rounded-xl border border-earth-200 bg-white p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">通知人員查看收入</h2><button type="button" className={button} disabled={busy||!!blocked} onClick={preview}>{busy?'處理中…':summary?'更新通知狀態':'查看可通知人員'}</button></div>
  <p className="text-sm text-earth-600">手動發送 LINE 提醒，訊息不含金額。同一版月結已通知的人員不會重複發送。</p>
  {blocked&&<p role="status" className="text-sm text-amber-800">{blocked}</p>}
  {summary&&<>
   {summary.preview&&<p className="rounded-lg bg-amber-50 p-3 text-sm">隔離預覽不會發送真實 LINE；目前僅核對帳號綁定，正式發送前會再確認是否可通知。</p>}
   {summary.reason?<p role="status">{summary.reason}</p>:<>
    <p className="text-sm">可通知／重試 {eligible} 人 · 已通知 {summary.rows.filter(r=>r.status==='SENT').length} 人 · 未完成綁定 {summary.rows.filter(r=>r.status==='UNBOUND').length} 人</p>
    <details><summary className="min-h-11 cursor-pointer py-2">人員通知狀態（{summary.rows.length}）</summary><ul className="divide-y">{summary.rows.map(row=><li key={row.staffId} className="py-2 text-sm"><span className="font-medium">{row.name}</span> · {labels[row.status]}{row.reason&&<p className="text-earth-600">{row.reason}</p>}</li>)}</ul></details>
    <blockquote className="rounded-lg bg-earth-50 p-3 text-sm">{month} 收入明細已確認，可登入查看。<br/>此通知不代表款項已入帳。</blockquote>
    <button type="button" className={`${button} bg-primary-700 text-white`} disabled={busy||!eligible||summary.preview} onClick={send}>通知 {eligible} 位人員</button>
    <p className="text-xs text-earth-500">已通知表示 LINE 已接受發送，不代表本人已讀或已收款。</p>
   </>}
  </>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
