"use client";
import { useRef, useState, useLayoutEffect, useEffect, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { manageCustomerLabels } from "@/server/actions/customer-labels";
import { labelColor, previewLabelManagement, type LabelManagementInput, type LabelSnapshot } from "@/lib/customer-labels";

const button = "min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-sm text-primary-700 disabled:opacity-40";
const field = "min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm";
type Editing = {kind:"category"|"label";id:string;name:string;categoryId?:string};
export function LabelManager({initial}:{initial:LabelSnapshot}) {
  const [data,setData]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [categoryName,setCategoryName]=useState("");
  const [expanded,setExpanded]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [adding,setAdding]=useState<string|null>(null);
  const [editing,setEditing]=useState<Editing|null>(null);
  const saving=useRef(false);
  type Drag = {pointerId:number;kind:"category"|"label";id:string;categoryId?:string;ids:string[];order:string[];x:number;y:number;offsetX:number;offsetY:number;width:number;height:number};
  const drag=useRef<Drag|null>(null);
  const [dragView,setDragView]=useState<Drag|null>(null);
  const manager=useRef<HTMLDivElement>(null);
  const previousRects=useRef(new Map<HTMLElement,DOMRect>());
  const animations=useRef(new Map<HTMLElement,Animation>());
  const dragInput=(current:Drag):LabelManagementInput=>current.kind==="category"?{action:"order",ids:current.order}:{action:"label-order",categoryId:current.categoryId!,ids:current.order};
  const displayData=dragView?previewLabelManagement(data,dragInput(dragView)):data;
  function reorder(kind:"category"|"label",ids:string[],from:string,to:string,categoryId?:string) {
    if(from===to||!ids.includes(to))return;
    const ordered=[...ids],fromIndex=ordered.indexOf(from),toIndex=ordered.indexOf(to);
    ordered.splice(fromIndex,1);ordered.splice(toIndex,0,from);
    void save(kind==="category"?{action:"order",ids:ordered}:{action:"label-order",categoryId:categoryId!,ids:ordered},"已更新排序");
  }
  function finishDrag(commit=false) {
    const current=drag.current;drag.current=null;setDragView(null);previousRects.current.clear();
    for(const animation of animations.current.values())animation.cancel();animations.current.clear();
    if(current&&commit&&current.order.some((id,index)=>id!==current.ids[index]))void save(dragInput(current),"已更新排序");
  }
  const finishDragRef=useRef(finishDrag);
  useLayoutEffect(()=>{finishDragRef.current=finishDrag;});
  useEffect(()=>{
    const activeAnimations=animations.current;
    const cancel=(e:KeyboardEvent)=>{if(e.key==="Escape"&&drag.current){e.preventDefault();e.stopPropagation();finishDragRef.current();}};
    document.addEventListener("keydown",cancel,true);
    return()=>{document.removeEventListener("keydown",cancel,true);for(const animation of activeAnimations.values())animation.cancel();};
  },[]);
  useLayoutEffect(()=>{
    if(!dragView)return;
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for(const [element,before] of previousRects.current){
      if(!element.isConnected||element.dataset.sortId===dragView.id)continue;
      animations.current.get(element)?.cancel();
      const after=element.getBoundingClientRect(),dx=before.left-after.left,dy=before.top-after.top;
      if(!reduced&&element.animate&&(dx||dy))animations.current.set(element,element.animate([{transform:`translate(${dx}px, ${dy}px)`},{transform:"translate(0, 0)"}],{duration:180,easing:"ease-out"}));
    }
    previousRects.current.clear();
  },[dragView]);
  function move(e:PointerEvent<HTMLDivElement>) {
      const current=drag.current;if(!current||e.pointerId!==current.pointerId)return;
      const {kind,categoryId}=current;
      current.x=e.clientX;current.y=e.clientY;
      const element=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>(`[data-sort-kind="${kind}"]`);
      const target=element?.dataset.sortId;
      if(target&&target!==current.id&&manager.current?.contains(element!)&&current.ids.includes(target)&&element?.dataset.sortCategory===(categoryId??"")){
        previousRects.current.clear();
        for(const item of manager.current.querySelectorAll<HTMLElement>(`[data-sort-kind="${kind}"]`)){
          if(current.ids.includes(item.dataset.sortId??"")&&item.dataset.sortCategory===(categoryId??""))previousRects.current.set(item,item.getBoundingClientRect());
        }
        const order=[...current.order],from=order.indexOf(current.id),to=order.indexOf(target);
        order.splice(from,1);order.splice(to,0,current.id);current.order=order;
      }
      setDragView({...current});
    }
  function handle(kind:"category"|"label",id:string,name:string,ids:string[],categoryId?:string) {
    return <button type="button" aria-label={`拖拉排序${name}`} title="拖拉排序；鍵盤方向鍵移動" disabled={pending} className={`${button} min-w-11 touch-none cursor-grab px-2 active:cursor-grabbing`} onPointerDown={e=>{
      if(e.button!==0||saving.current||drag.current)return;
      const item=e.currentTarget.closest<HTMLElement>(`[data-sort-kind="${kind}"]`);if(!item)return;
      const rect=item.getBoundingClientRect();e.preventDefault();(manager.current?.setPointerCapture?manager.current:e.currentTarget).setPointerCapture(e.pointerId);
      drag.current={pointerId:e.pointerId,kind,id,categoryId,ids,order:[...ids],x:e.clientX,y:e.clientY,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,width:rect.width,height:rect.height};setDragView({...drag.current});
    }} onKeyDown={e=>{
      const offset=e.key==="ArrowUp"||e.key==="ArrowLeft"?-1:e.key==="ArrowDown"||e.key==="ArrowRight"?1:0;
      if(!offset||saving.current||drag.current)return;e.preventDefault();const target=ids[ids.indexOf(id)+offset];if(target)reorder(kind,ids,id,target,categoryId);
    }}>⠿</button>;
  }
  async function save(input:LabelManagementInput,success:string) {
    if(saving.current||drag.current||!data.canManage)return false;
    saving.current=true;
    const previous=data;
    setData(previewLabelManagement(previous,input));
    setPending(true);setError("");setMessage("");
    try {
      const result=await manageCustomerLabels(input);
      if(!result.success||!("metadata" in result)){setData(previous);setError(!result.success?result.error??"儲存失敗":"儲存失敗");return false;}
      setData({...previous,...result.metadata});
      setMessage(success);toast.success(success);
      window.dispatchEvent(new CustomEvent("customer-labels:refresh",{detail:{...result.metadata,restoreAssignments:input.action==="enable"&&input.enabled}}));
      return true;
    } catch {setData(previous);setError("儲存失敗，請重試");return false;}
    finally {saving.current=false;setPending(false);}
  }
  const categories=[...displayData.categories].sort((a,b)=>a.position-b.position||a.number-b.number);
  const activeCategories=categories.filter(c=>c.active);
  const disabled=pending||!!dragView||!data.canManage;
  const inactiveCount=data.labels.filter(l=>!l.active||!categories.find(c=>c.id===l.categoryId)?.active).length;
  function editor(target:Editing) {
    if(!editing||editing.kind!==target.kind||editing.id!==target.id)return null;
    return <form aria-label={`編輯${target.name}`} className="mt-2 grid min-w-0 gap-2 rounded-lg bg-earth-50 p-3 sm:grid-cols-2" onSubmit={async e=>{
      e.preventDefault();
      if(await save(editing.kind==="category"?{action:"category",id:editing.id,name:editing.name}:{action:"label",id:editing.id,name:editing.name,categoryId:editing.categoryId??""},"已儲存"))setEditing(null);
    }}>
      <label className="space-y-1"><span>名稱</span><input aria-label="修改名稱" maxLength={8} required disabled={pending} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} className={field}/></label>
      {editing.kind==="label"&&<label className="space-y-1"><span>所屬分類</span><select aria-label="修改所屬分類" disabled={pending} value={editing.categoryId} onChange={e=>setEditing({...editing,categoryId:e.target.value})} className={field}>{categories.filter(c=>c.active||c.id===editing.categoryId).map(c=><option key={c.id} value={c.id}>{c.name} · {String(c.number).padStart(2,"0")}{!c.active?"（已停用）":""}</option>)}</select></label>}
      <div className="flex gap-2 sm:col-span-2"><button disabled={pending} className={button}>{pending?"儲存中…":"儲存"}</button><button type="button" disabled={pending} className={button} onClick={()=>setEditing(null)}>取消</button></div>
    </form>;
  }
  function label(l:LabelSnapshot["labels"][number],c:LabelSnapshot["categories"][number],inactive=false,overlay=false) {
    const labelTarget:Editing={kind:"label",id:l.id,name:l.name,categoryId:l.categoryId};
    const labelIds=displayData.labels.filter(l=>l.categoryId===c.id).sort((a,b)=>(a.position??0)-(b.position??0)||a.name.localeCompare(b.name)).map(l=>l.id);
    return <div key={l.id} data-sort-kind={overlay?undefined:"label"} data-sort-id={overlay?undefined:l.id} data-sort-category={overlay?undefined:c.id} className={`${!overlay&&dragView?.kind==="label"&&dragView.id===l.id?"opacity-20 ring-2 ring-primary-500":""} min-w-0 rounded-lg border border-earth-100 p-1 ${editing?.id===l.id?"w-full":"max-w-full"}`}>
          <div className="flex flex-wrap items-center gap-2">
            {data.canManage&&!inactive&&handle("label",l.id,l.name,labelIds,c.id)}
            {data.canManage?<button type="button" disabled={pending} aria-label={`編輯${l.name}`} aria-expanded={editing?.id===l.id} onClick={()=>setEditing(labelTarget)} className={`min-h-11 max-w-full break-words rounded border px-3 text-left ${labelColor(c.number)}`}>{l.name}<span className="ml-2 text-xs">編輯</span></button>:<span className={`break-words rounded border px-3 py-2 ${labelColor(c.number)}`}>{l.name}</span>}
            {data.canManage&&<button type="button" disabled={pending} className={button} aria-label={`${l.active?"停用":"啟用"}${l.name}`} title="停用保留既有標記" onClick={()=>void save({action:"active",kind:"label",id:l.id,active:!l.active},l.active?"已停用，保留既有標記":"已啟用")}>{l.active?"停用":"啟用"}</button>}
          </div>
          {editor(labelTarget)}
        </div>;
  }
  function category(c:LabelSnapshot["categories"][number],inactive=false,overlay=false) {
    const items=displayData.labels.filter(l=>l.categoryId===c.id&&(inactive?(!c.active||!l.active):l.active)).sort((a,b)=>(a.position??0)-(b.position??0)||a.name.localeCompare(b.name));
    const target:Editing={kind:"category",id:c.id,name:c.name};
    const index=activeCategories.findIndex(x=>x.id===c.id);
    return <section key={c.id} aria-label={`${c.name}${inactive?"已停用項目":"分類"}`} data-sort-kind={overlay?undefined:"category"} data-sort-id={overlay?undefined:c.id} data-sort-category={overlay?undefined:""} className={`min-w-0 rounded-xl border border-earth-200 p-3 ${!overlay&&dragView?.kind==="category"&&dragView.id===c.id?"opacity-20 ring-2 ring-primary-500":""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`break-words rounded border px-2 py-1 font-medium ${labelColor(c.number)}`}>{c.name}<span className="ml-2 text-xs font-normal opacity-60">{String(c.number).padStart(2,"0")}</span>{!c.active?"（已停用）":""}</span>
        {data.canManage&&(!inactive||!c.active)&&<div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} className={button} onClick={()=>setEditing(target)}>改名</button>
          <button type="button" disabled={pending} title="停用保留既有標記" className={button} onClick={()=>void save({action:"active",kind:"category",id:c.id,active:!c.active},c.active?"已停用，保留既有標記":"已啟用")}>{c.active?"停用":"啟用"}</button>
          {!inactive&&handle("category",c.id,c.name,categories.map(x=>x.id))}
          {!inactive&&[-1,1].map(offset=><button type="button" key={offset} className={`${button} min-w-11 px-2`} disabled={pending||index+offset<0||index+offset>=activeCategories.length} aria-label={`${c.name}${offset<0?"上移":"下移"}`} onClick={()=>{const ids=categories.map(x=>x.id),from=ids.indexOf(c.id),to=ids.indexOf(activeCategories[index+offset].id);[ids[from],ids[to]]=[ids[to],ids[from]];void save({action:"order",ids},"已更新排序");}}>{offset<0?"↑":"↓"}</button>)}
        </div>}
      </div>
      {(!inactive||!c.active)&&editor(target)}
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {items.map(l=>label(l,c,inactive,overlay))}
        {!inactive&&data.canManage&&(adding===c.id?<form aria-label={`在${c.name}新增標籤`} className="flex w-full min-w-0 flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();if(await save({action:"label",categoryId:c.id,name:drafts[c.id]??""},"已新增標籤"))setDrafts(old=>({...old,[c.id]:""}));}}><input aria-label={`${c.name}的新標籤名稱`} className={`${field} flex-1 basis-40`} maxLength={8} required disabled={pending} value={drafts[c.id]??""} onChange={e=>setDrafts(old=>({...old,[c.id]:e.target.value}))} placeholder="標籤名稱（最多8字）"/><button disabled={pending} className={button}>{pending?"儲存中…":"新增"}</button><button type="button" disabled={pending} className={button} onClick={()=>setAdding(null)}>取消</button></form>:<button type="button" disabled={pending} className={button} onClick={()=>setAdding(c.id)}>＋標籤</button>)}
      </div>
    </section>;
  }
  return <div ref={manager} onPointerMove={move} onPointerUp={e=>{if(e.pointerId===drag.current?.pointerId)finishDrag(true);}} onPointerCancel={e=>{if(e.pointerId===drag.current?.pointerId)finishDrag();}} onLostPointerCapture={()=>{if(drag.current)finishDrag();}} className="space-y-3 text-sm" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-2">
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={data.enabled} disabled={disabled} onChange={e=>{const enabled=e.target.checked;void save({action:"enable",enabled},enabled?"已啟用顧客標籤":"已關閉，保留標籤資料");}}/>啟用顧客標籤</label>
    <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-earth-500">{data.enabled?`${activeCategories.length} 個分類 · ${data.labels.filter(l=>l.active&&activeCategories.some(c=>c.id===l.categoryId)).length} 個標籤`:"已關閉，資料保留"}</span><button type="button" className={button} aria-expanded={expanded} disabled={pending} onClick={()=>setExpanded(!expanded)}>{expanded?"收合管理":"管理標籤"}</button></div>
    </div>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    <p role="status" aria-live="polite" className="text-primary-700">{pending?"儲存中…":message}</p>
    <div hidden={!expanded} className="space-y-3">
    <p className="text-xs text-earth-500">拖拉 ⠿ 可調整分類與分類內標籤順序，放開後自動儲存；也可用方向鍵移動。排序不換色，停用保留原有標記。</p>
    {data.canManage&&<form className="flex min-w-0 flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();if(await save({action:"category",name:categoryName},"已新增分類"))setCategoryName("");}}><input aria-label="新增分類名稱" maxLength={8} required disabled={pending} value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="分類名稱（最多8字）" className={`${field} flex-1 basis-40`}/><button disabled={pending} className={button}>{pending?"儲存中…":"新增分類"}</button></form>}
    <div className="grid gap-3 xl:grid-cols-2">{activeCategories.map(c=>category(c))}</div>
    {!categories.length&&<p className="text-earth-500">先新增分類，再在分類內新增標籤。</p>}
    {(inactiveCount>0||categories.some(c=>!c.active))&&<details className="rounded-xl border border-earth-200 p-3"><summary className="min-h-11 cursor-pointer py-2 text-earth-600">已停用 · {categories.filter(c=>!c.active).length} 個分類／{inactiveCount} 個標籤</summary><div className="mt-2 space-y-3">{categories.filter(c=>!c.active||data.labels.some(l=>l.categoryId===c.id&&!l.active)).map(c=>category(c,true))}</div></details>}
    </div>
    {dragView&&createPortal(<div data-label-drag-overlay aria-hidden="true" inert className="pointer-events-none fixed z-[250] rounded-xl bg-white text-sm shadow-xl ring-2 ring-primary-500" style={{left:dragView.x-dragView.offsetX,top:dragView.y-dragView.offsetY,width:dragView.width,height:dragView.height}}>
      {dragView.kind==="category"?category(displayData.categories.find(c=>c.id===dragView.id)!,false,true):label(displayData.labels.find(l=>l.id===dragView.id)!,displayData.categories.find(c=>c.id===dragView.categoryId)!,false,true)}
    </div>,document.body)}
  </div>;
}
