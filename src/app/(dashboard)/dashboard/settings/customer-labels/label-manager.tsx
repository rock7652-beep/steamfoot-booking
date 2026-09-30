"use client";
import { useState } from "react";
import { toast } from "sonner";
import { loadCustomerLabels, manageCustomerLabels } from "@/server/actions/customer-labels";
import { labelColor, type LabelSnapshot } from "@/lib/customer-labels";

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
  async function save(input:unknown,success:string) {
    if(pending)return false;
    setPending(true);setError("");setMessage("");
    try {
      const result=await manageCustomerLabels(input);
      if(!result.success){setError(result.error??"儲存失敗");return false;}
      setData(await loadCustomerLabels());
      setMessage(success);toast.success(success);window.dispatchEvent(new Event("customer-labels:refresh"));return true;
    } catch {setError("儲存失敗，請重試");return false;}
    finally {setPending(false);}
  }
  const categories=[...data.categories].sort((a,b)=>a.position-b.position||a.number-b.number);
  const activeCategories=categories.filter(c=>c.active);
  const disabled=pending||!data.canManage;
  const inactiveCount=data.labels.filter(l=>!l.active||!categories.find(c=>c.id===l.categoryId)?.active).length;
  function editor(target:Editing) {
    if(!editing||editing.kind!==target.kind||editing.id!==target.id)return null;
    return <form aria-label={`編輯${target.name}`} className="mt-2 grid min-w-0 gap-2 rounded-lg bg-earth-50 p-3 sm:grid-cols-2" onSubmit={async e=>{
      e.preventDefault();
      if(await save({action:editing.kind,id:editing.id,name:editing.name,...(editing.categoryId?{categoryId:editing.categoryId}:{})},"已儲存"))setEditing(null);
    }}>
      <label className="space-y-1"><span>名稱</span><input aria-label="修改名稱" maxLength={8} required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} className={field}/></label>
      {editing.kind==="label"&&<label className="space-y-1"><span>所屬分類</span><select aria-label="修改所屬分類" value={editing.categoryId} onChange={e=>setEditing({...editing,categoryId:e.target.value})} className={field}>{categories.filter(c=>c.active||c.id===editing.categoryId).map(c=><option key={c.id} value={c.id}>{c.name} · {String(c.number).padStart(2,"0")}{!c.active?"（已停用）":""}</option>)}</select></label>}
      <div className="flex gap-2 sm:col-span-2"><button disabled={pending} className={button}>{pending?"儲存中…":"儲存"}</button><button type="button" disabled={pending} className={button} onClick={()=>setEditing(null)}>取消</button></div>
    </form>;
  }
  function category(c:LabelSnapshot["categories"][number],inactive=false) {
    const items=data.labels.filter(l=>l.categoryId===c.id&&(inactive?(!c.active||!l.active):l.active));
    const target:Editing={kind:"category",id:c.id,name:c.name};
    const index=activeCategories.findIndex(x=>x.id===c.id);
    return <section key={c.id} aria-label={`${c.name}${inactive?"已停用項目":"分類"}`} className="min-w-0 rounded-xl border border-earth-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`break-words rounded border px-2 py-1 font-medium ${labelColor(c.number)}`}>{c.name}<span className="ml-2 text-xs font-normal opacity-60">{String(c.number).padStart(2,"0")}</span>{!c.active?"（已停用）":""}</span>
        {data.canManage&&(!inactive||!c.active)&&<div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} className={button} onClick={()=>setEditing(target)}>改名</button>
          <button type="button" disabled={pending} title="停用保留既有標記" className={button} onClick={()=>void save({action:"active",kind:"category",id:c.id,active:!c.active},c.active?"已停用，保留既有標記":"已啟用")}>{c.active?"停用":"啟用"}</button>
          {!inactive&&[-1,1].map(offset=><button type="button" key={offset} className={`${button} min-w-11 px-2`} disabled={pending||index+offset<0||index+offset>=activeCategories.length} aria-label={`${c.name}${offset<0?"上移":"下移"}`} onClick={()=>{const ids=categories.map(x=>x.id),from=ids.indexOf(c.id),to=ids.indexOf(activeCategories[index+offset].id);[ids[from],ids[to]]=[ids[to],ids[from]];void save({action:"order",ids},"已更新排序");}}>{offset<0?"↑":"↓"}</button>)}
        </div>}
      </div>
      {(!inactive||!c.active)&&editor(target)}
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {items.map(l=>{const labelTarget:Editing={kind:"label",id:l.id,name:l.name,categoryId:l.categoryId};return <div key={l.id} className={`min-w-0 rounded-lg border border-earth-100 p-1 ${editing?.id===l.id?"w-full":"max-w-full"}`}>
          <div className="flex flex-wrap items-center gap-2">
            {data.canManage?<button type="button" disabled={pending} aria-label={`編輯${l.name}`} aria-expanded={editing?.id===l.id} onClick={()=>setEditing(labelTarget)} className={`min-h-11 max-w-full break-words rounded border px-3 text-left ${labelColor(c.number)}`}>{l.name}<span className="ml-2 text-xs">編輯</span></button>:<span className={`break-words rounded border px-3 py-2 ${labelColor(c.number)}`}>{l.name}</span>}
            {data.canManage&&<button type="button" disabled={pending} className={button} aria-label={`${l.active?"停用":"啟用"}${l.name}`} title="停用保留既有標記" onClick={()=>void save({action:"active",kind:"label",id:l.id,active:!l.active},l.active?"已停用，保留既有標記":"已啟用")}>{l.active?"停用":"啟用"}</button>}
          </div>
          {editor(labelTarget)}
        </div>;})}
        {!inactive&&data.canManage&&(adding===c.id?<form aria-label={`在${c.name}新增標籤`} className="flex w-full min-w-0 flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();if(await save({action:"label",categoryId:c.id,name:drafts[c.id]??""},"已新增標籤"))setDrafts(old=>({...old,[c.id]:""}));}}><input aria-label={`${c.name}的新標籤名稱`} className={`${field} flex-1 basis-40`} maxLength={8} required value={drafts[c.id]??""} onChange={e=>setDrafts(old=>({...old,[c.id]:e.target.value}))} placeholder="標籤名稱（最多8字）"/><button disabled={pending} className={button}>新增</button><button type="button" disabled={pending} className={button} onClick={()=>setAdding(null)}>取消</button></form>:<button type="button" disabled={pending} className={button} onClick={()=>setAdding(c.id)}>＋標籤</button>)}
      </div>
    </section>;
  }
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={data.enabled} disabled={disabled} onChange={e=>{const enabled=e.target.checked;if(!enabled)setExpanded(false);void save({action:"enable",enabled},enabled?"已啟用顧客標籤":"已關閉，保留標籤資料");}}/>啟用顧客標籤</label>
    <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-earth-500">{data.enabled?`${activeCategories.length} 個分類 · ${data.labels.filter(l=>l.active&&activeCategories.some(c=>c.id===l.categoryId)).length} 個標籤`:"已關閉，資料保留"}</span><button type="button" className={button} aria-expanded={expanded} disabled={pending} onClick={()=>setExpanded(!expanded)}>{expanded?"收合管理":"管理標籤"}</button></div>
    </div>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    <p role="status" aria-live="polite" className="text-primary-700">{message}</p>
    <div hidden={!expanded} className="space-y-3">
    <p className="text-xs text-earth-500">分類自動配色；改名、排序不換色。停用保留顧客原有標記。</p>
    {data.canManage&&<form className="flex min-w-0 flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();if(await save({action:"category",name:categoryName},"已新增分類"))setCategoryName("");}}><input aria-label="新增分類名稱" maxLength={8} required value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="分類名稱（最多8字）" className={`${field} flex-1 basis-40`}/><button disabled={pending} className={button}>新增分類</button></form>}
    <div className="grid gap-3 xl:grid-cols-2">{activeCategories.map(c=>category(c))}</div>
    {!categories.length&&<p className="text-earth-500">先新增分類，再在分類內新增標籤。</p>}
    {(inactiveCount>0||categories.some(c=>!c.active))&&<details className="rounded-xl border border-earth-200 p-3"><summary className="min-h-11 cursor-pointer py-2 text-earth-600">已停用 · {categories.filter(c=>!c.active).length} 個分類／{inactiveCount} 個標籤</summary><div className="mt-2 space-y-3">{categories.filter(c=>!c.active||data.labels.some(l=>l.categoryId===c.id&&!l.active)).map(c=>category(c,true))}</div></details>}
    </div>
  </div>;
}
