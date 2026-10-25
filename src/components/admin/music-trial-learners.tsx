"use client";
import {useEffect,useState} from "react";
import {usePanelReader} from "@/components/operations/panel-read-cache";
import {loadCourseScheduleEnrollmentOptions} from "@/server/actions/course-schedule-enrollment";
import type {ScheduleLearner} from "./course-schedule-learners";

export function MusicTrialLearners({configuredPrice,templateId,value,onChange,onValidityChange,disabled=false}:{configuredPrice?:number;templateId:string;value:ScheduleLearner[];onChange:(rows:ScheduleLearner[])=>void;onValidityChange:(valid:boolean)=>void;disabled?:boolean}) {
  const reader=usePanelReader("music-trial-price",loadCourseScheduleEnrollmentOptions,"",0);
  const [quote,setQuote]=useState<{key:string;price:number;enabled:boolean}|null>(null);
  const [error,setError]=useState<{key:string;message:string}|null>(null);
  useEffect(()=>{let current=true;if(!templateId)return;
    reader.read(templateId).then(result=>{if(!current)return;if(result.success)setQuote({key:templateId,price:configuredPrice??result.trialSettings.price,enabled:result.trialSettings.enabled});else setError({key:templateId,message:result.error});}).catch(()=>{if(current)setError({key:templateId,message:"體驗費用讀取失敗，請重新選擇課程"});});return()=>{current=false;};
  },[reader,templateId,configuredPrice]);
  const ready=quote?.key===templateId;
  useEffect(()=>{if(ready&&quote&&value.some(row=>row.trialPrice!==quote.price))onChange(value.map(row=>({...row,trialPrice:quote.price})));},[ready,quote,value,onChange]);
  const valid=!!ready&&!!quote?.enabled&&value.length>0&&value.every(row=>!!row.name.trim()&&/^09\d{8}$/.test(row.participantPhone??""));
  useEffect(()=>onValidityChange(valid),[valid,onValidityChange]);
  function edit(id:string,key:"name"|"participantPhone",text:string){onChange(value.map(row=>row.customerId===id?{...row,[key]:text}:row));}
  return <section aria-label="體驗者資料" className="min-w-0 space-y-2"><strong>體驗者 · {value.length} 人</strong>
    {value.map((row,index)=><div key={row.customerId} className="grid grid-cols-2 gap-2 rounded-lg bg-earth-50 p-3 [&>label]:min-w-0"><label>姓名<input aria-label={`體驗者 ${index+1} 姓名`} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base" value={row.name} maxLength={80} disabled={disabled} onChange={event=>edit(row.customerId,"name",event.target.value)}/></label><label>手機<input aria-label={`體驗者 ${index+1} 手機`} type="tel" className="mt-1 min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-base" value={row.participantPhone??""} maxLength={10} disabled={disabled} onChange={event=>edit(row.customerId,"participantPhone",event.target.value)}/></label><span className="self-center">{ready?`體驗費 $${quote!.price}／人`:"選課後確認體驗費用"}</span>{value.length>1&&<button type="button" className="min-h-11 justify-self-end px-3" aria-label={`移除體驗者 ${index+1}`} disabled={disabled} onClick={()=>onChange(value.filter(person=>person!==row))}>移除</button>}</div>)}
    <button type="button" className="min-h-11 text-primary-700" disabled={disabled||value.length>=500} onClick={()=>onChange([...value,{customerId:`trial-draft:${crypto.randomUUID()}`,cardId:"",name:"",participantPhone:"",...(ready?{trialPrice:quote!.price}:{})}])}>＋加入體驗者</button>
    {error?.key===templateId&&<p role="alert" className="text-red-700">{error.message}</p>}{ready&&!quote?.enabled&&<p role="alert">店家尚未開啟體驗課</p>}
  </section>;
}
