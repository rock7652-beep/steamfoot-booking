"use client";
import {useEffect,useRef,useState,useTransition} from "react";
import {loadCourseScheduleEnrollmentOptions,createScheduleCustomer} from "@/server/actions/course-schedule-enrollment";
import {courseCardScheduleIssue,courseCardScheduleRows} from "@/lib/course-card-schedule-issue";
import {parseTaipeiDateTime,toLocalDateStr} from "@/lib/date-utils";
import {usePanelReader} from "@/components/operations/panel-read-cache";
export type ScheduleLearner={customerId:string;cardId:string;name:string;trialPrice?:number;participantPhone?:string};
type Card=Extract<Awaited<ReturnType<typeof loadCourseScheduleEnrollmentOptions>>,{success:true}>["cards"][number];
export function CourseScheduleLearners({templateId,pointCost,capacity,value,onChange,disabled=false,scope="",occurrenceCount=1,onValidityChange,trialMode=false,canCreateCustomer=false,onPendingChange,onDraftChange,allowDeferred=false,showCapacity=true,useConfiguredTrialPrice=false,scheduleDate,scheduleTime,scheduleDates}:{scheduleDates?:string[];scheduleTime?:string;scheduleDate?:string;useConfiguredTrialPrice?:boolean;allowDeferred?:boolean;showCapacity?:boolean;onDraftChange?:(dirty:boolean)=>void;onPendingChange?:(pending:boolean)=>void;trialMode?:boolean;canCreateCustomer?:boolean;templateId:string;pointCost:number;capacity:number;value:ScheduleLearner[];onChange:(value:ScheduleLearner[])=>void;disabled?:boolean;scope?:string;occurrenceCount?:number;onValidityChange?:(valid:boolean)=>void}) {
  const resolvedTemplate=useRef<string|null>(null);
  const reader=usePanelReader("course-schedule-learners",loadCourseScheduleEnrollmentOptions,scope,0);
  const [cards,setCards]=useState<Card[]>([]);
  const [customers,setCustomers]=useState<{id:string;name:string;phone:string}[]>([]);
  const [trial,setTrial]=useState({enabled:false,price:0});
  const [newCustomer,setNewCustomer]=useState(false);
  const [supplementKey,setSupplementKey]=useState<string|null>(null);
  const [newName,setNewName]=useState("");
  const [newPhone,setNewPhone]=useState("");
  const [createError,setCreateError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{onDraftChange?.(!!newName||!!newPhone);return()=>onDraftChange?.(false);},[newName,newPhone,onDraftChange]);
  const [creating,startCreate]=useTransition();
  useEffect(()=>{onPendingChange?.(creating);return()=>onPendingChange?.(false);},[creating,onPendingChange]);
  const [query,setQuery]=useState("");
  const [error,setError]=useState<{templateId:string;message:string}|null>(null);
  const [loadedTemplate,setLoadedTemplate]=useState<string|null>(null);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    reader.read(templateId).then(result=>{if(!active)return;if(result.success){setCards(result.cards);setCustomers(result.customers??[]);setTrial(result.trialSettings??{enabled:false,price:0});setLoadedTemplate(templateId);setError(null);}else setError({templateId,message:result.error??"學員讀取失敗"});}).catch(()=>{if(active)setError({templateId,message:"學員讀取失敗"});});
    return()=>{active=false;};
  },[reader,templateId,retry]);
  const scheduledAt=scheduleDate?parseTaipeiDateTime(scheduleDate,scheduleTime??"00:00"):null;
  const requiredFor=(card:Card)=>(allowDeferred?1:occurrenceCount)*(card.unit==="SESSION"?1:pointCost);
  const cardIssue=(card:Card,required=requiredFor(card))=>courseCardScheduleIssue(card,scheduledAt,required);
  const cardCoversDate=(card:Card)=>!cardIssue(card);
  const ready=loadedTemplate===templateId;
  useEffect(()=>{
    if(!ready||!trialMode||!useConfiguredTrialPrice)return;
    if(value.some(row=>!row.cardId&&row.trialPrice!==trial.price))onChange(value.map(row=>!row.cardId?{...row,trialPrice:trial.price}:row));
  },[ready,trialMode,useConfiguredTrialPrice,trial.price,value,onChange]);
  // Resolve the pre-course learner selection once per course, preserving later manual choices.
  useEffect(()=>{
    if(!ready||!templateId||!allowDeferred||trialMode||resolvedTemplate.current===`${templateId}:${scheduleDate??""}:${scheduleTime??""}`)return;
    resolvedTemplate.current=`${templateId}:${scheduleDate??""}:${scheduleTime??""}`;
    const used=new Set<string>();
    const next=value.map(row=>{
      const eligible=cards.filter(card=>!used.has(card.id)&&cardCoversDate(card)&&card.members.some(member=>member.id===row.customerId));
      const chosen=eligible.find(card=>card.id===row.cardId)??eligible[0]??cards.find(card=>card.subjectMatches!==false&&card.members.some(member=>member.id===row.customerId))??cards.find(card=>card.members.some(member=>member.id===row.customerId));
      if(chosen)used.add(chosen.id);
      return {...row,cardId:chosen?.id??"",trialPrice:undefined};
    });
    if(next.some((row,index)=>row.cardId!==value[index].cardId||value[index].trialPrice!==undefined))onChange(next);
  },[ready,templateId,allowDeferred,trialMode,cards,value,onChange,scheduleDate,scheduleTime]);
  const available=ready?cards.filter(card=>cardCoversDate(card)&&card.available>=requiredFor(card)):[];
  const totalRequired=(card:Card)=>value.filter(row=>row.cardId===card.id).length*requiredFor(card);
  const enrollmentValid=value.length<=capacity&&(!allowDeferred||new Set(value.filter(row=>row.cardId).map(row=>row.cardId)).size===value.filter(row=>row.cardId).length)&&value.every(row=>{
    if(!row.cardId)return ready&&((allowDeferred&&!trialMode&&row.trialPrice===undefined)||trial.enabled&&Number.isInteger(row.trialPrice)&&row.trialPrice!>=0);
    const card=cards.find(item=>item.id===row.cardId&&item.members.some(member=>member.id===row.customerId));
    return !ready?false:!!card&&cardCoversDate(card)&&!cardIssue(card,allowDeferred?requiredFor(card):totalRequired(card));
  });
  useEffect(()=>{onValidityChange?.(enrollmentValid);},[enrollmentValid,onValidityChange]);
  const people=[...new Map([...customers.map(person=>[person.id,person] as const),...available.flatMap(card=>card.members.filter(member=>member.id).map(member=>[member.id!,{id:member.id!,name:member.name,phone:member.phone}] as const))]).values()];
  const matches=query.trim()?people.filter(person=>!value.some(row=>row.customerId===person.id)&&(person.name.includes(query.trim())||person.phone.includes(query.trim()))).slice(0,30):[];
  return <section aria-label="排課學員" className="col-span-full min-w-0 space-y-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-x-2"><strong>加入學員</strong><span>{value.length}{showCapacity?` / ${capacity}`:""} 人{occurrenceCount>1?` · 共 ${occurrenceCount} 堂`:""}</span></div>
    {value.map(row=>{const memberCards=cards.filter(card=>card.members.some(member=>member.id===row.customerId));const selectedCard=memberCards.find(card=>card.id===row.cardId);const enough=row.cardId?!!selectedCard&&cardCoversDate(selectedCard)&&!cardIssue(selectedCard,allowDeferred?requiredFor(selectedCard):totalRequired(selectedCard)):(allowDeferred&&!trialMode&&row.trialPrice===undefined)||trial.enabled&&row.trialPrice!==undefined;return <div key={row.customerId} className="flex flex-wrap items-center gap-2 rounded-lg bg-earth-50 px-3 py-1">
      <strong className="min-w-0 max-w-full flex-[1_0_8rem] break-words">{row.name}</strong>
      {allowDeferred&&!trialMode&&(!templateId||!ready)?<span className="text-earth-600">{templateId?"正在確認適用方案…":"選課後確認適用方案"}</span>:!row.cardId&&allowDeferred&&!trialMode?<span className="text-amber-800">{memberCards.some(card=>cardCoversDate(card))?"之後個別繳費 · 可先排課":"無適用方案 · 可先排課，之後繳費"}</span>:!row.cardId&&trial.enabled&&row.trialPrice!==undefined?<span className="text-earth-600">{templateId&&ready?`體驗 · $${row.trialPrice??trial.price} · 僅本堂`:"選課後確認體驗費用"}</span>:!allowDeferred&&memberCards.length===1&&enough?<span className="min-w-0 break-words text-earth-600">{selectedCard!.name} · 可用 {selectedCard!.available}{occurrenceCount>1?` · 本次需 ${requiredFor(selectedCard!)}`:""}</span>:null}
      {ready&&templateId&&((allowDeferred&&!trialMode&&memberCards.length>0)||(!allowDeferred&&(row.cardId||!trial.enabled)&&!(memberCards.length===1&&enough)))&&<select aria-label={`${row.name}的方案`} className="min-h-11 min-w-0 max-w-full rounded-lg border border-earth-200 bg-white px-2" disabled={disabled} value={row.cardId} onChange={event=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:event.target.value,trialPrice:event.target.value||allowDeferred&&!trialMode?undefined:trial.price}:item))}>
        {allowDeferred&&!trialMode?<option value="">之後個別繳費</option>:!selectedCard&&<option disabled value={row.cardId}>請選方案</option>}
        {memberCards.map(card=><option key={card.id} value={card.id} disabled={!cardCoversDate(card)||card.available<requiredFor(card)||allowDeferred&&value.some(other=>other.customerId!==row.customerId&&other.cardId===card.id)}>{card.name} · {cardIssue(card)?cardIssue(card)!.label:`可用 ${card.available} · 首堂需 ${requiredFor(card)}`}</option>)}
      </select>}
      {ready&&selectedCard&&cardIssue(selectedCard,allowDeferred?requiredFor(selectedCard):totalRequired(selectedCard))&&<p role="alert" className="w-full break-words text-red-700">{cardIssue(selectedCard,allowDeferred?requiredFor(selectedCard):totalRequired(selectedCard))?.message}</p>}
      {ready&&templateId&&allowDeferred&&!trialMode&&scheduleDates&&scheduleDates.length>1&&<div className="w-full" aria-label={`${row.name}逐堂檢查`} aria-live="polite">
        <div className="grid grid-cols-[7rem_1fr] gap-x-2 border-b border-earth-200 py-1 font-medium"><span>日期</span><span>課卡使用</span></div>
        {courseCardScheduleRows(selectedCard??null,scheduleDates,scheduleTime??"00:00",selectedCard?.unit==="SESSION"?1:pointCost).map(lesson=><div key={lesson.date} className={`grid grid-cols-[7rem_1fr] gap-x-2 py-1 ${lesson.covered?"text-earth-700":"text-amber-800"}`}><span>{lesson.date}</span><span>{lesson.covered?"占用 1 堂・點名後扣堂":`${lesson.reason}・待繳費，不扣堂`}</span></div>)}
      </div>}
      {ready&&templateId&&selectedCard?.expiresAt&&!cardIssue(selectedCard)&&<span className="w-full break-words text-earth-600">{selectedCard.musicValidityDays&&!selectedCard.musicActivatedAt?`首次扣堂起 ${selectedCard.musicValidityDays} 天`:`有效至 ${toLocalDateStr(new Date(selectedCard.expiresAt))}`}{allowDeferred?"；後續超過額度或期限的課程另行繳費。":""}</span>}
      {canCreateCustomer&&row.customerId.startsWith("trial-draft:")&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled||creating} onClick={()=>{setSupplementKey(row.customerId);setNewCustomer(true);setNewName("");setNewPhone("");setCreateError("");setQuery("");}}>補資料</button>}
      <button type="button" aria-label={`移除${row.name}`} disabled={disabled} className="min-h-11 min-w-11" onClick={()=>onChange(value.filter(item=>item.customerId!==row.customerId))}>×</button>
      {!allowDeferred&&trial.enabled&&(row.cardId||row.trialPrice===undefined)&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled} onClick={()=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:"",trialPrice:trial.price}:item))}>{row.cardId?"改為體驗":"設為體驗"}</button>}
      {!allowDeferred&&!trialMode&&!row.cardId&&memberCards.length>0&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled} onClick={()=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:memberCards[0].id,trialPrice:undefined}:item))}>使用方案</button>}
      {!enough&&!(selectedCard&&cardIssue(selectedCard,allowDeferred?requiredFor(selectedCard):totalRequired(selectedCard)))&&<p role="alert" className="w-full text-red-700">{!row.cardId&&row.trialPrice===undefined?"請選方案或體驗。":"請確認方案與可用額度。"}</p>}
    </div>;})}
    <input aria-label="搜尋排課學員" placeholder={value.length>=capacity?"已滿":ready?"姓名或電話":"讀取中…"} className="min-h-11 min-w-0 max-w-full w-full rounded-xl border border-earth-200 px-3" value={query} disabled={disabled||!ready||value.length>=capacity} onChange={event=>setQuery(event.target.value)}/>
    {!newCustomer&&matches.length>0&&<div className="max-h-48 overflow-y-auto rounded-lg border border-earth-200">{matches.map(person=><button key={person.id} type="button" className="flex min-h-11 w-full items-center justify-between border-b border-earth-100 px-3 text-left" disabled={disabled||value.length>=capacity} onClick={()=>{const card=!trialMode?(available.find(card=>card.members.some(member=>member.id===person.id))??(allowDeferred?cards.find(card=>card.members.some(member=>member.id===person.id)):undefined)):undefined;onChange([...value,{customerId:person.id,cardId:card?.id??"",name:person.name,...(!card&&trialMode?{trialPrice:trial.price}:{})}]);setQuery("");}}>{person.name}<span className="ml-auto text-earth-500">{person.phone.slice(-3)}</span><span className="ml-2">＋</span></button>)}</div>}
    {ready&&query.trim()&&!matches.length&&<p className="text-earth-600">沒有符合的學員</p>}
    {trialMode&&trial.enabled&&value.length<capacity&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled||creating} onClick={()=>onChange([...value,{customerId:`trial-draft:${crypto.randomUUID()}`,cardId:"",name:`體驗者 ${Math.max(0,...value.map(p=>Number(p.name.match(/^體驗者\s*(\d+)$/)?.[1])||0))+1}`,trialPrice:trial.price}])}>＋體驗者</button>}
    {canCreateCustomer&&value.length<capacity&&<button type="button" disabled={disabled||creating} className="min-h-11 text-primary-700" onClick={()=>{setSupplementKey(null);setNewCustomer(v=>!v);setCreateError("");const text=query.trim();if(/^[+\d\s()-]+$/.test(text)){setNewPhone(text);setNewName("");}else{setNewName(text);setNewPhone("");}setQuery("");}}>＋建立新學員</button>}
    {newCustomer&&<div className="grid grid-cols-2 gap-2 [&>label]:min-w-0 rounded-lg border border-earth-200 p-3">
      <label>姓名<input aria-label="新學員姓名" className="min-h-11 w-full min-w-0 rounded-lg border px-2" value={newName} disabled={creating||disabled} onChange={e=>setNewName(e.target.value)}/></label>
      <label>手機<input aria-label="新學員手機" type="tel" className="min-h-11 w-full min-w-0 rounded-lg border px-2" value={newPhone} disabled={creating||disabled} onChange={e=>setNewPhone(e.target.value)}/></label>
      <button type="button" className="col-span-2 min-h-11 text-primary-700" disabled={creating||disabled||!newName.trim()||!newPhone.trim()} onClick={()=>startCreate(async()=>{
        setCreateError("");
        try{const result=await createScheduleCustomer({name:newName,phone:newPhone});if(!result.success){setCreateError(result.error??"新增失敗");return;}
        const person=result.customer;setCustomers(rows=>[...rows.filter(row=>row.id!==person.id),person]);
        if(supplementKey){
          if(value.some(row=>row.customerId===person.id&&row.customerId!==supplementKey)){setCreateError("此學員已在名單，請核對同行者");return;}
          onChange(value.map(row=>row.customerId===supplementKey?{...row,customerId:person.id,name:person.name}:row));
        }else if(!value.some(row=>row.customerId===person.id)){const card=!trialMode?(available.find(card=>card.members.some(member=>member.id===person.id))??(allowDeferred?cards.find(card=>card.members.some(member=>member.id===person.id)):undefined)):undefined;onChange([...value,{customerId:person.id,name:person.name,cardId:card?.id??"",...(!card&&trialMode?{trialPrice:trial.price}:{})}]);}
        setNotice(person.existing?"此手機已有學員，已帶入原資料":"學員已建檔");setNewCustomer(false);setSupplementKey(null);setNewName("");setNewPhone("");
        }catch{setCreateError("連線失敗，請重試");}
      })}>{creating?"儲存中…":supplementKey?"儲存資料":"建立並加入"}</button>
      {createError&&<p role="alert" className="col-span-2 text-red-700">{createError}</p>}
    </div>}
    {notice&&<p role="status" className="text-primary-700">{notice}</p>}
    {error?.templateId===templateId&&<p role="alert" className="text-red-700">{error.message}<button type="button" className="ml-2 min-h-11 underline" onClick={()=>{reader.invalidate(templateId);setRetry(count=>count+1);}}>重試</button></p>}
  </section>;
}
