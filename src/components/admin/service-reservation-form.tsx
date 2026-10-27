"use client";
import {serviceDuration} from "@/lib/beauty/service-duration";
import {useEffect,useRef,useState} from 'react';
import {useCourseDraftGuard} from './use-course-draft-guard';
import {CourseOptionSelect} from './course-option-select';
import {formatTWDateTime,parseTaipeiDateTime,toLocalDateStr} from '@/lib/date-utils';
import type {PartyInput} from '@/lib/beauty/contracts';

export type ReservationCustomer={id:string;name:string;phone:string};
export type ReservationCard={id:string;name:string;memberIds:string[];serviceIds:string[];remaining:number;held:number;expiresAt:string;closedAt:string|null;allowShared?:boolean};
export type ReservationArrangement={technicianId:string;technicianName:string;locationId:string;locationName:string};
type Availability={slots:string[];arrangement?:ReservationArrangement[]|null;arrangementError?:string};
export type ServiceReservationSource={
 services:{id:string;name:string;duration:number;trialDuration?:number|null;buffer:number;price:number;trialPrice:number|null;revision:number}[];
 technicians:{id:string;name:string;serviceIds:string[]}[];
 locations:{id:string;name:string}[];customers:ReservationCustomer[];cards:ReservationCard[];policyRevision:number;
 readAvailability:(intent:PartyInput)=>Promise<{success:true;data:Availability}|{success:false;error:string}>;
 submit:(intent:PartyInput)=>Promise<{success:boolean;error?:string;data?:{ids:string[]}}>;
 createCustomer?: (input:{name:string;phone:string})=>Promise<{success:true;customer:ReservationCustomer}|{success:false;error:string}>;
 maxPeople?:number;
 itemEntitlements?:boolean;
};
type Person={key:string;customerId:string;serviceId:string;cardId?:string;query?:string;notes:string;technicianId:string;locationId:string};
const field='min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
const trialValue='__trial__';

