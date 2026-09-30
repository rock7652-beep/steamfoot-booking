"use client";
import { useState } from "react";
import { loadCustomerLabels, manageCustomerLabels } from "@/server/actions/customer-labels";
import { labelColor, type LabelSnapshot } from "@/lib/customer-labels";
export function LabelManager({initial}:{initial:LabelSnapshot}) {
  const [data,setData]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState("");
  const [categoryName,setCategoryName]=useState(""),[labelName,setLabelName]=useState(""),[categoryId,setCategoryId]=useState("");
  const [editing,setEditing]=useState<{kind:"category"|"label";id:string;name:string;categoryId?:string}|null>(null);
  async function save(input:unknown) {
    if(pending)return false;setPending(true);setError("");
    try {const result=await manageCustomerLabels(input);if(!result.success){setError(result.error??"儲存失敗");return false;}setData(await loadCustomerLabels());window.dispatchEvent(new Event("customer-labels:refresh"));return true;}
    catch{setError("儲存失敗，請重試");return false;}
    finally{setPending(false);}
  }
  const categories=[...data.categories].sort((a,b)=>a.position-b.position||a.number-b.number);
  const disabled=pending||!data.canManage;
  return <div className="space-y-3 text-sm">
    <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={data.enabled} disabled={disabled} onChange={e=>void save({action:"enable",enabled:e.target.checked})}/>啟用顧客標籤</label>
    <p className="text-xs text-earth-500">店內使用；關閉保留資料。分類自動配色，改名及排序不換色。</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {data.canManage&&<>
      <form className="flex flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();if(await save({action:"category",name:categoryName}))setCategoryName("");}}><input aria-label="新增分類名稱" maxLength={8} required value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="分類名稱（最多8字）" className="h-10 min-w-0 max-w-full flex-1 rounded border px-3"/><button disabled={pending} className="min-h-10 shrink-0 rounded border px-3">新增分類</button></form>
      <form className="flex flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();if(await save({action:"label",categoryId,name:labelName}))setLabelName("");}}><select aria-label="標籤所屬分類" required value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="h-10 min-w-0 max-w-full flex-1 rounded border px-3"><option value="">選擇分類</option>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{String(c.number).padStart(2,"0")} · {c.name}</option>)}</select><input aria-label="新增標籤名稱" required maxLength={8} value={labelName} onChange={e=>setLabelName(e.target.value)} placeholder="標籤名稱（最多8字）" className="h-10 min-w-0 max-w-full flex-1 rounded border px-3"/><button disabled={pending} className="min-h-10 shrink-0 rounded border px-3">新增標籤</button></form>
    </>}
    {editing&&<form className="flex flex-wrap gap-2 rounded border p-3" onSubmit={async e=>{e.preventDefault();if(await save({action:editing.kind,id:editing.id,name:editing.name,...(editing.categoryId?{categoryId:editing.categoryId}:{})}))setEditing(null);}}><input aria-label="修改名稱" maxLength={8} required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} className="h-10 min-w-0 max-w-full flex-1 rounded border px-3"/>{editing.kind==="label"&&<select aria-label="修改所屬分類" value={editing.categoryId} onChange={e=>setEditing({...editing,categoryId:e.target.value})}>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}<button disabled={pending}>儲存</button><button type="button" onClick={()=>setEditing(null)}>取消</button></form>}
    {categories.map((c,index)=><section key={c.id} className={`rounded-lg border p-3 ${!c.active?"opacity-60":""}`}><div className="flex flex-wrap items-center gap-2"><span className={`rounded border px-2 py-1 ${labelColor(c.number)}`}>{String(c.number).padStart(2,"0")} · {c.name}{!c.active?"（停用）":""}</span>{data.canManage&&<><button disabled={pending} onClick={()=>setEditing({kind:"category",id:c.id,name:c.name})}>改名</button><button disabled={pending} onClick={()=>void save({action:"active",kind:"category",id:c.id,active:!c.active})}>{c.active?"停用":"啟用"}</button>{[-1,1].map(offset=><button key={offset} disabled={pending||index+offset<0||index+offset>=categories.length} aria-label={`${c.name}${offset<0?"上移":"下移"}`} onClick={()=>{const ids=categories.map(x=>x.id);[ids[index],ids[index+offset]]=[ids[index+offset],ids[index]];void save({action:"order",ids});}}>{offset<0?"↑":"↓"}</button>)}</>}</div><div className="mt-2 flex flex-wrap gap-2">{data.labels.filter(l=>l.categoryId===c.id).map(l=><span key={l.id} className={`inline-flex items-center gap-2 rounded border px-2 py-1 ${labelColor(c.number)}`}><span>{l.name}{!l.active?"（停用）":""}</span>{data.canManage&&<><button disabled={pending||!c.active} aria-label={`修改${l.name}`} onClick={()=>setEditing({kind:"label",id:l.id,name:l.name,categoryId:l.categoryId})}>✎</button><button disabled={pending} onClick={()=>void save({action:"active",kind:"label",id:l.id,active:!l.active})}>{l.active?"停用":"啟用"}</button></>}</span>)}</div></section>)}
  </div>;
}
