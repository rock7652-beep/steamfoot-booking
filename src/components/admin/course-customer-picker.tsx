"use client";

import { useEffect, useState, useRef,useMemo } from "react";
import { loadCourseCustomerSearchIndex, searchCourseCustomers } from "@/server/actions/course-browse";
import { matchCustomerSearch, type CustomerSearchOption } from "@/lib/customer-search-index";
import { usePathname } from "next/navigation";
type Choice = { id: string; name: string; phone?: string };

export function CourseCustomerPicker({ choices, name, initial = [], multiple = false, required = false, onChange, enabled = true, compact = false }: {
  compact?:boolean;choices?:CustomerSearchOption[];name: string; enabled?:boolean; onChange?:(selected: Choice[])=>void; initial?: Choice[]; multiple?: boolean; required?: boolean;
}) {
  const pathname=usePathname();
  const [result,setResult] = useState<{path:string;query:string;rows:Choice[];hasMore:boolean;error?:string} | null>(null);

  const [index,setIndex]=useState<{path:string;rows:CustomerSearchOption[];complete:boolean}|null>(null);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const refresh=()=>{setIndex(null);setResult(null);setRevision(n=>n+1);};
    window.addEventListener("focus",refresh);
    window.addEventListener("customer-search-invalidated",refresh);
    return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("customer-search-invalidated",refresh);};
  },[]);
  useEffect(()=>{
    if(!enabled||choices)return;
    let active=true;
    loadCourseCustomerSearchIndex().then(r=>{if(active&&r.success)setIndex({path:pathname,rows:r.rows,complete:r.complete});}).catch(()=>{});
    return()=>{active=false;};
  },[enabled,pathname,revision,choices]);
  const activeIndex=useMemo(()=>choices?{rows:choices,complete:true}:index?.path===pathname?index:null,[choices,index,pathname]);
  const input=useRef<HTMLInputElement>(null);
  const [selected,setSelected] = useState(initial);
  const [composing,setComposing] = useState(false);
  const [query,setQuery] = useState("");
  const [focused,setFocused] = useState(false);
  const [retry,setRetry] = useState(0);
  useEffect(()=>{
    if(!enabled || composing || activeIndex?.complete)return;
    const normalizedQuery=composing ? "" : query.trim();
    if(!normalizedQuery)return;
    let active=true;
    const timer=setTimeout(()=>{searchCourseCustomers(normalizedQuery).then(r=>{
      if(active) setResult(r.success ? {path:pathname,query:normalizedQuery,rows:r.rows,hasMore:r.hasMore} : {path:pathname,query:normalizedQuery,rows:[],hasMore:false,error:r.error});
    }).catch(()=>{if(active)setResult({path:pathname,query:normalizedQuery,rows:[],hasMore:false,error:"讀取失敗，請重試"});});},250);
    return ()=>{active=false;clearTimeout(timer);};
  },[query,retry,enabled,composing,activeIndex,pathname,revision]);
  useEffect(()=>{input.current?.setCustomValidity(required && !selected.length ? "請從搜尋結果選擇顧客":"");},[selected,required,query]);
  const normalizedQuery=composing ? "" : query.trim();
  const ready=activeIndex?.complete || (result?.path===pathname && result?.query===normalizedQuery);
  const visibleRows=activeIndex?.complete ? matchCustomerSearch(activeIndex.rows,normalizedQuery,20) : (result?.path===pathname && result?.query===normalizedQuery) ? result.rows : activeIndex ? matchCustomerSearch(activeIndex.rows,normalizedQuery,20) : [];
  return <div className={compact ? "relative min-w-0" : "space-y-2"} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}}>
    {!compact && selected.map(c=><div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-primary-50 px-3 py-1 text-sm">
      <span className="min-w-0 break-words">{c.name}{c.phone ? ` · ${c.phone}` : ""}</span>
      <input type="hidden" name={name} value={c.id}/>
      <button type="button" aria-label={`移除 ${c.name}`} className="min-h-11 shrink-0 px-2" onClick={()=>{setSelected(old=>{const next=old.filter(p=>p.id!==c.id);onChange?.(next);return next;});}}>移除</button>
    </div>)}
    {compact && selected.map(c=><input key={c.id} type="hidden" name={name} value={c.id}/>)}
    <input ref={input} aria-label={compact?"搜尋學員姓名或電話":"搜尋顧客姓名、電話或 LINE 名稱"} placeholder={compact?"姓名／電話":"搜尋姓名／電話／LINE 名稱"} value={compact && selected.length && !query ? `${selected[0].name} · ${selected[0].phone??""}` : query}
      onCompositionStart={()=>setComposing(true)}
      onCompositionEnd={()=>setComposing(false)}
      onKeyDown={e=>{if(e.key === "Enter")e.preventDefault();}}
      onChange={e=>{setQuery(e.target.value);if(compact && selected.length){setSelected([]);onChange?.([]);}}}
      className={`min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-base ${compact && (query || selected.length > 0) ? "pr-11" : ""}`}/>
    {compact && (query || selected.length>0) && <button type="button" aria-label="清除學員搜尋" className="absolute right-0 top-0 min-h-11 w-11 text-earth-600" onClick={()=>{setQuery("");setSelected([]);onChange?.([]);}}>×</button>}
    {!normalizedQuery || (compact && !focused) ? null : !ready && !visibleRows.length ? <p role="status" className="text-sm">搜尋中…</p> : (result?.path===pathname && result?.query===normalizedQuery) && result?.error && !activeIndex?.complete ? <p role="alert">{result.error}<button type="button" className="min-h-11 px-3" onClick={()=>setRetry(n=>n+1)}>重試</button></p> : <>
      <div role={compact?"group":undefined} aria-label={compact?"學員搜尋結果":undefined} className={compact?"absolute z-30 mt-1 max-h-52 w-full overflow-y-auto divide-y rounded-lg border border-earth-200 bg-white shadow-lg":"max-h-52 overflow-y-auto divide-y rounded-lg border border-earth-200"}>
        {visibleRows.map(c=>{const chosen=selected.some(p=>p.id===c.id);return <button type="button" key={c.id} disabled={chosen}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:bg-primary-50"
          onClick={()=>{const next=multiple ? [...selected,c] : [c];setSelected(next);onChange?.(next);if(compact)setQuery("");}}>
          <span className="min-w-0 break-words">{c.name} · {c.phone}</span><span className="shrink-0">{chosen ? "已選" : "選取"}</span>
        </button>;})}
        {ready && !visibleRows.length && <p className="p-3 text-sm">沒有符合的顧客</p>}
      </div>
      {!ready && <p role="status" className="text-xs text-earth-500">正在查詢其餘顧客…</p>}
      {!activeIndex?.complete && (result?.path===pathname && result?.query===normalizedQuery) && result?.hasMore && <p className="text-xs text-earth-500">顯示前 20 位，請輸入更完整的姓名或電話縮小範圍。</p>}
    </>}
  </div>;
}
