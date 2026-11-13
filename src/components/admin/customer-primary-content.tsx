"use client";
import {useEffect,useState,type ReactNode} from 'react';
type Reader={read:(id:string)=>Promise<unknown>;get:(id:string)=>unknown};
/** Keep known identity visible; mount the primary blocks together from the same snapshot. */
export function CustomerPrimaryContent({customerId,reader,children,quiet=false}:{customerId:string;reader:Reader;children?:ReactNode;quiet?:boolean}){
 const [state,setState]=useState<{id:string;reader:Reader;error?:string}>();
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;
  void reader.read(customerId).then(()=>{if(active)setState({id:customerId,reader});},()=>{if(active)setState({id:customerId,reader,error:'顧客資料讀取失敗'});});
  return()=>{active=false;};
 },[customerId,reader,retry]);
 const current=state?.id===customerId&&state.reader===reader?state:undefined;
 if(current?.error)return <p role="alert" className="text-sm text-red-700">{current.error}<button type="button" className="min-h-11 px-3 underline" onClick={()=>{setState(undefined);setRetry(n=>n+1);}}>重試</button></p>;
 if(!current&&!reader.get(customerId))return quiet?null:<p role="status" className="py-3 text-sm">讀取顧客資料中…</p>;
 return children;
}
