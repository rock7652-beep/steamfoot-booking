"use client";

import {useEffect,useState} from "react";
import {getCustomerHealthTracking} from "@/server/actions/customer-panel-summary";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {CustomerHealthTracking} from "@/components/customer-health-tracking";

export function SteamCustomerHealthTracking({customerId,revision}:{customerId:string;revision:number}) {
  const [attempt,setAttempt]=useState(0);
  const key=JSON.stringify([customerId,revision,attempt]);
  const reader=usePanelReader("steam-customer-health-tracking",getCustomerHealthTracking,key,0);
  const [result,setResult]=useState<{key:string;value:Awaited<ReturnType<typeof getCustomerHealthTracking>>}|null>(null);
  useEffect(()=>{
    let active=true;
    const timeout=setTimeout(()=>{if(active){active=false;setResult({key,value:{success:false,error:"健康紀錄讀取逾時，請重試"}});}},15_000);
    reader.read(customerId).then(value=>{if(active)setResult({key,value});}).catch(()=>{if(active)setResult({key,value:{success:false,error:"健康紀錄讀取失敗"}});}).finally(()=>clearTimeout(timeout));
    return()=>{active=false;clearTimeout(timeout);};
  },[reader,customerId,key]);
  if(result?.key!==key)return <p role="status">讀取健康紀錄…</p>;
  if(!result.value.success)return <div role="alert">{result.value.error}<button type="button" className="min-h-11 px-3 text-primary-700" onClick={()=>setAttempt(n=>n+1)}>重新讀取</button></div>;
  return <CustomerHealthTracking summary={result.value.data}/>;
}
