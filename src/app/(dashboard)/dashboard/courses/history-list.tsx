"use client";
import { useMusicDataRevision } from "@/components/operations/panel-read-cache";
import { useEffect, useState, type ReactNode } from "react";
import { RosterTable } from "@/components/admin/roster-primitives";
export function CourseHistoryList<T extends {id:string}>({customerId,label,load,render,empty,mode,columns,revision=0}: {
  revision?:number;customerId:string;label:string;empty:string;mode?:string;
  load:(id:string,offset:number,range:{from:string;to:string;mode?:string})=>Promise<{success:true;data:T[];hasMore:boolean}|{success:false;error:string}>;
  render:(row:T)=>ReactNode;
  columns?:string[];
}) {
  const [range,setRange]=useState({from:"",to:""});
  const [page,setPage]=useState(0);
  const [retry,setRetry]=useState(0);
  const [result,setResult]=useState<{key:string;customerId:string;rows:T[];hasMore:boolean;error?:string}|null>(null);
  const syncRevision = useMusicDataRevision();
  const key=JSON.stringify([syncRevision,customerId,range,page,retry,mode,revision]);
  const invalid=!!range.from && !!range.to && range.from>range.to;
  useEffect(()=>{
    if(invalid)return;
    let active=true;
    load(customerId,page*10,{...range,...(mode ? {mode} : {})}).then(r=>{if(active)setResult(r.success ? {key,customerId,rows:r.data,hasMore:r.hasMore}:{key,customerId,rows:[],hasMore:false,error:r.error});})
      .catch(()=>{if(active)setResult({key,customerId,rows:[],hasMore:false,error:"讀取失敗，請重試"});});
    return ()=>{active=false;};
  },[customerId,page,range,key,invalid,load,mode]);
  const ready=result?.key===key;
  return <section className="@container/history space-y-2 py-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-primary-800">{label}</h3>
    <div className="grid w-full min-w-0 grid-cols-2 gap-2 text-sm @min-[42rem]/history:w-auto">{([ ["from","開始日期"],["to","結束日期"] ] as const).map(([name,title])=><label key={name} className="min-w-0 @min-[42rem]/history:flex @min-[42rem]/history:items-center @min-[42rem]/history:gap-2">{title}<input type="date" aria-label={title} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-2 @min-[42rem]/history:mt-0 @min-[42rem]/history:w-40" value={range[name]} onChange={e=>{setRange({...range,[name]:e.target.value});setPage(0);}}/></label>)}</div></div>
    {invalid ? <p role="alert">開始日期不可晚於結束日期</p> : !ready && result?.customerId !== customerId ? <p role="status">讀取中…</p> : result?.error ? <p role="alert">{result.error}<button type="button" className="min-h-11 px-3" onClick={()=>setRetry(n=>n+1)}>重試</button></p> : <>
      {columns ? <RosterTable label={label} columns={columns}>{result?.rows.map(row=><tr key={row.id}>{render(row)}</tr>)}</RosterTable> : <ul className="divide-y divide-earth-100">{result?.rows.map(row=><li key={row.id} className="space-y-1 py-3 text-sm">{render(row)}</li>)}</ul>}
      {!result?.rows.length && <p className="text-sm text-earth-500">{empty}</p>}
      {(page>0 || result?.hasMore) && <nav aria-label={`${label}分頁`} className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>第 {page+1} 頁 · 每頁 10 筆</span><button type="button" className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!page} onClick={()=>setPage(n=>n-1)}>上一頁</button><button type="button" className="min-h-11 rounded border border-earth-200 px-3 disabled:opacity-40" disabled={!result?.hasMore} onClick={()=>setPage(n=>n+1)}>下一頁</button></nav>}
    </>}
  </section>;
}
