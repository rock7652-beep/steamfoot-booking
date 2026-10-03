"use client";

import { FeatureEntry, useFeaturePresentation } from "@/components/feature-presentation";
import { FEATURES } from "@/lib/feature-flags";
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { loadCustomerLabels, setCustomerLabel } from "@/server/actions/customer-labels";
import { EMPTY_LABELS, labelColor, nextCustomerLabelRevision, newerLabelSnapshot, type LabelMetadata, type LabelSnapshot } from "@/lib/customer-labels";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { courseSettingsPanelHref } from "@/lib/course-settings-panels";
import { LabelManager } from "@/app/(dashboard)/dashboard/settings/customer-labels/label-manager";
import { DashboardLink } from "@/components/dashboard-link";
type ContextValue = {snapshot: LabelSnapshot; register:(id:string)=>()=>void; refresh:()=>Promise<void>; seed:(snapshot:LabelSnapshot)=>void; update:(id:string,labels:string[])=>void; pendingIds: Set<string>; lock:(id:string)=>boolean; unlock:(id:string)=>void};
const Context = createContext<ContextValue|null>(null);
const LABEL_CACHE_MS = 60_000;
export function CustomerLabelsProvider({children,initial=EMPTY_LABELS}:{children:ReactNode;initial?:LabelSnapshot}) {
  const [snapshot,setSnapshot]=useState(initial);
  const lastInitial=useRef(initial);
  const [pendingIds,setPendingIds]=useState(new Set<string>());
  const pendingRef=useRef(new Set<string>());
  const ids=useRef(new Map<string,number>());
  const loaded=useRef(new Map(Object.keys(initial.assignments).map(id=>[id,Date.now()])));
  const seedRevisions=useRef(new Map(Object.keys(initial.assignments).map(id=>[id,initial.clientRevision??0])));
  const metadataRevision=useRef(0);
  const revisions=useRef(new Map<string,number>());
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const inFlight=useRef<Promise<void>|null>(null);
  const queued=useRef(false);
  const mounted=useRef(true);
  const fetchLabels=useCallback((force=false):Promise<void>=>{
    if(force){loaded.current.clear();queued.current=true;}
    if(pendingRef.current.size)return Promise.resolve();
    if(inFlight.current){queued.current=true;return inFlight.current;}
    const requested=[...ids.current.keys()].filter(id=>Date.now()-(loaded.current.get(id)??0)>=LABEL_CACHE_MS);
    if(!requested.length&&!force)return Promise.resolve();
    const clientRevision=nextCustomerLabelRevision();
    const metadataVersion=metadataRevision.current;
    const versions=new Map(requested.map(id=>[id,revisions.current.get(id)??0]));
    queued.current=false;
    const run=(async()=>{
      try {
        const batches=await Promise.all(Array.from({length:Math.max(1,Math.ceil(requested.length/500))},(_,i)=>initial.storeId?loadCustomerLabels(requested.slice(i*500,(i+1)*500),initial.storeId):loadCustomerLabels(requested.slice(i*500,(i+1)*500))));
        if(!mounted.current)return;
        const result={...batches[0],clientRevision,assignments:Object.assign({},...batches.map(batch=>batch.assignments))};
        setSnapshot(old=>{
          if(metadataRevision.current!==metadataVersion)return old;
          const metadata=newerLabelSnapshot(old,result)?old:result;
          if(!metadata.enabled)return {...metadata,assignments:{}};
          const assignments={...old.assignments};
          for(const id of requested){
            if(pendingRef.current.has(id)||(revisions.current.get(id)??0)!==versions.get(id))continue;
            loaded.current.set(id,Date.now());seedRevisions.current.set(id,clientRevision);
            delete assignments[id];
            if(id in result.assignments)assignments[id]=result.assignments[id];
          }
          return {...metadata,assignments};
        });
      } catch {if(mounted.current)toast.error("標籤讀取失敗，請重新整理");}
      finally {
        inFlight.current=null;
        if(queued.current&&mounted.current){queued.current=false;timer.current=setTimeout(()=>void fetchLabels(),0);}
      }
    })();
    inFlight.current=run;
    return run;
  },[initial.storeId]);
  const refresh=useCallback(()=>fetchLabels(true),[fetchLabels]);
  useEffect(()=>{
    if(lastInitial.current===initial)return;
    lastInitial.current=initial;
    setSnapshot(old=>({...initial,assignments:initial.enabled?{...old.assignments,...initial.assignments}:{}}));
    if(!initial.enabled)loaded.current.clear();
  },[initial]);
  const seed=useCallback((data:LabelSnapshot)=>{
    setSnapshot(old=>{
      const newer=newerLabelSnapshot(old,data);
      const accepted=Object.fromEntries(Object.entries(data.assignments).filter(([id])=>!pendingRef.current.has(id)&&(seedRevisions.current.get(id)??0)<=(data.clientRevision??0)&&!(newer&&id in old.assignments)));
      for(const id of Object.keys(accepted)){loaded.current.set(id,Date.now());seedRevisions.current.set(id,data.clientRevision??0);revisions.current.set(id,(revisions.current.get(id)??0)+1);}
      const metadata=newer?old:data;
      return {...metadata,assignments:metadata.enabled?{...old.assignments,...accepted}:{}};
    });
  },[]);
  useEffect(()=>{
    const changed=(event:Event)=>{
      const metadata=(event as CustomEvent<(LabelMetadata & {restoreAssignments?:boolean})|undefined>).detail;
      if(!metadata){void refresh();return;}
      metadataRevision.current++;
      setSnapshot(old=>({...old,...metadata,clientRevision:nextCustomerLabelRevision(),assignments:metadata.enabled?old.assignments:{}}));
      // Enabling restores the saved assignments that were hidden while disabled.
      if(metadata.enabled && metadata.restoreAssignments){loaded.current.clear();void fetchLabels();}
    };
    const focus=()=>void fetchLabels();
    window.addEventListener("customer-labels:refresh",changed);window.addEventListener("focus",focus);
    return()=>{window.removeEventListener("customer-labels:refresh",changed);window.removeEventListener("focus",focus);};
  },[refresh,fetchLabels]);
  const register=useCallback((id:string)=>{
    ids.current.set(id,(ids.current.get(id)??0)+1);
    if(Date.now()-(loaded.current.get(id)??0)>=LABEL_CACHE_MS){
      if(timer.current)clearTimeout(timer.current);
      timer.current=setTimeout(()=>void fetchLabels(),30);
    }
    return ()=>{const count=(ids.current.get(id)??1)-1;if(count)ids.current.set(id,count);else ids.current.delete(id);};
  },[fetchLabels]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
  const update=useCallback((id:string,labels:string[])=>{
    const clientRevision=nextCustomerLabelRevision();
    seedRevisions.current.set(id,clientRevision);revisions.current.set(id,(revisions.current.get(id)??0)+1);loaded.current.set(id,Date.now());
    setSnapshot(old=>({...old,clientRevision,assignments:{...old.assignments,[id]:labels}}));
  },[]);
  const lock=useCallback((id:string)=>{if(pendingRef.current.has(id))return false;pendingRef.current.add(id);setPendingIds(new Set(pendingRef.current));return true;},[]);
  const unlock=useCallback((id:string)=>{pendingRef.current.delete(id);setPendingIds(new Set(pendingRef.current));if(!pendingRef.current.size)void fetchLabels();},[fetchLabels]);
  return <Context.Provider value={{snapshot,register,refresh,seed,update,pendingIds,lock,unlock}}>{children}</Context.Provider>;
}
/** Supply row labels with the server-rendered list, then retain them across shared views. */
export function useSeedCustomerLabels() { return useContext(Context)?.seed; }
export function CustomerLabelsSeed({initial,children}:{initial:LabelSnapshot;children:ReactNode}) {
  const ctx=useContext(Context);
  const seed=ctx?.snapshot.storeId===initial.storeId?ctx?.seed:undefined;
  const [seeded,setSeeded]=useState<LabelSnapshot|null>(null);
  // Hydrate server row assignments into the shared layout once; keep the first SSR render complete.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{seed?.(initial);setSeeded(initial);},[seed,initial]);
  if(!ctx||ctx.snapshot.storeId!==initial.storeId)return <CustomerLabelsProvider initial={initial}>{children}</CustomerLabelsProvider>;
  const metadata=newerLabelSnapshot(ctx.snapshot,initial)?ctx.snapshot:initial;
  const assignments=Object.fromEntries(Object.entries(initial.assignments).filter(([id])=>!ctx.pendingIds.has(id)&&!(newerLabelSnapshot(ctx.snapshot,initial)&&id in ctx.snapshot.assignments)));
  return <Context.Provider value={{...ctx,snapshot:seeded===initial?ctx.snapshot:{...metadata,assignments:metadata.enabled?{...ctx.snapshot.assignments,...assignments}:{}}}}>{children}</Context.Provider>;
}
export function CustomerLabelsSettings() {
  return <FeatureEntry feature={FEATURES.CUSTOMER_LABELS} label="顧客標籤"><CustomerLabelsSettingsContent /></FeatureEntry>;
}
function CustomerLabelsSettingsContent() {
  const ctx=useContext(Context);
  if(!ctx?.snapshot.available)return null;
  return <section aria-label="顧客標籤設定" className="min-w-0 border-b border-earth-100 py-5">
    <h3 className="font-medium text-primary-900">顧客標籤</h3>
    <p className="mt-1 mb-3 text-sm text-earth-600">同一家店的各模組共用；在顧客與預約名單快速加上標籤。</p>
    <LabelManager initial={ctx.snapshot}/>
  </section>;
}
export function CustomerLabelsSettingsLink() {
  const ctx=useContext(Context),pathname=usePathname();
  const state=useFeaturePresentation(FEATURES.CUSTOMER_LABELS);
  if(state === "HIDDEN" || state === "LOCKED")return null;
  if(!ctx?.snapshot.available)return null;
  return <DashboardLink href={pathname.includes("/courses")?courseSettingsPanelHref("/dashboard/settings/customer-labels"):"/dashboard/settings?section=notifications"} className="inline-flex min-h-11 min-w-32 items-center justify-center rounded-lg border border-earth-200 bg-white px-3 text-sm font-medium text-primary-700 hover:bg-primary-50">顧客標籤設定</DashboardLink>;
}
export function CustomerLabels({customerId,readOnly=false,displayOnly=false,hideEmpty=false,maxVisible=2,variant="dots"}:{customerId:string;readOnly?:boolean;displayOnly?:boolean;hideEmpty?:boolean;maxVisible?:number;variant?:"badge"|"dots"}) {
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
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();setOpen(false);}};
    const dismiss=(e:Event)=>{if(e.target instanceof Node&&dialog.current?.contains(e.target))return;setOpen(false);};
    window.addEventListener("resize",dismiss);window.addEventListener("scroll",dismiss,true);
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape,true);
    return ()=>{window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape,true);};
  },[open]);
  if(!ctx || !ctx.snapshot.enabled)return null;
  if(!(customerId in ctx.snapshot.assignments))return <span role="status" aria-label="標籤載入中" className="inline-block h-3 w-16 animate-pulse rounded bg-earth-100"/>;
  const {snapshot,update}=ctx;
  const selected=snapshot.assignments[customerId]??[];
  const categories=[...snapshot.categories].sort((a,b)=>a.position-b.position||a.number-b.number);
  const labels=categories.flatMap(category=>snapshot.labels.filter(label=>label.categoryId===category.id));
  const chosen=labels.filter(l=>selected.includes(l.id));
  const canEdit=snapshot.canEdit&&!readOnly;
  if(hideEmpty && !chosen.length)return null;
  async function toggle(id:string) {
    if(pending||!canEdit||!ctx?.lock(customerId))return;
    const add=!selected.includes(id),old=selected;
    setPending(true);update(customerId,add?[...old,id]:old.filter(x=>x!==id));
    try {const result=await setCustomerLabel({customerId,labelId:id,selected:add});if(!result.success){update(customerId,old);toast.error(result.error??"儲存失敗，已還原");}}
    catch {update(customerId,old);toast.error("儲存失敗，已還原");}
    finally {setPending(false);ctx?.unlock(customerId);}
  }
  return <span ref={host} className={`relative z-20 ${maxVisible > 2 ? "flex w-full min-w-0" : "inline-flex max-w-full flex-wrap"} items-center gap-1`} onClick={e=>e.stopPropagation()}>
    {variant === "dots" ? (chosen.length > 0 || canEdit && !displayOnly) && <button type="button" aria-label="查看或修改顧客標籤" aria-expanded={open} disabled={displayOnly} onClick={()=>{const rect=host.current?.getBoundingClientRect();if(rect)setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-264)),top:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-360))});setOpen(!open);}} className={`inline-flex min-h-5 ${maxVisible > 2 ? "w-full min-w-0" : "max-w-full flex-wrap"} items-center gap-x-3 gap-y-1 text-left text-sm focus-visible:outline-2 focus-visible:outline-primary-600`}>{chosen.length > 0 && <ResponsiveDotLabels labels={chosen.map(l=>({id:l.id,name:l.name,color:["bg-orange-500","bg-blue-500","bg-purple-500","bg-teal-500","bg-pink-500","bg-indigo-500","bg-amber-500","bg-slate-500"][((categories.find(c=>c.id===l.categoryId)?.number??1)-1)%8]}))} maxVisible={maxVisible}/>}{!chosen.length&&canEdit&&!displayOnly&&<span className="shrink-0 whitespace-nowrap text-primary-700">＋標籤</span>}</button> : <>
    {chosen.slice(0,2).map(l=><span key={l.id} className={`rounded border px-1.5 py-0.5 text-[11px] ${labelColor(categories.find(c=>c.id===l.categoryId)?.number??1)}`}>{l.name}</span>)}
    {!displayOnly&&chosen.length>2&&<span className="text-xs text-earth-500" title={chosen.map(l=>l.name).join("、")}>＋{chosen.length-2}</span>}
    {!displayOnly&&(canEdit||chosen.length>2)&&<button type="button" aria-label="查看或修改顧客標籤" aria-expanded={open} onClick={()=>{const rect=host.current?.getBoundingClientRect();if(rect)setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-264)),top:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-360))});setOpen(!open);}} className="min-h-10 shrink-0 whitespace-nowrap rounded px-2 text-xs text-primary-700 hover:bg-primary-50">{canEdit?"＋標籤":"查看標籤"}</button>}
    {!displayOnly&&!canEdit&&<span className="sr-only">標籤僅供查看</span>}
    {displayOnly&&chosen.length>2&&<span className="text-xs text-earth-500" title={chosen.map(l=>l.name).join("、")}>＋{chosen.length-2}</span>}
    </>}
    {open&&createPortal(<span ref={dialog} onClick={e=>e.stopPropagation()} style={position} role="dialog" aria-label="顧客標籤" className="fixed z-[200] block max-h-[calc(100dvh-1rem)] w-64 overflow-y-auto overscroll-contain rounded-xl border border-earth-200 bg-white p-3 text-left shadow-lg">
      <input aria-label="搜尋標籤" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋標籤" className="mb-2 h-10 w-full rounded border px-2 text-sm" />
      <span className="block max-h-64 overflow-auto">
        {categories.map(c=>{const items=labels.filter(l=>l.categoryId===c.id&&(selected.includes(l.id)||(l.active&&c.active))&&l.name.includes(query));return items.length?<span key={c.id} className="mb-3 block"><span className="mb-1 block text-xs text-earth-500">{c.name}{!c.active?"（已停用）":""}</span><span className="flex flex-wrap gap-1">{items.map(l=><button key={l.id} type="button" aria-pressed={selected.includes(l.id)} disabled={!canEdit||pending||ctx.pendingIds.has(customerId)} onClick={()=>void toggle(l.id)} className={`min-h-9 rounded border px-2 text-xs ${labelColor(c.number)} ${selected.includes(l.id)?"ring-2 ring-primary-600":""}`}>{selected.includes(l.id)?"✓ ":""}{l.name}{!l.active?"（停用）":""}</button>)}</span></span>:null;})}
        {!labels.length&&<span className="text-xs text-earth-500">尚無標籤，請店長至設定新增。</span>}
      </span>
      <span role="status" aria-live="polite" className="block text-xs text-earth-500">{pending?"儲存中…":canEdit?"勾選加入，再點一次移除":"僅供查看"}</span>
      <button type="button" onClick={()=>setOpen(false)} className="mt-2 min-h-9 w-full rounded border text-xs">關閉</button>
    </span>,document.body)}
  </span>;
}