/** Shared schedule service mode: all authoritative allocation and financial rules stay in the supplied core. */
export function ServiceReservationForm({source,date:initialDate,seed={},onGuard,onCreated}:{source:ServiceReservationSource;date:string;seed?:{time?:string;coachId?:string;roomId?:string;customerId?:string};onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void}){
 const [date,setDate]=useState(initialDate),[time,setTime]=useState(seed.time??'09:00');
 const initialService=source.services.find(s=>!seed.coachId||source.technicians.find(t=>t.id===seed.coachId)?.serviceIds.includes(s.id))?.id??source.services[0]?.id??'';
 const [people,setPeople]=useState<Person[]>(()=>[{key:crypto.randomUUID(),customerId:seed.customerId??'',serviceId:initialService,notes:'',technicianId:seed.coachId??'',locationId:seed.roomId??source.locations[0]?.id??''}]);
 const [customers,setCustomers]=useState(source.customers),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const [adding,setAdding]=useState<string|null>(null),[name,setName]=useState(''),[phone,setPhone]=useState(''),[creating,setCreating]=useState(false),[createError,setCreateError]=useState('');
 const [retry,setRetry]=useState(0);
 const [availability,setAvailability]=useState<(Availability&{key:string;error?:string})|null>(null);
 useCourseDraftGuard(dirty,pending||creating);
 const ports=useRef(source);ports.current=source;
 const request=useRef(crypto.randomUUID()),version=useRef(0),lock=useRef(false),createLock=useRef(false),submitted=useRef<PartyInput|null>(null);
 useEffect(()=>{onGuard(dirty,pending||creating);return()=>onGuard(false,false);},[dirty,pending,creating,onGuard]);
 function change(work:()=>void){if(lock.current||createLock.current)return;request.current=crypto.randomUUID();submitted.current=null;setDirty(true);setError('');work();}
 function update(key:string,patch:Partial<Person>){change(()=>setPeople(rows=>rows.map(p=>p.key===key?{...p,...patch}:p)));}
 const at=parseTaipeiDateTime(date,time);
 function eligible(card:ReservationCard,p:Person,index:number){return !card.closedAt&&!!at&&new Date(card.expiresAt)>at&&card.serviceIds.includes(p.serviceId)&&(p.customerId?card.memberIds.includes(p.customerId):index>0&&card.allowShared===true&&card.memberIds.includes(people[0]?.customerId));}
 const orderedCards=[...source.cards].sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt)||a.id.localeCompare(b.id));
 // Explicit choices keep their quota; automatic defaults share the remaining capacity across the whole party.
 const used=new Map<string,number>();
 for(const p of people)if(p.cardId&&p.cardId!==trialValue)used.set(p.cardId,(used.get(p.cardId)??0)+1);
 const charges=people.map((p,i)=>{
  if(source.itemEntitlements)return p.cardId===trialValue?trialValue:"";
  if(p.cardId!==undefined)return p.cardId;
  const card=orderedCards.find(c=>eligible(c,p,i)&&c.remaining-c.held>(used.get(c.id)??0));
  if(card)used.set(card.id,(used.get(card.id)??0)+1);
  return card?.id??'';
 });
 function cardsFor(p:Person,i:number){return orderedCards.filter(c=>eligible(c,p,i)&&c.remaining-c.held>(used.get(c.id)??0)-(charges[i]===c.id?1:0));}
 const resolved=people.map((p,i)=>{const service=source.services.find(s=>s.id===p.serviceId);return {p,customer:customers.find(c=>c.id===p.customerId),service:service?{...service,duration:serviceDuration(service,charges[i]===trialValue)}:undefined,charge:charges[i]};});
 const issues=resolved.map(({p,customer,service,charge},i)=>{
  if(i===0&&!customer)return '請選擇第 1 位顧客';
  if(p.query?.trim()&&!customer)return '請選擇搜尋結果，或清空姓名以資料後補';
  if(p.customerId&&!customer)return '顧客已更新，請重新選擇';
  if(customer&&!/^09\d{8}$/.test(customer.phone))return '請先至顧客管理補齊有效手機';
  const duplicate=p.customerId?people.findIndex((q,j)=>j!==i&&q.customerId===p.customerId):-1;
  if(duplicate>=0)return `顧客已選為第 ${duplicate+1} 位`;
  if(charge===trialValue&&!customer)return '體驗須先補齊顧客身分，請先選擇或新增顧客';
  if(!service||charge===trialValue&&service.trialPrice==null)return '請選擇適用的服務項目';
  if(p.technicianId&&!source.technicians.some(t=>t.id===p.technicianId&&t.serviceIds.includes(service.id)))return '目前技師不適用此服務，請重新選擇';
  if(p.locationId&&!source.locations.some(r=>r.id===p.locationId))return '原位置已停用，請重新選擇';
  const roomConflict=p.locationId?people.findIndex((q,j)=>j!==i&&q.locationId===p.locationId):-1;
  if(roomConflict>=0)return `位置與第 ${roomConflict+1} 位重複，請調整此位位置`;
  const techConflict=p.technicianId?people.findIndex((q,j)=>j!==i&&q.technicianId===p.technicianId):-1;
  if(techConflict>=0)return `技師與第 ${techConflict+1} 位重複，請調整此位技師`;
  if(charge&&charge!==trialValue){const c=source.cards.find(c=>c.id===charge);if(!c||!eligible(c,p,i))return '此方案不適用或已到期，請重新選擇';if(c.remaining-c.held<(used.get(c.id)??0))return '本次合計使用超過方案可用次數';}
  return '';
 });
 const dateIssue=!at?'請選擇日期及時間':date<toLocalDateStr()?'此日期已過，請選擇其他日期':'';
 const valid=!dateIssue&&!issues.some(Boolean)&&!!people.length;
 const intent:PartyInput={requestKey:request.current,policyRevision:source.policyRevision,date,time,contactName:resolved[0]?.customer?.name??'',phone:resolved[0]?.customer?.phone??'',isTrial:false,people:resolved.map(({p,customer,service,charge},i)=>({customerId:customer?.id??null,name:customer?.name??`同行者 ${i}`,phone:customer?.phone??'',pendingIdentity:i>0&&!customer,isTrial:charge===trialValue,serviceId:p.serviceId,serviceRevision:service?.revision??0,preference:'ANY',specifiedTechnicianId:p.technicianId||null,specifiedLocationId:p.locationId||null,cardId:charge===trialValue?null:charge||null,notes:p.notes}))};
 const availabilityKey=JSON.stringify({...intent,requestKey:'',people:intent.people.map(p=>({...p,notes:''}))});
 useEffect(()=>{
  const generation=++version.current;
  if(!valid)return;
  let active=true;
  const timer=setTimeout(async()=>{
   try{const result=await ports.current.readAvailability({...JSON.parse(availabilityKey),requestKey:request.current});if(!active||generation!==version.current)return;setAvailability(result.success?{key:availabilityKey,...result.data}:{key:availabilityKey,slots:[],error:result.error});}
   catch{if(active&&generation===version.current)setAvailability({key:availabilityKey,slots:[],error:'無法確認時段，請重試'});}
  },350);
  return()=>{active=false;clearTimeout(timer);};
 },[availabilityKey,valid,retry]);
 const checked=availability?.key===availabilityKey;
 const arranged=checked?availability.arrangement:null;
 const available=checked&&availability.slots.includes(time)&&arranged?.length===people.length;
 const checking=valid&&!checked;
 const due=resolved.reduce((sum,{service,charge})=>sum+(charge===trialValue?service?.trialPrice??0:charge?0:service?.price??0),0),uses=charges.filter(c=>c&&c!==trialValue).length;
 const end=(minutes:number)=>{if(!at)return '—';const endsAt=new Date(at.getTime()+minutes*60000);return (toLocalDateStr(endsAt)!==date?'次日 ':'')+formatTWDateTime(endsAt).slice(11);};
 async function createCustomer(key:string){
  if(!source.createCustomer||createLock.current||lock.current)return;
  createLock.current=true;setCreating(true);setCreateError('');
  try{const r=await source.createCustomer({name,phone});if(!r.success){setCreateError(r.error);return;}setCustomers(rows=>[...rows.filter(c=>c.id!==r.customer.id),r.customer]);setPeople(rows=>rows.map(p=>p.key===key?{...p,customerId:r.customer.id,cardId:undefined,query:''}:p));request.current=crypto.randomUUID();submitted.current=null;setDirty(true);setAdding(null);setName('');setPhone('');}
  catch{setCreateError('新增結果尚未確認，請先用電話搜尋核對');}
  finally{createLock.current=false;setCreating(false);}
 }
 return <form className="@container/reservation flex min-h-0 flex-col text-sm" onSubmit={async event=>{
  event.preventDefault();if(lock.current||creating||!valid||!available)return;
  lock.current=true;setPending(true);setError('');
  submitted.current??={...intent,expectedArrangement:arranged!.map(({technicianId,locationId})=>({technicianId,locationId}))};
  try{const r=await source.submit(submitted.current);if(!r.success){setError(r.error??'尚未完成預約');submitted.current=null;request.current=crypto.randomUUID();setAvailability(null);setRetry(v=>v+1);return;}setDirty(false);onCreated(date);}
  catch{setError('送出結果尚未確認，請保留資料重試');}
  finally{lock.current=false;setPending(false);}
 }}>
  <fieldset disabled={pending||creating} className="min-w-0 space-y-2">
   <div className="grid min-w-0 grid-cols-2 gap-2 rounded-lg bg-primary-50/60 p-2">
    <label>日期<input aria-label="預約日期" className={field} type="date" min={toLocalDateStr()} required value={date} onChange={e=>change(()=>setDate(e.target.value))}/></label>
    <label>開始時間<input aria-label="預約開始時間" className={field} type="time" step="60" required value={time} onChange={e=>change(()=>setTime(e.target.value))}/></label>
   </div>
   {resolved.map(({p,customer,service,charge},index)=><section key={p.key} aria-label={`第${index+1}位預約`} className="space-y-1 border-b border-earth-100 pb-2">
    <div className="flex items-center justify-between"><h3 className="font-medium">{index===0?'顧客':`同行者 ${index}`}</h3>{index>0&&<button type="button" className="min-h-11 px-2 text-earth-600" onClick={()=>change(()=>setPeople(rows=>rows.filter(row=>row.key!==p.key)))}>移除同行者 {index}</button>}</div>
    <div className="grid min-w-0 gap-2 @min-[28rem]/reservation:grid-cols-2 @min-[40rem]/reservation:grid-cols-3 @min-[52rem]/reservation:grid-cols-[1.3fr_1.1fr_1.2fr_1fr_1fr]">
     <div className="min-w-0"><label>姓名<CourseOptionSelect searchable required={index===0} label={`顧客姓名 ${index+1}`} placeholder={index===0?'搜尋姓名／電話':'同行者資料後補'} onCreate={source.createCustomer?query=>{setAdding(p.key);setCreateError('');setName(/^[\d\s-]+$/.test(query)?'':query);setPhone(/^[\d\s-]+$/.test(query)?query.replace(/\D/g,''):'');setDirty(true);}:undefined} value={p.customerId} onSearchChange={query=>update(p.key,{customerId:'',cardId:undefined,query})} onChange={id=>update(p.key,{customerId:id,cardId:undefined,query:''})} options={customers.map(c=>{const other=people.findIndex((q,j)=>j!==index&&q.customerId===c.id);return {id:c.id,label:`${c.name} · ${c.phone}${other>=0?`（已選為第 ${other+1} 位）`:''}`,disabled:other>=0};})}/></label></div>
     <label>服務項目<select aria-label={`服務項目 ${index+1}`} className={field} required value={p.serviceId} onChange={e=>update(p.key,{serviceId:e.target.value,cardId:undefined})}>{source.services.map(s=><option key={s.id} value={s.id}>{s.name} · {charges[index]===trialValue?'體驗 ':''}{serviceDuration(s,charges[index]===trialValue)} 分鐘</option>)}</select></label>
     {source.itemEntitlements?<div><label>服務類型<select aria-label={`服務類型 ${index+1}`} className={field} value={charge===trialValue?trialValue:''} onChange={e=>update(p.key,{cardId:e.target.value})}><option value="">一般服務</option>{service?.trialPrice!=null&&<option value={trialValue} disabled={!customer}>體驗</option>}</select></label><p className="py-1 text-earth-600">本期剩餘 {source.cards.filter(c=>eligible(c,p,index)).reduce((n,c)=>n+Math.max(0,c.remaining),0)} 次；完成服務時先買先扣，無方案可先安排。</p></div>:<label>使用方案<select aria-label={`使用方案 ${index+1}`} className={field} disabled={index===0&&!customer} value={charge} onChange={e=>update(p.key,{cardId:e.target.value})}>{charge&&charge!==trialValue&&!cardsFor(p,index).some(c=>c.id===charge)&&<option value={charge}>{source.cards.find(c=>c.id===charge)?.name??'原方案'}（請重新核對）</option>}{cardsFor(p,index).map(c=><option key={c.id} value={c.id}>{c.name} · 可用 {c.remaining-c.held} 次 · {toLocalDateStr(new Date(c.expiresAt))} 到期</option>)}<option value="">單次付款 · NT$ {(service?.price??0).toLocaleString()}</option>{service?.trialPrice!=null&&<option value={trialValue} disabled={!customer}>體驗 · NT$ {service.trialPrice.toLocaleString()}{!customer?'（補齊顧客資料後安排）':''}</option>}</select></label>}
     <label>位置<select aria-label={`此位位置 ${index+1}`} className={field} value={p.locationId} onChange={e=>update(p.key,{locationId:e.target.value})}><option value="">{arranged?.[index]?`自動 · ${arranged[index].locationName}`:'自動安排'}</option>{p.locationId&&!source.locations.some(r=>r.id===p.locationId)&&<option value={p.locationId}>原位置已停用，請重選</option>}{source.locations.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
     <label>技師<select aria-label={`此位技師 ${index+1}`} className={field} value={p.technicianId} onChange={e=>update(p.key,{technicianId:e.target.value})}><option value="">{arranged?.[index]?`自動 · ${arranged[index].technicianName}`:'自動安排'}</option>{p.technicianId&&!source.technicians.some(t=>t.id===p.technicianId&&t.serviceIds.includes(p.serviceId))&&<option value={p.technicianId}>原技師不適用，請重選</option>}{source.technicians.filter(t=>t.serviceIds.includes(p.serviceId)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    </div>
    {adding===p.key&&<div className="grid gap-2 rounded-lg bg-earth-50 p-2 @min-[28rem]/reservation:grid-cols-3"><label>新增顧客姓名<input aria-label="新增顧客姓名" className={field} value={name} onChange={e=>{setName(e.target.value);setDirty(true);}}/></label><label>新增顧客電話<input aria-label="新增顧客電話" className={field} type="tel" value={phone} onChange={e=>{setPhone(e.target.value);setDirty(true);}}/></label><div className="flex items-end gap-2"><button type="button" disabled={!name.trim()||!/^09\d{8}$/.test(phone)||creating} className={button+' self-end'} onClick={()=>void createCustomer(p.key)}>建立並選用</button><button type="button" className={button} onClick={()=>setAdding(null)}>取消新增</button></div>{createError&&<p role="alert" className="col-span-full text-red-700">{createError}</p>}</div>}
    <div className="flex flex-wrap items-center gap-x-4 text-earth-700"><strong className="text-primary-900" aria-label={`服務時段 ${index+1}`}>{time}–{end(service?.duration??0)} · {service?.duration??0} 分鐘</strong>{!!service?.buffer&&<span>整理至 {end(service.duration+service.buffer)}</span>}<details className="min-w-0"><summary className="min-h-11 cursor-pointer py-3 text-primary-800">備註{p.notes?'（已填寫）':''}</summary><input aria-label={`本次備註 ${index+1}`} className={field} maxLength={1000} value={p.notes} onChange={e=>update(p.key,{notes:e.target.value})}/></details></div>
    {issues[index]&&(p.customerId||index>0)&&<p role="alert" className="text-red-700">第 {index+1} 位：{issues[index]}</p>}
   </section>)}
   {source.maxPeople!==1&&<button type="button" className={button} disabled={people.length>=Math.min(12,source.maxPeople??12)} onClick={()=>change(()=>setPeople(rows=>[...rows,{key:crypto.randomUUID(),customerId:'',serviceId:rows[0]?.serviceId??initialService,notes:'',technicianId:'',locationId:''}]))}>＋新增同行者</button>}
  </fieldset>
  <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-earth-200 bg-white py-2" aria-label="預約確認摘要">
   <div className="min-w-0"><p>{people.length} 位 · 方案使用 {uses} 次 · 應收 NT$ {due.toLocaleString()}</p><p role="status" className="text-sm text-earth-600">{dateIssue||issues.find(Boolean)||(checking?'正在核對時段…':checked?availability.error??(available?'目前時段可安排':availability.arrangementError??'此時段無法安排全部顧客，請調整時間、技師或位置'):'請選定顧客及服務')}</p>{checked&&!available&&availability.slots.length>0&&<div className="flex flex-wrap gap-2 py-1">可用時段：{availability.slots.filter(s=>s!==time).sort((a,b)=>Math.abs(+parseTaipeiDateTime(date,a)!-+at!)-Math.abs(+parseTaipeiDateTime(date,b)!-+at!)).slice(0,3).sort().map(s=><button key={s} type="button" className={button} disabled={pending||creating} onClick={()=>change(()=>setTime(s))}>{s}</button>)}</div>}{checked&&availability.error&&<button type="button" className={button} onClick={()=>{setAvailability(null);setRetry(v=>v+1);}}>重新核對時段</button>}{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
   <button className={button+' bg-primary-700 text-white'} disabled={pending||creating||!valid||!available}>{pending?'確認中…':'確認預約'}</button>
  </div>
 </form>;
}
