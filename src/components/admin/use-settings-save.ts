"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

/** Confirmed mutations bypass RSC rendering. Ambiguous creates reuse payload/key. */
export function useSettingsSave<T>(endpoint:string, storeId:string, rowSchema:z.ZodType<T,z.ZodTypeDef,unknown>) {
  const lock=useRef(false), active=useRef(false), scope=useRef(storeId);
  scope.current=storeId;
  const attempt=useRef<Record<string,unknown>|null>(null);
  const [pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  function reset(){if(!lock.current){attempt.current=null;setUncertain(false);}}
  async function save(input:Record<string,unknown>) {
    if(lock.current)return {success:false as const,error:"正在儲存"};
    lock.current=true;setPending(true);
    const started=performance.now(), requestedStore=storeId;
    attempt.current??={...input,expectedStoreId:storeId,requestKey:crypto.randomUUID()};
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(attempt.current),signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(!active.current||scope.current!==requestedStore)return {success:false as const,error:"頁面已切換"};
      if(result.success===false&&result.uncertain!==true&&typeof result.error==="string"){
        attempt.current=null;setUncertain(false);return {success:false as const,error:result.error};
      }
      const receipt=z.object({success:z.literal(true),storeId:z.string(),syncWarning:z.boolean().optional()}).parse(result);
      if(receipt.storeId!==storeId)throw new Error("stale store response");
      const data=rowSchema.parse(result.data);
      attempt.current=null;setUncertain(false);
      console.info("[SETTINGS_SAVE_CLIENT_PERF]",{responseMs:Math.round(performance.now()-started)});
      return {success:true as const,data,syncWarning:!!receipt.syncWarning};
    }catch{
      if(active.current)setUncertain(true);
      return {success:false as const,error:"尚未確認儲存結果，請重試核對同一次送出；輸入已保留。"};
    }finally{lock.current=false;if(active.current)setPending(false);}
  }
  return {save,reset,pending,uncertain};
}
