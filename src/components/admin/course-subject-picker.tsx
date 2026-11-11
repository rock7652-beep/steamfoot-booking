"use client";
import {useState} from "react";

export function CourseSubjectPicker({items,value,onChange,disabled=false,label="適用教學項目"}:{items:{id:string;name:string;isActive?:boolean}[];value:string[];onChange:(ids:string[])=>void;disabled?:boolean;label?:string}) {
 const [search,setSearch]=useState("");
 const active=items.filter(item=>item.isActive!==false).map(item=>item.id);
 const rows=items.filter(item=>(item.isActive!==false||value.includes(item.id))&&item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const unknown=value.filter(id=>!items.some(item=>item.id===id));
 return <fieldset data-subject-picker aria-label={label} disabled={disabled} className="min-w-0 space-y-2">
  <legend className="font-medium">{label}</legend>
  <div className="flex min-w-0 flex-wrap items-center gap-2">
   <input aria-label="搜尋教學項目" placeholder="搜尋教學項目" value={search} onChange={e=>setSearch(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-earth-200 px-3 text-base"/>
   <button type="button" aria-pressed={!!active.length&&active.every(id=>value.includes(id))} className="min-h-11 rounded-lg border border-earth-200 px-3" onClick={()=>onChange([...new Set([...value,...active])])}>全選</button>
   <button type="button" className="min-h-11 rounded-lg border border-earth-200 px-3" onClick={()=>onChange([])}>清除</button>
   <span className="text-sm text-earth-600">已選 {value.length} 項</span>
  </div>
  <div className="grid max-h-52 grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-x-3 overflow-y-auto rounded-lg border border-earth-200 px-3">
   {rows.map(item=><label key={item.id} className="flex min-h-11 min-w-0 items-center gap-2"><input type="checkbox" checked={value.includes(item.id)} onChange={e=>onChange(e.target.checked?[...value,item.id]:value.filter(id=>id!==item.id))}/><span className="break-words">{item.name}{item.isActive===false?"（已停用）":""}</span></label>)}
   {!rows.length&&<p className="py-3 text-sm text-earth-600">沒有符合的教學項目</p>}
   {unknown.map((id,index)=><label key={id} className="flex min-h-11 items-center gap-2 text-amber-800"><input type="checkbox" checked onChange={()=>onChange(value.filter(v=>v!==id))}/>已移除項目 {index+1}（請移除）</label>)}
  </div>
 </fieldset>;
}
