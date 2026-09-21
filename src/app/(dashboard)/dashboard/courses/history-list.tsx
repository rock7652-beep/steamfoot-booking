"use client";
import { useEffect, useState, type ReactNode } from "react";
export function CourseHistoryList<T extends {id:string}>({customerId,label,load,render,empty}: {
  customerId:string;label:string;empty:string;
  load:(id:string,offset:number,range:{from:string;to:string})=>Promise<{success:true;data:T[];hasMore:boolean}|{success:false;error:string}>;
  render:(row:T)=>ReactNode;
}) {
  const [range,setRange]=useState({from:"",to:""});
  const [page,setPage]=useState(0);
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;rows:T[];hasMore:boolean;error?:string}|null>(null);
  const key=JSON.stringify([customerId,range,page,retry]);
  const invalid=!!range.from && !!range.to && range.from>range.to;
  useEffect(()=>{
    if(invalid)return;
    let active=true;
    load(customerId,page*10,range).then(r=>{if(active)setResult(r.success ? {key,rows:r.data,hasMore:r.hasMore}:{key,rows:[],hasMore:false,error:r.error});})
      .catch(()=>{if(active)setResult({key,rows:[],hasMore:false,error:"讀取失敗，請重試"});});
    return ()=>{active=false;};
  },[customerId,page,range,key,invalid,load]);
  const ready=result?.key===key;
  return <section className="space-y-3 py-3">
    <h3 className="font-semibold text-primary-800">{label}</h3>
    <div className="grid grid-cols-2 gap-3 text-sm">{([ ["from","開始日期"],["to","結束日期"] ] as const).map(([name,title])=><label key={name} className="min-w-0">{title}<input type="date" aria-label={title} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border px-2" value={range[name]} onChange={e=>{setRange({...range,[name]:e.target.value});setPage(0);}}/></label>)}</div>
    {invalid ? <p role="alert">開始日期不可晚於結束日期</p> : !ready ? <p role="status">讀取中…</p> : result?.error ? <p role="alert">{result.error}<button type="button" className="min-h-11 px-3" onClick={()=>setRetry(n=>n+1)}>重試</button></p> : <>
      <ul className="divide-y">{result?.rows.map(row=><li key={row.id} className="space-y-1 py-3 text-sm">{render(row)}</li>)}</ul>
      {!result?.rows.length && <p className="text-sm text-earth-500">{empty}</p>}
      {(page>0 || result?.hasMore) && <nav aria-label={`${label}分頁`} className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {page+1} 頁 · 每頁 10 筆</span><button type="button" className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={!page} onClick={()=>setPage(n=>n-1)}>上一頁</button><button type="button" className="min-h-11 rounded border px-3 disabled:opacity-40" disabled={!result?.hasMore} onClick={()=>setPage(n=>n+1)}>下一頁</button></nav>}
    </>}
  </section>;
}
