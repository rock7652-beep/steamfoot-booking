"use client";
import { useEffect, useState } from "react";
import { loadCourseCardReservations } from "@/server/actions/course-card-reservations";
import { formatTWDateTime } from "@/lib/date-utils";
export function CourseCardReservations({cardId,held,unit,revision=0}:{cardId:string;held:number;unit:string;revision?:number}) {
  const [open,setOpen]=useState(false),[page,setPage]=useState(0),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;value:Awaited<ReturnType<typeof loadCourseCardReservations>>}|null>(null);
  const key=JSON.stringify([cardId,page,retry,revision,held]);
  useEffect(()=>{
    if(!open)return;
    let active=true;
    loadCourseCardReservations({cardId,page}).then(value=>{if(active)setResult({key,value});}).catch(()=>{if(active)setResult({key,value:{success:false,error:"讀取失敗，請重試"}});});
    return ()=>{active=false;};
  },[open,cardId,page,key]);
  const data=result?.key===key?result.value:null;
  const label=unit==="SESSION"?"堂":"點";
  return <div className="text-sm">
    <button type="button" aria-expanded={open} className="min-h-11 text-primary-700 underline underline-offset-2" onClick={()=>setOpen(v=>!v)}>已預約 {held} {label}{unit==="POINT"?"額度":""} {open?"▴":"▾"}</button>
    {open&&<div className="rounded-lg bg-earth-50 p-3">
      {!data?<p role="status">讀取中…</p>:!data.success?<p role="alert">{data.error}<button type="button" className="min-h-11 px-3 underline" onClick={()=>setRetry(n=>n+1)}>重試</button></p>:<>
        {data.scoped&&<p className="text-xs text-earth-500">僅顯示你有權查看的學員預約。</p>}
        <ul className="divide-y">{data.rows.map(b=><li key={b.id} className="py-2"><p>{formatTWDateTime(new Date(b.startsAt))} · {b.name}</p><p className="text-earth-600">{b.customerName} · {b.amount} {label}</p></li>)}</ul>
        {!data.rows.length&&<p>沒有可顯示的預約。</p>}
        {(page>0||data.hasMore)&&<div className="flex items-center gap-3"><button type="button" className="min-h-11 disabled:opacity-40" disabled={page===0} onClick={()=>setPage(p=>p-1)}>上一頁</button><span>第 {page+1} 頁</span><button type="button" className="min-h-11 disabled:opacity-40" disabled={!data.hasMore} onClick={()=>setPage(p=>p+1)}>下一頁</button></div>}
      </>}
    </div>}
  </div>;
}
