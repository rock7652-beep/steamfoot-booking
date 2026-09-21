"use client";
import { useEffect, useState } from "react";
import { browseCourseCards } from "@/server/actions/course-browse";
import { toLocalDateStr } from "@/lib/date-utils";
import type { CourseCardView } from "./member-workspace";
import { courseCompactField, courseField } from "@/components/admin/course-ui";
export type CardBrowseState = { search: string; history: boolean; page: number };
export function CourseCardBrowser({ customerId, state, onChange, onSelect, revision=0 }: {
  customerId?: string; state:CardBrowseState;onChange:(state:CardBrowseState)=>void;
  onSelect:(card:CourseCardView)=>void;revision?:number;
}) {
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;rows:CourseCardView[];hasMore:boolean;error?:string}|null>(null);
  const key=JSON.stringify([customerId,state,revision,retry]);
  useEffect(()=>{
    let active=true;
    const timer=setTimeout(()=>{browseCourseCards({customerId,...state}).then(r=>{
      if(active)setResult(r.success ? {key,rows:r.rows,hasMore:r.hasMore} : {key,rows:[],hasMore:false,error:r.error});
    }).catch(()=>{if(active)setResult({key,rows:[],hasMore:false,error:"讀取失敗，請重試"});});},200);
    return ()=>{active=false;clearTimeout(timer);};
  },[customerId,state,key]);
  const ready=result?.key===key;
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="搜尋持有方案或共卡成員" className={`${courseField} flex-1`} placeholder="搜尋方案／共卡成員" value={state.search} onChange={e=>onChange({...state,search:e.target.value,page:0})}/>
      <select aria-label="方案效期" className={courseCompactField} value={state.history ? "history":"active"} onChange={e=>onChange({...state,history:e.target.value==="history",page:0})}><option value="active">有效方案</option><option value="history">已到期／停用</option></select>
    </div>
    {!ready ? <p role="status">讀取中…</p> : result?.error ? <p role="alert">{result.error}<button className="min-h-11 px-3" onClick={()=>setRetry(n=>n+1)}>重試</button></p> : <>
      <div className="divide-y rounded-xl border bg-white">
        {result?.rows.map(c=><button key={c.id} type="button" onClick={()=>onSelect(c)} className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm">
          <span className="min-w-0 break-words font-medium">{c.name}</span><span className="whitespace-nowrap font-semibold">可用 {c.available} {c.unit==="SESSION" ? "堂":"點"}</span>
          <span className="min-w-0 break-words text-xs text-earth-500">{customerId ? `占用 ${c.held} · 剩餘 ${c.remaining}` : c.members.map(m=>m.name).join("、")}</span><span className="whitespace-nowrap text-xs text-earth-500">{toLocalDateStr(new Date(c.expiresAt))} 到期{c.closed ? " · 停用":""}</span>
        </button>)}
        {!result?.rows.length && <p className="p-4 text-sm text-earth-500">沒有符合的方案，請調整搜尋或效期。</p>}
      </div>
      {(state.page>0 || result?.hasMore) && <nav aria-label="持有方案分頁" className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {state.page+1} 頁 · 每頁 20 筆</span><button className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={!state.page} onClick={()=>onChange({...state,page:state.page-1})}>上一頁</button><button className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={!result?.hasMore} onClick={()=>onChange({...state,page:state.page+1})}>下一頁</button></nav>}
    </>}
  </section>;
}
