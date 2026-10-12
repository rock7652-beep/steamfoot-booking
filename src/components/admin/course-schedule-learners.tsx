"use client";
import {useEffect,useState} from "react";
import {loadCourseScheduleEnrollmentOptions} from "@/server/actions/course-schedule-enrollment";
import {usePanelReader} from "@/components/operations/panel-read-cache";
export type ScheduleLearner={customerId:string;cardId:string;name:string};
type Card=Extract<Awaited<ReturnType<typeof loadCourseScheduleEnrollmentOptions>>,{success:true}>["cards"][number];
export function CourseScheduleLearners({templateId,pointCost,capacity,value,onChange,disabled=false,scope="",occurrenceCount=1,onValidityChange}:{templateId:string;pointCost:number;capacity:number;value:ScheduleLearner[];onChange:(value:ScheduleLearner[])=>void;disabled?:boolean;scope?:string;occurrenceCount?:number;onValidityChange?:(valid:boolean)=>void}) {
  const reader=usePanelReader("course-schedule-learners",loadCourseScheduleEnrollmentOptions,scope,0);
  const [cards,setCards]=useState<Card[]>([]);
  const [query,setQuery]=useState("");
  const [error,setError]=useState<{templateId:string;message:string}|null>(null);
  const [loadedTemplate,setLoadedTemplate]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    reader.read(templateId).then(result=>{if(!active)return;if(result.success){setCards(result.cards);setLoadedTemplate(templateId);setError(null);}else setError({templateId,message:result.error??"學員讀取失敗"});}).catch(()=>{if(active)setError({templateId,message:"學員讀取失敗"});});
    return()=>{active=false;};
  },[reader,templateId,retry]);
  const ready=loadedTemplate===templateId;
  const requiredFor=(card:Card)=>occurrenceCount*(card.unit==="SESSION"?1:pointCost);
  const available=ready?cards.filter(card=>card.available>=requiredFor(card)):[];
  const enrollmentValid=value.length<=capacity&&value.every(row=>{
    const card=cards.find(item=>item.id===row.cardId&&item.members.some(member=>member.id===row.customerId));
    return !ready?false:!!card&&card.available>=requiredFor(card);
  });
  useEffect(()=>{onValidityChange?.(enrollmentValid);},[enrollmentValid,onValidityChange]);
  const people=[...new Map(available.flatMap(card=>card.members.filter(member=>member.id).map(member=>[member.id!,{id:member.id!,name:member.name,phone:member.phone}]))).values()];
  const matches=query.trim()?people.filter(person=>!value.some(row=>row.customerId===person.id)&&(person.name.includes(query.trim())||person.phone.includes(query.trim()))).slice(0,30):[];
  return <section aria-label="排課學員" className="col-span-full space-y-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-x-2"><strong>學員（選填）</strong><span>{value.length} / {capacity} 人 · 本次 {occurrenceCount} 堂</span></div>
    {value.map(row=>{const memberCards=cards.filter(card=>card.members.some(member=>member.id===row.customerId));const selectedCard=memberCards.find(card=>card.id===row.cardId);const enough=!!selectedCard&&selectedCard.available>=requiredFor(selectedCard);return <div key={row.customerId} className="flex flex-wrap items-center gap-2 rounded-lg bg-earth-50 px-3 py-1">
      <strong className="min-w-0 flex-1">{row.name}</strong>
      <select aria-label={`${row.name}的方案`} className="min-h-11 max-w-full rounded-lg border border-earth-200 bg-white px-2" disabled={disabled} value={row.cardId} onChange={event=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:event.target.value}:item))}>
        {memberCards.map(card=><option key={card.id} value={card.id} disabled={card.available<requiredFor(card)}>{card.name} · 可用 {card.available} · 本次需 {requiredFor(card)}</option>)}
      </select>
      <button type="button" aria-label={`移除${row.name}`} disabled={disabled} className="min-h-11 min-w-11" onClick={()=>onChange(value.filter(item=>item.customerId!==row.customerId))}>×</button>
      {!enough&&<p role="alert" className="w-full text-red-700">方案額度不足，請改選方案或減少排課堂數。</p>}
    </div>;})}
    <input aria-label="搜尋排課學員" placeholder={ready?"搜尋學員姓名或電話":"讀取學員中…"} className="min-h-11 w-full rounded-xl border border-earth-200 px-3" value={query} disabled={disabled||!ready||value.length>=capacity} onChange={event=>setQuery(event.target.value)}/>
    {matches.length>0&&<div className="max-h-48 overflow-y-auto rounded-lg border border-earth-200">{matches.map(person=><button key={person.id} type="button" className="flex min-h-11 w-full items-center justify-between border-b border-earth-100 px-3 text-left" disabled={disabled||value.length>=capacity} onClick={()=>{const card=available.find(card=>card.members.some(member=>member.id===person.id));if(card){onChange([...value,{customerId:person.id,cardId:card.id,name:person.name}]);setQuery("");}}}>{person.name}<span>＋</span></button>)}</div>}
    {ready&&query.trim()&&!matches.length&&<p className="text-earth-600">沒有符合且額度足夠的學員</p>}
    {error?.templateId===templateId&&<p role="alert" className="text-red-700">{error.message}<button type="button" className="ml-2 min-h-11 underline" onClick={()=>{reader.invalidate(templateId);setRetry(count=>count+1);}}>重試</button></p>}
  </section>;
}
