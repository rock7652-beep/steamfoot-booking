"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

/** GET filters only. Collect the entire draft so rapid changes cannot lose fields. */
export function InstantFilterForm({children,className}:{children:ReactNode;className?:string}) {
  const router=useRouter(),pathname=usePathname();
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),composing=useRef(false);
  const [pending,start]=useTransition(),[error,setError]=useState("");
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  function apply(form:HTMLFormElement,delay=0){
    if(timer.current)clearTimeout(timer.current);
    if(composing.current)return;
    timer.current=setTimeout(()=>{
      const data=new FormData(form),params=new URLSearchParams();
      const from=String(data.get("dateFrom")??data.get("from")??""),to=String(data.get("dateTo")??data.get("to")??"");
      if((from&&!to)||(!from&&to)){setError("請填完整日期區間");return;}
      if(from&&to&&from>to){setError("結束日期不能早於開始日期");return;}
      if(!form.checkValidity())return;
      setError("");
      data.forEach((value,key)=>{if(typeof value==="string"&&value.trim()&&key!=="page")params.append(key,value.trim());});
      start(()=>router.replace(`${pathname}${params.size?`?${params}`:""}`,{scroll:false}));
    },delay);
  }
  return <form className={className} onSubmit={e=>{e.preventDefault();apply(e.currentTarget);}}
    onCompositionStart={()=>{composing.current=true;if(timer.current)clearTimeout(timer.current);}}
    onCompositionEnd={e=>{composing.current=false;apply(e.currentTarget,250);}}
    onChange={e=>{const field=e.target as unknown as HTMLInputElement;apply(e.currentTarget,field.tagName==="SELECT"||field.type==="date"?0:250);}}>
    {children}
    {error?<p role="alert" className="text-xs text-amber-700">{error}</p>:pending?<p role="status" className="text-xs text-earth-500">更新中…</p>:null}
  </form>;
}
