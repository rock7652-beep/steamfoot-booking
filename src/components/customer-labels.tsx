"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { loadCustomerLabels, setCustomerLabel } from "@/server/actions/customer-labels";
import { EMPTY_LABELS, labelColor, type LabelSnapshot } from "@/lib/customer-labels";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { courseSettingsPanelHref } from "@/lib/course-settings-panels";
import { DashboardLink } from "@/components/dashboard-link";
type ContextValue = {snapshot: LabelSnapshot; register:(id:string)=>()=>void; refresh:()=>Promise<void>; update:(id:string,labels:string[])=>void; pendingIds: Set<string>; lock:(id:string)=>boolean; unlock:(id:string)=>void};
const Context = createContext<ContextValue|null>(null);
export function CustomerLabelsProvider({children,initial=EMPTY_LABELS}:{children:ReactNode;initial?:LabelSnapshot}) {
  const [snapshot,setSnapshot]=useState(initial);
  const [pendingIds,setPendingIds]=useState(new Set<string>());
  const pendingRef=useRef(new Set<string>());
  const ids=useRef(new Map<string,number>());
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    if(pendingRef.current.size)return;
    const version=++generation.current;
    try {
      const allIds=[...ids.current.keys()];
      const batches=await Promise.all(Array.from({length:Math.max(1,Math.ceil(allIds.length/500))},(_,i)=>loadCustomerLabels(allIds.slice(i*500,(i+1)*500))));
      const result={...batches[0],assignments:Object.assign({},...batches.map(batch=>batch.assignments))};
      if(version===generation.current)setSnapshot(result);
    } catch {if(version===generation.current)toast.error("標籤讀取失敗，請重新整理");}
  },[]);
  useEffect(()=>{const changed=()=>void refresh();window.addEventListener("customer-labels:refresh",changed);return()=>window.removeEventListener("customer-labels:refresh",changed);},[refresh]);
  const register=useCallback((id:string)=>{
    ids.current.set(id,(ids.current.get(id)??0)+1);
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>void refresh(),30);
    return ()=>{const count=(ids.current.get(id)??1)-1;if(count)ids.current.set(id,count);else ids.current.delete(id);};
  },[refresh]);
  useEffect(()=>()=>{generation.current++;if(timer.current)clearTimeout(timer.current);},[]);
  const update=useCallback((id:string,labels:string[])=>{generation.current++;setSnapshot(old=>({...old,assignments:{...old.assignments,[id]:labels}}));},[]);
  const lock=useCallback((id:string)=>{if(pendingRef.current.has(id))return false;pendingRef.current.add(id);setPendingIds(new Set(pendingRef.current));return true;},[]);
  const unlock=useCallback((id:string)=>{pendingRef.current.delete(id);setPendingIds(new Set(pendingRef.current));if(!pendingRef.current.size)void refresh();},[refresh]);
  return <Context.Provider value={{snapshot,register,refresh,update,pendingIds,lock,unlock}}>{children}</Context.Provider>;
}
export function CustomerLabelsSettingsLink() {
  const ctx=useContext(Context),pathname=usePathname();
  if(!ctx?.snapshot.available)return null;
  return <DashboardLink href={pathname.includes("/courses")?courseSettingsPanelHref("/dashboard/settings/customer-labels"):"/dashboard/settings/customer-labels"} className="inline-flex min-h-10 items-center rounded-lg border border-earth-200 px-3 text-sm text-primary-700">顧客標籤設定</DashboardLink>;
}
export function CustomerLabels({customerId,readOnly=false,displayOnly=false}:{customerId:string;readOnly?:boolean;displayOnly?:boolean}) {
  const ctx=useContext(Context);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[pending,setPending]=useState(false);
  const host=useRef<HTMLSpanElement>(null);
  const dialog=useRef<HTMLSpanElement>(null);
  const [position,setPosition]=useState({left:0,top:0});
  const register=ctx?.snapshot.enabled ? ctx.register : undefined;
  useEffect(()=>register?.(customerId),[customerId,register]);
  useEffect(()=>{
    if(!open)return;
    const close=(e:PointerEvent)=>{if(!host.current?.contains(e.target as Node)&&!dialog.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();setOpen(false);}};
    const dismiss=(e:Event)=>{if(e.target instanceof Node&&dialog.current?.contains(e.target))return;setOpen(false);};
    window.addEventListener("resize",dismiss);window.addEventListener("scroll",dismiss,true);
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);
    return ()=>{window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};
  },[open]);
  if(!ctx || !ctx.snapshot.enabled || !(customerId in ctx.snapshot.assignments))return null;
  const {snapshot,update}=ctx;
  const selected=snapshot.assignments[customerId]??[];
  const categories=[...snapshot.categories].sort((a,b)=>a.position-b.position||a.number-b.number);
  const labels=categories.flatMap(category=>snapshot.labels.filter(label=>label.categoryId===category.id));
  const chosen=labels.filter(l=>selected.includes(l.id));
  const canEdit=snapshot.canEdit&&!readOnly;
  async function toggle(id:string) {
    if(pending||!canEdit||!ctx?.lock(customerId))return;
    const add=!selected.includes(id),old=selected;
    setPending(true);update(customerId,add?[...old,id]:old.filter(x=>x!==id));
    try {const result=await setCustomerLabel({customerId,labelId:id,selected:add});if(!result.success){update(customerId,old);toast.error(result.error??"儲存失敗，已還原");}}
    catch {update(customerId,old);toast.error("儲存失敗，已還原");}
    finally {setPending(false);ctx?.unlock(customerId);}
  }
  return <span ref={host} className="relative inline-flex flex-wrap items-center gap-1" onClick={e=>e.stopPropagation()}>
    {chosen.slice(0,2).map(l=><span key={l.id} className={`rounded border px-1.5 py-0.5 text-[11px] ${labelColor(categories.find(c=>c.id===l.categoryId)?.number??1)}`}>{l.name}</span>)}
    {!displayOnly&&(canEdit||chosen.length>2)&&<button type="button" aria-label="查看或修改顧客標籤" aria-expanded={open} onClick={()=>{const rect=host.current?.getBoundingClientRect();if(rect)setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-264)),top:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-360))});setOpen(!open);}} className="min-h-10 shrink-0 whitespace-nowrap rounded px-2 text-xs text-primary-700 hover:bg-primary-50">{chosen.length>2?`＋${chosen.length-2}`:"＋標籤"}</button>}
    {!displayOnly&&!canEdit&&<span className="sr-only">標籤僅供查看</span>}
    {displayOnly&&chosen.length>2&&<span className="text-xs text-earth-500" title={chosen.map(l=>l.name).join("、")}>＋{chosen.length-2}</span>}
    {open&&createPortal(<span ref={dialog} onClick={e=>e.stopPropagation()} style={position} role="dialog" aria-label="顧客標籤" className="fixed z-[200] block max-h-[calc(100dvh-1rem)] w-64 overflow-y-auto overscroll-contain rounded-xl border border-earth-200 bg-white p-3 text-left shadow-lg">
      <input aria-label="搜尋標籤" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋標籤" className="mb-2 h-10 w-full rounded border px-2 text-sm" />
      <span className="block max-h-64 overflow-auto">
        {categories.map(c=>{const items=labels.filter(l=>l.categoryId===c.id&&(selected.includes(l.id)||(l.active&&c.active))&&l.name.includes(query));return items.length?<span key={c.id} className="mb-3 block"><span className="mb-1 block text-xs text-earth-500">{c.name}{!c.active?"（已停用）":""}</span><span className="flex flex-wrap gap-1">{items.map(l=><button key={l.id} type="button" aria-pressed={selected.includes(l.id)} disabled={!canEdit||pending||ctx.pendingIds.has(customerId)} onClick={()=>void toggle(l.id)} className={`min-h-9 rounded border px-2 text-xs ${labelColor(c.number)} ${selected.includes(l.id)?"ring-2 ring-primary-600":""}`}>{selected.includes(l.id)?"✓ ":""}{l.name}{!l.active?"（停用）":""}</button>)}</span></span>:null;})}
        {!labels.length&&<span className="text-xs text-earth-500">尚無標籤，請店長至設定新增。</span>}
      </span>
      <button type="button" onClick={()=>setOpen(false)} className="mt-2 min-h-9 w-full rounded border text-xs">關閉</button>
    </span>,document.body)}
  </span>;
}

export function CustomerLabelFilter() {
  const ctx=useContext(Context), params=useSearchParams(), router=useRouter(), pathname=usePathname();
  if(!ctx?.snapshot.enabled)return null;
  return <select aria-label="依顧客標籤篩選" value={params.get("label")??""} className="min-h-10 rounded border border-earth-200 bg-white px-2 text-sm" onChange={e=>{const next=new URLSearchParams(params.toString());next.delete("page");if(e.target.value)next.set("label",e.target.value);else next.delete("label");router.replace(`${pathname}?${next}`,{scroll:false});}}><option value="">全部標籤</option>{ctx.snapshot.categories.map(c=><optgroup key={c.id} label={c.name}>{ctx.snapshot.labels.filter(l=>l.categoryId===c.id).map(l=><option key={l.id} value={l.id}>{l.name}{!l.active?"（停用）":""}</option>)}</optgroup>)}</select>;
}
