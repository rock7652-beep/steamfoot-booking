"use client";
import {useEffect,useState} from "react";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {loadMusicCustomerAttention} from "@/server/actions/music-customer-attention";

type Result=Awaited<ReturnType<typeof loadMusicCustomerAttention>>;
export function MusicCustomerAttention({customerId,revision,onRecords}:{customerId:string;revision:number;onRecords:()=>void}) {
 const reader=usePanelReader("music-customer-attention",loadMusicCustomerAttention,String(revision),15000);
 const [result,setResult]=useState<{key:string;value:Result}|null>(null),[retry,setRetry]=useState(0);
 const key=JSON.stringify([customerId,revision,retry]);
 useEffect(()=>{let active=true;reader.read(customerId).then(value=>{if(active)setResult({key,value});}).catch(()=>{if(active)setResult({key,value:{success:false,error:"收款待辦讀取失敗"}});});return()=>{active=false;};},[reader,customerId,key]);
 const value=result?.key===key?result.value:reader.get(customerId);
 if(!value)return null;
 if(!value.success)return <p role="alert" className="text-sm text-red-700">{value.error}<button type="button" className="min-h-11 px-3" onClick={()=>{reader.invalidate(customerId);setRetry(n=>n+1);}}>重試</button></p>;
 if(!value.data.outstanding&&!value.data.pending)return null;
 return <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 text-sm text-amber-900" aria-label="待處理收款"><span>{value.data.outstanding>0?`待收 NT$ ${value.data.outstanding.toLocaleString("zh-TW")}`:""}{value.data.pending>0?`${value.data.outstanding>0?" · ":""}待核帳 ${value.data.pending} 筆`:""}</span><button type="button" className="min-h-11 px-2" onClick={onRecords}>查看收款</button></div>;
}
