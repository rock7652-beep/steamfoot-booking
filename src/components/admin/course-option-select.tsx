"use client";
import { useId, useRef, useState } from "react";
/** Small lists stay native. Larger lists expose searchable, keyboard-operable options. */
export function CourseOptionSelect({options,value,onChange,name,placeholder="請選擇",required=false,label,searchable=false,onSearchChange,onCreate}: {
  options:{id:string;label:string;disabled?:boolean}[];value:string;onChange:(value:string)=>void;name?:string;
  onCreate?:(query:string)=>void;onSearchChange?:(query:string)=>void;placeholder?:string;required?:boolean;label:string;searchable?:boolean;
}) {
  const id=useId();
  const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [active,setActive]=useState(0);
  const selected=options.find(o=>o.id===value);
  const matches=options.filter(o=>o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const rows=matches.slice(0,20);
  function choose(next:string){if(options.find(o=>o.id===next)?.disabled)return;onChange(next);setOpen(false);setQuery("");input.current?.focus();}
  const field="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";
  if(!searchable&&options.length<=10)return <select className={field} aria-label={label} name={name} value={value} required={required} onChange={e=>onChange(e.target.value)}><option value="">{placeholder}</option>{options.map(o=><option key={o.id} value={o.id} disabled={o.disabled}>{o.label}</option>)}</select>;
  return <div className="relative" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    {name && <input type="hidden" name={name} value={value}/>}
    <input ref={input} role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open && rows[active] ? `${id}-${active}`:undefined}
      className={field} placeholder={selected?.label ?? placeholder} value={open ? query : selected?.label ?? ""} required={required && !selected}
      onFocus={()=>{setOpen(true);setActive(0);}} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0);onSearchChange?.(e.target.value);}}
      onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);}else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(n=>Math.max(0,Math.min(rows.length-1,n+(e.key==="ArrowDown"?1:-1))));}else if(e.key==="Enter"&&open){e.preventDefault();if(rows[active])choose(rows[active].id);}}}/>
    {open && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-earth-200 bg-white shadow-lg">
      {!required && <button type="button" className="min-h-11 w-full px-3 text-left text-sm" onMouseDown={e=>e.preventDefault()} onClick={()=>choose("")}>{placeholder}</button>}
      <div id={id} role="listbox" aria-label={label}>{rows.map((o,index)=><div key={o.id} id={`${id}-${index}`} role="option" aria-selected={o.id===value} aria-disabled={o.disabled||undefined}
        className={`min-h-11 break-words px-3 py-2 text-sm ${o.disabled ? "cursor-not-allowed text-earth-400":"cursor-pointer"} ${active===index ? "bg-primary-50":""}`}
        onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(o.id)}>{o.label}{o.id===value ? " ✓":""}</div>)}</div>
      {!rows.length && <><p className="p-3 text-sm">沒有符合的項目</p>{onCreate&&<button type="button" className="min-h-11 w-full px-3 text-left text-sm text-primary-800" onMouseDown={e=>e.preventDefault()} onClick={()=>{onCreate(query);setOpen(false);}}>＋新增顧客</button>}</>}{matches.length>20 && <p className="p-3 text-xs text-earth-500">顯示前 20 項，請輸入名稱縮小範圍。</p>}
    </div>}
  </div>;
}

/** Multiple selections use the same bounded, searchable option popup. */
export function CourseMultiOptionSelect({options,value,onChange,label}:{options:{id:string;label:string}[];value:string[];onChange:(value:string[])=>void;label:string}){
 return <div className="min-w-0 space-y-1">
  <CourseOptionSelect searchable label={label} placeholder="搜尋姓名／電話後加入" value="" onChange={id=>{if(id&&!value.includes(id))onChange([...value,id]);}} options={options.map(o=>({...o,disabled:value.includes(o.id)}))}/>
  <div className="flex flex-wrap gap-1" aria-label="已選學員">{value.map(id=>{const option=options.find(o=>o.id===id);return <button key={id} type="button" className="min-h-11 max-w-full break-words rounded-lg border border-primary-200 bg-primary-50 px-3 text-left" aria-label={`移除 ${option?.label??id}`} onClick={()=>onChange(value.filter(v=>v!==id))}>{option?.label??id} ×</button>;})}</div>
 </div>;
}
