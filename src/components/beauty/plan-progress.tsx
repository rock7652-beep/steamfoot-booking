"use client";
import {useEffect,useState} from 'react';
import {readBeautyCardProgress} from '@/lib/beauty/portal-detail-read';
import {useBeautyNativePlanProgressReader} from './use-native-plan-progress-reader';
import {PlanUsageGrid} from '@/components/admin/plan-usage-grid';
import {toLocalDateStr} from '@/lib/date-utils';
type ProgressResult=Awaited<ReturnType<typeof readBeautyCardProgress>>;
export type BeautyProgressReader={read:(cardId:string,slug:string)=>Promise<ProgressResult>;refresh:(cardId:string,slug:string)=>Promise<ProgressResult>;get:(cardId:string,slug:string)=>ProgressResult|undefined;peek?:(cardId:string,slug:string)=>ProgressResult|undefined;seed?:(value:ProgressResult,cardId:string,slug:string)=>void};
export function BeautyPlanProgress({initialData,initialReadAt,reader:memberReader,cardId,scope,slug='',storeId,customerId,revision=0,load=readBeautyCardProgress}: {
 initialData?:ProgressResult;initialReadAt?:number;reader?:BeautyProgressReader;cardId:string;scope:string;slug?:string;storeId?:string;customerId?:string;revision?:number;load?:typeof readBeautyCardProgress;
}) {
 const nativeReader=useBeautyNativePlanProgressReader(storeId??'');
 const [attempt,setAttempt]=useState(0);
 const key=JSON.stringify([scope,cardId,storeId,customerId,revision,attempt]);
 const [state,setState]=useState<{key:string;value?:Awaited<ReturnType<typeof readBeautyCardProgress>>;error?:string}>({key:''});
 useEffect(()=>{
  let active=true,running=false;const read=async(revalidate=false)=>{
   if(running||document.visibilityState==='hidden')return;running=true;
   try{const value=await (storeId&&customerId?attempt||revalidate?nativeReader.refresh(storeId,customerId,cardId,revision):nativeReader.read(storeId,customerId,cardId,revision):memberReader?(attempt||revalidate?memberReader.refresh(cardId,slug):memberReader.read(cardId,slug)):load(cardId,slug));if(active)setState({key,value});}
   catch{if(active)setState({key,error:'使用紀錄讀取失敗，請重試。'});}finally{running=false;}
  };
  if(initialData&&initialReadAt&&Date.now()-initialReadAt<15000&&!memberReader?.get(cardId,slug))memberReader?.seed?.(initialData,cardId,slug);
  void read();const timer=storeId?undefined:setInterval(()=>void read(true),10000);
  const visible=()=>void read(true);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[key,storeId,customerId,cardId,load,slug,nativeReader,attempt,revision,memberReader,initialData,initialReadAt]);
 const cached=storeId&&customerId?nativeReader.peek(storeId,customerId,cardId,revision):memberReader?.get(cardId,slug)??memberReader?.peek?.(cardId,slug);
 const initial=initialData&&initialReadAt&&Date.now()-initialReadAt<15000?initialData:undefined;
 const result=state.key===key?state:cached||initial?{value:cached??initial,error:undefined}:undefined,error=result?.error??(result?.value&&!result.value.success?result.value.error:undefined);
 if(error)return <p role="alert" className="text-sm text-red-700">{error} <button type="button" className="min-h-11 px-3 underline" onClick={()=>setAttempt(n=>n+1)}>重試</button></p>;
 if(!result?.value?.success)return <p role="status" className="text-sm">讀取使用紀錄中…</p>;
 const data=result.value.data;
 return <><p className="text-sm text-earth-600">購買 {toLocalDateStr(new Date(data.purchasedAt))} · 方案金額 NT$ {data.price.toLocaleString()}{data.shared?' · 共用':''}</p><PlanUsageGrid progress={data.progress} /></>;
}
