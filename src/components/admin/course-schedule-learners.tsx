"use client";
import {useEffect,useState} from "react";
import {loadCourseScheduleEnrollmentOptions} from "@/server/actions/course-schedule-enrollment";
import {usePanelReader} from "@/components/operations/panel-read-cache";
export type ScheduleLearner={customerId:string;cardId:string;name:string};
type Card=Extract<Awaited<ReturnType<typeof loadCourseScheduleEnrollmentOptions>>,{success:true}>["cards"][number];
export function CourseScheduleLearners({templateId,pointCost,capacity,value,onChange,disabled=false,scope=""}:{templateId:string;pointCost:number;capacity:number;value:ScheduleLearner[];onChange:(value:ScheduleLearner[])=>void;disabled?:boolean;scope?:string}) {
  const reader=usePanelReader("course-schedule-learners",loadCourseScheduleEnrollmentOptions,scope,0);
  const [cards,setCards]=useState<Card[]>([]);
  const [query,setQuery]=useState("");
  const [error,setError]=useState("");
  const [loadedTemplate,setLoadedTemplate]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    reader.read(templateId).then(result=>{if(!active)return;if(result.success){setCards(result.cards);setLoadedTemplate(templateId);setError("");}else setError(result.error??"學員讀取失敗");}).catch(()=>{if(active)setError("學員讀取失敗");});
    return()=>{active=false;};
  },[reader,templateId,retry]);
  const ready=loadedTemplate===templateId;
  const available=ready?cards.filter(card=>card.available>=(card.unit==="SESSION"?1:pointCost)):[];
  const people=[...new Map(available.flatMap(card=>card.members.filter(member=>member.id).map(member=>[member.id!,{id:member.id!,name:member.name,phone:member.phone}]))).values()];
  const matches=query.trim()?people.filter(person=>!value.some(row=>row.customerId===person.id)&&(person.name.includes(query.trim())||person.phone.includes(query.trim()))).slice(0,30):[];
  return <section aria-label="排課學員" className="col-span-full space-y-2 text-sm">
    <div className="flex items-center justify-between"><strong>學員（選填）</strong><span>{value.length} / {capacity} 人</span></div>
    {value.map(row=><div key={row.customerId} className="flex flex-wrap items-center gap-2 rounded-lg bg-earth-50 px-3 py-1">
      <strong className="min-w-0 flex-1">{row.name}</strong>
      <select aria-label={`${row.name}的方案`} className="min-h-11 max-w-full rounded-lg border border-earth-200 bg-white px-2" disabled={disabled} value={row.cardId} onChange={event=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:event.target.value}:item))}>
        {available.filter(card=>card.members.some(member=>member.id===row.customerId)).map(card=><option key={card.id} value={card.id}>{card.name} · 可用 {card.available}</option>)}
      </select>
      <button type="button" aria-label={`移除${row.name}`} disabled={disabled} className="min-h-11 min-w-11" onClick={()=>onChange(value.filter(item=>item.customerId!==row.customerId))}>×</button>
    </div>)}
    <input aria-label="搜尋排課學員" placeholder={ready?"搜尋學員姓名或電話":"讀取學員中…"} className="min-h-11 w-full rounded-xl border border-earth-200 px-3" value={query} disabled={disabled||!ready||value.length>=capacity} onChange={event=>setQuery(event.target.value)}/>
    {matches.length>0&&<div className="max-h-48 overflow-y-auto rounded-lg border border-earth-200">{matches.map(person=><button key={person.id} type="button" className="flex min-h-11 w-full items-center justify-between border-b border-earth-100 px-3 text-left" disabled={disabled||value.length>=capacity} onClick={()=>{const card=available.find(card=>card.members.some(member=>member.id===person.id));if(card){onChange([...value,{customerId:person.id,cardId:card.id,name:person.name}]);setQuery("");}}}>{person.name}<span>＋</span></button>)}</div>}
    {ready&&query.trim()&&!matches.length&&<p className="text-earth-600">沒有符合且持有可用方案的學員</p>}
    {error&&<p role="alert" className="text-red-700">{error}<button type="button" className="ml-2 min-h-11 underline" onClick={()=>{reader.invalidate(templateId);setRetry(count=>count+1);}}>重試</button></p>}
  </section>;
}
