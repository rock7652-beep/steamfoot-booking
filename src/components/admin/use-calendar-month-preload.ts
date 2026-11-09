"use client";
import {useEffect} from "react";
import {addTaiwanDuration} from "@/lib/date-utils";

/** Only speculative reads; never generate courses, accept a snapshot or change selection. */
export function useCalendarMonthPreload({enabled,date,blocked,reader,revision=0}:{
  enabled:boolean;date:string;blocked:boolean;revision?:number;
  reader:{read:(date:string)=>Promise<unknown>;get:(date:string)=>unknown};
}) {
  const month=date.slice(0,7);
  useIdleReadPreload({enabled,blocked,reader,revision,keys:[-1,1].map(delta=>addTaiwanDuration(`${month}-01`,delta,"MONTH"))});
}

export function useIdleReadPreload({enabled,keys,blocked,reader,revision=0}:{
 enabled:boolean;keys:string[];blocked:boolean;revision?:number;
 reader:{read:(key:string)=>Promise<unknown>;get:(key:string)=>unknown};
}){
  const key=JSON.stringify(keys);
  useEffect(()=>{
    if(!enabled||blocked)return;
    let canceled=false;
    let timer:ReturnType<typeof setTimeout>;
    const targets=JSON.parse(key) as string[];
    const next=async()=>{
      if(canceled||!targets.length)return;
      if(document.hidden||!navigator.onLine||document.activeElement?.matches("input, textarea, select, [contenteditable='true']")){
        timer=setTimeout(()=>void next(),1500);return;
      }
      const target=targets.shift()!;
      if(!reader.get(target))try{await reader.read(target);}catch{/* Actual navigation owns retry feedback. */}
      if(!canceled&&targets.length)timer=setTimeout(()=>void next(),500);
    };
    timer=setTimeout(()=>void next(),1500);
    return()=>{canceled=true;clearTimeout(timer);};
  },[enabled,key,blocked,reader,revision]);
}