/** Measure text, including the overflow count, without wrapping the list row. */
function ResponsiveDotLabels({labels,maxVisible}:{labels:{id:string;name:string;color:string}[];maxVisible:number}) {
  const container=useRef<HTMLSpanElement>(null),measure=useRef<HTMLSpanElement>(null);
  const [fit,setFit]=useState(maxVisible);
  const signature=labels.map(label=>`${label.id}:${label.name}`).join("|");
  useEffect(()=>{
    if(maxVisible<=2)return;
    const update=()=>{
      const width=container.current?.getBoundingClientRect().width ?? 0;
      if(!width || !measure.current)return;
      const items=Array.from(measure.current.children) as HTMLElement[];
      let count=Math.min(maxVisible,labels.length);
      while(count>0){
        const textWidth=items.slice(0,count).reduce((sum,item)=>sum+item.getBoundingClientRect().width,0);
        const overflow=count<labels.length ? (items[items.length-1]?.getBoundingClientRect().width ?? 28)+12 : 0;
        if(textWidth+Math.max(0,count-1)*12+overflow<=width)break;
        count--;
      }
      setFit(count);
    };
    update();
    const observer=typeof ResizeObserver!=="undefined" ? new ResizeObserver(update) : null;
    if(container.current)observer?.observe(container.current);
    window.addEventListener("resize",update);
    void document.fonts?.ready.then(update);
    return()=>{observer?.disconnect();window.removeEventListener("resize",update);};
  },[signature,maxVisible,labels.length]);
  const limit=maxVisible>2 ? Math.min(fit,maxVisible) : maxVisible;
  const item=(label:typeof labels[number])=><span key={label.id} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${label.color}`} /><span className="text-earth-700">{label.name}</span></span>;
  return <span ref={container} className={`relative flex min-w-0 items-center gap-x-3 ${maxVisible>2 ? "w-full overflow-hidden whitespace-nowrap" : "flex-wrap"}`} title={labels.map(label=>label.name).join("、")}>
    {labels.slice(0,limit).map(item)}{labels.length>limit&&<span className="shrink-0 text-earth-500">＋{labels.length-limit}</span>}
    {maxVisible>2&&<span ref={measure} aria-hidden="true" className="pointer-events-none absolute invisible flex w-max gap-x-3">{labels.slice(0,maxVisible).map(item)}<span>＋{labels.length}</span></span>}
  </span>;
}

/** Register the whole visible workspace before filtering, including rows hidden by a label. */
export function useCustomerLabelSnapshot(customerIds: string[]) {
  const ctx = useContext(Context);
  const register = ctx?.snapshot.enabled ? ctx.register : undefined;
  const key = JSON.stringify([...new Set(customerIds)].sort());
  useEffect(() => {
    if (!register) return;
    const releases = (JSON.parse(key) as string[]).map(register);
    return () => releases.forEach(release => release());
  }, [register, key]);
  return ctx?.snapshot ?? EMPTY_LABELS;
}

export function CustomerLabelPicker({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  const ctx=useContext(Context);
  if(!ctx?.snapshot.enabled)return null;
  return <select aria-label="依顧客標籤篩選" value={value} className="min-h-11 rounded border border-earth-200 bg-white px-2 text-sm" onChange={e=>onChange(e.target.value)}><option value="">全部標籤</option>{ctx.snapshot.categories.map(c=><optgroup key={c.id} label={c.name}>{ctx.snapshot.labels.filter(l=>l.categoryId===c.id).map(l=><option key={l.id} value={l.id}>{l.name}{!l.active?"（停用）":""}</option>)}</optgroup>)}</select>;
}

export function CustomerLabelFilter() {
  const ctx=useContext(Context), params=useSearchParams(), router=useRouter(), pathname=usePathname();
  if(!ctx?.snapshot.enabled)return null;
  return <CustomerLabelPicker value={params.get("label")??""} onChange={value=>{const next=new URLSearchParams(params.toString());next.delete("page");if(value)next.set("label",value);else next.delete("label");router.replace(`${pathname}?${next}`,{scroll:false});}}/>;
}
