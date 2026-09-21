"use client";

import { useEffect, useState, useRef } from "react";
import { searchCourseCustomers } from "@/server/actions/course-browse";
type Choice = { id: string; name: string; phone?: string };

export function CourseCustomerPicker({ name, initial = [], multiple = false, required = false, onChange, enabled = true }: {
  name: string; enabled?:boolean; onChange?:()=>void; initial?: Choice[]; multiple?: boolean; required?: boolean;
}) {
  const input=useRef<HTMLInputElement>(null);
  const [selected,setSelected] = useState(initial);
  const [query,setQuery] = useState("");
  const [retry,setRetry] = useState(0);
  const [result,setResult] = useState<{query:string;rows:Choice[];hasMore:boolean;error?:string} | null>(null);
  useEffect(()=>{
    if(!enabled)return;
    const normalizedQuery=query.trim();
    if(!normalizedQuery)return;
    let active=true;
    const timer=setTimeout(()=>{searchCourseCustomers(normalizedQuery).then(r=>{
      if(active) setResult(r.success ? {query:normalizedQuery,rows:r.rows,hasMore:r.hasMore} : {query:normalizedQuery,rows:[],hasMore:false,error:r.error});
    }).catch(()=>{if(active)setResult({query:normalizedQuery,rows:[],hasMore:false,error:"讀取失敗，請重試"});});},250);
    return ()=>{active=false;clearTimeout(timer);};
  },[query,retry,enabled]);
  useEffect(()=>{input.current?.setCustomValidity(required && !selected.length ? "請從搜尋結果選擇顧客":"");},[selected,required,query]);
  const normalizedQuery=query.trim();
  const ready=result?.query===normalizedQuery;
  return <div className="space-y-2">
    {selected.map(c=><div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-primary-50 px-3 py-1 text-sm">
      <span className="min-w-0 break-words">{c.name}{c.phone ? ` · ${c.phone}` : ""}</span>
      <input type="hidden" name={name} value={c.id}/>
      <button type="button" aria-label={`移除 ${c.name}`} className="min-h-11 shrink-0 px-2" onClick={()=>{setSelected(old=>old.filter(p=>p.id!==c.id));onChange?.();}}>移除</button>
    </div>)}
    <input ref={input} aria-label="搜尋顧客姓名或電話" placeholder="搜尋姓名／電話／LINE 名稱" value={query}
      onChange={e=>setQuery(e.target.value)}
      className="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 px-3 text-base"/>
    {!normalizedQuery ? null : !ready ? <p role="status" className="text-sm">搜尋中…</p> : result?.error ? <p role="alert">{result.error}<button type="button" className="min-h-11 px-3" onClick={()=>setRetry(n=>n+1)}>重試</button></p> : <>
      <div className="max-h-52 overflow-y-auto divide-y rounded-lg border border-earth-200">
        {result?.rows.map(c=>{const chosen=selected.some(p=>p.id===c.id);return <button type="button" key={c.id} disabled={chosen}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:bg-primary-50"
          onClick={()=>{setSelected(old=>multiple ? [...old,c] : [c]);onChange?.();}}>
          <span className="min-w-0 break-words">{c.name} · {c.phone}</span><span className="shrink-0">{chosen ? "已選" : "選取"}</span>
        </button>;})}
        {!result?.rows.length && <p className="p-3 text-sm">沒有符合的顧客</p>}
      </div>
      {result?.hasMore && <p className="text-xs text-earth-500">顯示前 20 位，請輸入更完整的姓名或電話縮小範圍。</p>}
    </>}
  </div>;
}
