"use client";
import { useId, useRef, useState } from "react";
/** Small lists stay native. Larger lists expose searchable, keyboard-operable options. */
export function CourseOptionSelect({options,value,onChange,name,placeholder="請選擇",required=false,label}: {
  options:{id:string;label:string}[];value:string;onChange:(value:string)=>void;name?:string;
  placeholder?:string;required?:boolean;label:string;
}) {
  const id=useId();
  const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const [active,setActive]=useState(0);
  const selected=options.find(o=>o.id===value);
  const matches=options.filter(o=>o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const rows=matches.slice(0,20);
  function choose(next:string){onChange(next);setOpen(false);setQuery("");input.current?.focus();}
  const field="min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base";
  if(options.length<=10)return <select className={field} aria-label={label} name={name} value={value} required={required} onChange={e=>onChange(e.target.value)}><option value="">{placeholder}</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>;
  return <div className="relative" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    {name && <input type="hidden" name={name} value={value}/>}
    <input ref={input} role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open && rows[active] ? `${id}-${active}`:undefined}
      className={field} placeholder={selected?.label ?? placeholder} value={open ? query : selected?.label ?? ""} required={required && !selected}
      onFocus={()=>{setOpen(true);setActive(0);}} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0);}}
      onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);}else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(n=>Math.max(0,Math.min(rows.length-1,n+(e.key==="ArrowDown"?1:-1))));}else if(e.key==="Enter"&&open){e.preventDefault();if(rows[active])choose(rows[active].id);}}}/>
    {open && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-earth-200 bg-white shadow-lg">
      {!required && <button type="button" className="min-h-11 w-full px-3 text-left text-sm" onMouseDown={e=>e.preventDefault()} onClick={()=>choose("")}>{placeholder}</button>}
      <div id={id} role="listbox" aria-label={label}>{rows.map((o,index)=><div key={o.id} id={`${id}-${index}`} role="option" aria-selected={o.id===value}
        className={`min-h-11 cursor-pointer break-words px-3 py-2 text-sm ${active===index ? "bg-primary-50":""}`}
        onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(o.id)}>{o.label}{o.id===value ? " ✓":""}</div>)}</div>
      {!rows.length && <p className="p-3 text-sm">沒有符合的項目</p>}{matches.length>20 && <p className="p-3 text-xs text-earth-500">顯示前 20 項，請輸入名稱縮小範圍。</p>}
    </div>}
  </div>;
}
