"use client";
import {useEffect,useRef} from "react";
import {addTaiwanDuration} from "@/lib/date-utils";

/** Only speculative reads; never generate courses, accept a snapshot or change selection. */
export function useCalendarMonthPreload({enabled,date,blocked,reader,revision=0}:{
  enabled:boolean;date:string;blocked:boolean;revision?:number;
  reader:{read:(date:string)=>Promise<unknown>;get:(date:string)=>unknown;snapshot?:(date:string)=>unknown};
}) {
  const month=date.slice(0,7);
  useIdleReadPreload({enabled,blocked,reader,revision,keys:[-1,1,-2,2].map(delta=>addTaiwanDuration(`${month}-01`,delta,"MONTH")),startDelayMs:250,gapMs:0,concurrency:2,retainSnapshots:true});
}

export function useIdleReadPreload({enabled,keys,blocked,reader,revision=0,startDelayMs=1500,gapMs=500,concurrency=1,retainSnapshots=false,allowFocusedInput=false,repeatAfterMs=0}:{
 enabled:boolean;keys:string[];blocked:boolean;revision?:number;
 reader:{read:(key:string)=>Promise<unknown>;get:(key:string)=>unknown;snapshot?:(key:string)=>unknown};
 startDelayMs?:number;gapMs?:number;concurrency?:number;retainSnapshots?:boolean;allowFocusedInput?:boolean;repeatAfterMs?:number;
}){
  const key=JSON.stringify(keys);
  // In-flight reads survive effect cancellation; keep the cap across date changes.
  const active=useRef(0);
  useEffect(()=>{
    if(!enabled||blocked)return;
    let canceled=false;
    const timers=new Set<ReturnType<typeof setTimeout>>();
    const targets=JSON.parse(key) as string[];
    let restarting=false;
    const repeat=()=>{
      if(canceled||!repeatAfterMs||restarting||active.current||!JSON.parse(key).length)return;
      restarting=true;
      const timer=setTimeout(()=>{
        timers.delete(timer);if(canceled)return;restarting=false;targets.push(...JSON.parse(key));
        for(let worker=0;worker<Math.min(concurrency,targets.length);worker++)schedule(0);
      },repeatAfterMs);timers.add(timer);
    };
    const schedule=(delay:number)=>{const timer=setTimeout(()=>{timers.delete(timer);void next();},delay);timers.add(timer);};
    const next=async()=>{
      if(canceled)return;
      if(!targets.length){repeat();return;}
      if(document.hidden||!navigator.onLine||!allowFocusedInput&&document.activeElement?.matches("input, textarea, select, [contenteditable='true']")){
        schedule(1500);return;
      }
      if(active.current>=concurrency){schedule(250);return;}
      const target=targets.shift()!;
      const cached=retainSnapshots?reader.snapshot?.(target)??reader.get(target):reader.get(target);
      if(!cached){
        active.current++;
        try{await reader.read(target);}catch{/* Actual navigation owns retry feedback. */}
        finally{active.current--;}
      }
      if(!canceled&&targets.length)schedule(gapMs);
      else repeat();
    };
    for(let worker=0;worker<Math.min(concurrency,targets.length);worker++)schedule(startDelayMs);
    return()=>{canceled=true;for(const timer of timers)clearTimeout(timer);};
  },[enabled,key,blocked,reader,revision,startDelayMs,gapMs,concurrency,retainSnapshots,allowFocusedInput,repeatAfterMs]);
}
