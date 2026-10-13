"use client";
import {useEffect,useState,useTransition} from "react";
import {loadCourseScheduleEnrollmentOptions,createScheduleCustomer} from "@/server/actions/course-schedule-enrollment";
import {usePanelReader} from "@/components/operations/panel-read-cache";
export type ScheduleLearner={customerId:string;cardId:string;name:string;trialPrice?:number};
type Card=Extract<Awaited<ReturnType<typeof loadCourseScheduleEnrollmentOptions>>,{success:true}>["cards"][number];
export function CourseScheduleLearners({templateId,pointCost,capacity,value,onChange,disabled=false,scope="",occurrenceCount=1,onValidityChange,trialMode=false,canCreateCustomer=false,onPendingChange,onDraftChange}:{onDraftChange?:(dirty:boolean)=>void;onPendingChange?:(pending:boolean)=>void;trialMode?:boolean;canCreateCustomer?:boolean;templateId:string;pointCost:number;capacity:number;value:ScheduleLearner[];onChange:(value:ScheduleLearner[])=>void;disabled?:boolean;scope?:string;occurrenceCount?:number;onValidityChange?:(valid:boolean)=>void}) {
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
  const [loadedTemplate,setLoadedTemplate]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    reader.read(templateId).then(result=>{if(!active)return;if(result.success){setCards(result.cards);setCustomers(result.customers??[]);setTrial(result.trialSettings??{enabled:false,price:0});setLoadedTemplate(templateId);setError(null);}else setError({templateId,message:result.error??"學員讀取失敗"});}).catch(()=>{if(active)setError({templateId,message:"學員讀取失敗"});});
    return()=>{active=false;};
  },[reader,templateId,retry]);
  const ready=loadedTemplate===templateId;
  const requiredFor=(card:Card)=>occurrenceCount*(card.unit==="SESSION"?1:pointCost);
  const available=ready?cards.filter(card=>card.available>=requiredFor(card)):[];
  const totalRequired=(card:Card)=>value.filter(row=>row.cardId===card.id).length*requiredFor(card);
  const enrollmentValid=value.length<=capacity&&value.every(row=>{
    if(!row.cardId)return ready&&trial.enabled&&Number.isInteger(row.trialPrice)&&row.trialPrice!>=0;
    const card=cards.find(item=>item.id===row.cardId&&item.members.some(member=>member.id===row.customerId));
    return !ready?false:!!card&&card.available>=totalRequired(card);
  });
  useEffect(()=>{onValidityChange?.(enrollmentValid);},[enrollmentValid,onValidityChange]);
  const people=[...new Map([...customers.map(person=>[person.id,person] as const),...available.flatMap(card=>card.members.filter(member=>member.id).map(member=>[member.id!,{id:member.id!,name:member.name,phone:member.phone}] as const))]).values()];
  const matches=query.trim()?people.filter(person=>!value.some(row=>row.customerId===person.id)&&(person.name.includes(query.trim())||person.phone.includes(query.trim()))).slice(0,30):[];
  return <section aria-label="排課學員" className="col-span-full space-y-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-x-2"><strong>加入學員</strong><span>{value.length} / {capacity} 人{occurrenceCount>1?` · 共 ${occurrenceCount} 堂`:""}</span></div>
    {value.map(row=>{const memberCards=cards.filter(card=>card.members.some(member=>member.id===row.customerId));const selectedCard=memberCards.find(card=>card.id===row.cardId);const enough=row.cardId?!!selectedCard&&selectedCard.available>=totalRequired(selectedCard):trial.enabled&&row.trialPrice!==undefined;return <div key={row.customerId} className="flex flex-wrap items-center gap-2 rounded-lg bg-earth-50 px-3 py-1">
      <strong className="min-w-0 flex-1">{row.name}</strong>
      {!row.cardId&&trial.enabled&&row.trialPrice!==undefined?<span className="text-earth-600">體驗 · ${row.trialPrice??trial.price} · 僅本堂</span>:memberCards.length===1&&enough?<span className="min-w-0 break-words text-earth-600">{selectedCard!.name} · 可用 {selectedCard!.available}{occurrenceCount>1?` · 本次需 ${requiredFor(selectedCard!)}`:""}</span>:<select aria-label={`${row.name}的方案`} className="min-h-11 max-w-full rounded-lg border border-earth-200 bg-white px-2" disabled={disabled} value={row.cardId} onChange={event=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:event.target.value,trialPrice:event.target.value?undefined:trial.price}:item))}>
        {!selectedCard&&<option disabled value={row.cardId}>請選方案</option>}
        {memberCards.map(card=><option key={card.id} value={card.id} disabled={card.available<requiredFor(card)}>{card.name} · 可用 {card.available} · 本次需 {requiredFor(card)}</option>)}
      </select>}
      {canCreateCustomer&&row.customerId.startsWith("trial-draft:")&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled||creating} onClick={()=>{setSupplementKey(row.customerId);setNewCustomer(true);setNewName("");setNewPhone("");setCreateError("");setQuery("");}}>補資料</button>}
      <button type="button" aria-label={`移除${row.name}`} disabled={disabled} className="min-h-11 min-w-11" onClick={()=>onChange(value.filter(item=>item.customerId!==row.customerId))}>×</button>
      {trial.enabled&&(row.cardId||row.trialPrice===undefined)&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled} onClick={()=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:"",trialPrice:trial.price}:item))}>{row.cardId?"改為體驗":"設為體驗"}</button>}
      {!trialMode&&!row.cardId&&memberCards.length>0&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled} onClick={()=>onChange(value.map(item=>item.customerId===row.customerId?{...item,cardId:memberCards[0].id,trialPrice:undefined}:item))}>使用方案</button>}
      {!enough&&<p role="alert" className="w-full text-red-700">{!row.cardId&&row.trialPrice===undefined?"請選方案或體驗。":"請確認方案與可用額度。"}</p>}
    </div>;})}
    <input aria-label="搜尋排課學員" placeholder={value.length>=capacity?"已滿":ready?"姓名或電話":"讀取中…"} className="min-h-11 w-full rounded-xl border border-earth-200 px-3" value={query} disabled={disabled||!ready||value.length>=capacity} onChange={event=>setQuery(event.target.value)}/>
    {!newCustomer&&matches.length>0&&<div className="max-h-48 overflow-y-auto rounded-lg border border-earth-200">{matches.map(person=><button key={person.id} type="button" className="flex min-h-11 w-full items-center justify-between border-b border-earth-100 px-3 text-left" disabled={disabled||value.length>=capacity} onClick={()=>{const card=!trialMode?available.find(card=>card.members.some(member=>member.id===person.id)):undefined;onChange([...value,{customerId:person.id,cardId:card?.id??"",name:person.name,...(!card&&trialMode?{trialPrice:trial.price}:{})}]);setQuery("");}}>{person.name}<span className="ml-auto text-earth-500">{person.phone.slice(-3)}</span><span className="ml-2">＋</span></button>)}</div>}
    {ready&&query.trim()&&!matches.length&&<p className="text-earth-600">沒有符合的學員</p>}
    {trialMode&&trial.enabled&&value.length<capacity&&<button type="button" className="min-h-11 text-primary-700" disabled={disabled||creating} onClick={()=>onChange([...value,{customerId:`trial-draft:${crypto.randomUUID()}`,cardId:"",name:`體驗者 ${Math.max(0,...value.map(p=>Number(p.name.match(/^體驗者\s*(\d+)$/)?.[1])||0))+1}`,trialPrice:trial.price}])}>＋體驗者</button>}

    {newCustomer&&<div className="grid grid-cols-2 gap-2 rounded-lg border border-earth-200 p-3">
      <label>姓名<input aria-label="新學員姓名" className="min-h-11 w-full min-w-0 rounded-lg border px-2" value={newName} disabled={creating||disabled} onChange={e=>setNewName(e.target.value)}/></label>
      <label>手機<input aria-label="新學員手機" type="tel" className="min-h-11 w-full min-w-0 rounded-lg border px-2" value={newPhone} disabled={creating||disabled} onChange={e=>setNewPhone(e.target.value)}/></label>
      <button type="button" className="col-span-2 min-h-11 text-primary-700" disabled={creating||disabled||!newName.trim()||!newPhone.trim()} onClick={()=>startCreate(async()=>{
        setCreateError("");
        try{const result=await createScheduleCustomer({name:newName,phone:newPhone});if(!result.success){setCreateError(result.error??"新增失敗");return;}
        const person=result.customer;setCustomers(rows=>[...rows.filter(row=>row.id!==person.id),person]);
        if(supplementKey){
          if(value.some(row=>row.customerId===person.id&&row.customerId!==supplementKey)){setCreateError("此學員已在名單，請核對同行者");return;}
          onChange(value.map(row=>row.customerId===supplementKey?{...row,customerId:person.id,name:person.name}:row));
        }else if(!value.some(row=>row.customerId===person.id)){const card=!trialMode?available.find(card=>card.members.some(member=>member.id===person.id)):undefined;onChange([...value,{customerId:person.id,name:person.name,cardId:card?.id??"",...(!card&&trialMode?{trialPrice:trial.price}:{})}]);}
        setNotice(person.existing?"此手機已有學員，已帶入原資料":"學員已建檔");setNewCustomer(false);setSupplementKey(null);setNewName("");setNewPhone("");
        }catch{setCreateError("連線失敗，請重試");}
      })}>{creating?"儲存中…":supplementKey?"儲存資料":"建立並加入"}</button>
      {createError&&<p role="alert" className="col-span-2 text-red-700">{createError}</p>}
    </div>}
    {notice&&<p role="status" className="text-primary-700">{notice}</p>}
    {error?.templateId===templateId&&<p role="alert" className="text-red-700">{error.message}<button type="button" className="ml-2 min-h-11 underline" onClick={()=>{reader.invalidate(templateId);setRetry(count=>count+1);}}>重試</button></p>}
  </section>;
}
