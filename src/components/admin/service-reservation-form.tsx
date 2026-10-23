"use client";
import {useEffect,useRef,useState} from 'react';
import {useCourseDraftGuard} from './use-course-draft-guard';
import {CourseOptionSelect} from './course-option-select';
import {formatTWDateTime,parseTaipeiDateTime,toLocalDateStr} from '@/lib/date-utils';
import type {PartyInput} from '@/lib/beauty/contracts';

export type ReservationCustomer={id:string;name:string;phone:string};
export type ReservationCard={id:string;name:string;memberIds:string[];serviceIds:string[];remaining:number;held:number;expiresAt:string;closedAt:string|null};
export type ServiceReservationSource={
 services:{id:string;name:string;duration:number;buffer:number;price:number;trialPrice:number|null;revision:number}[];
 technicians:{id:string;name:string;serviceIds:string[]}[];
 locations:{id:string;name:string}[];customers:ReservationCustomer[];cards:ReservationCard[];policyRevision:number;
 readAvailability:(intent:PartyInput)=>Promise<{success:true;data:{slots:string[]}}|{success:false;error:string}>;
 submit:(intent:PartyInput)=>Promise<{success:boolean;error?:string}>;
 createCustomer?: (input:{name:string;phone:string})=>Promise<{success:true;customer:ReservationCustomer}|{success:false;error:string}>;
};
type Person={key:string;customerId:string;serviceId:string;cardId:string;notes:string;technicianId?:string|null;locationId?:string|null};
const field='min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';

/** A service mode of the shared scheduling form. Business reads/writes are supplied as ports. */
export function ServiceReservationForm({source,date:initialDate,seed={},onGuard,onCreated}:{source:ServiceReservationSource;date:string;seed?:{time?:string;coachId?:string;roomId?:string;customerId?:string};onGuard:(dirty:boolean,pending:boolean)=>void;onCreated:(date:string)=>void}){
 const [date,setDate]=useState(initialDate),[time,setTime]=useState(seed.time??'09:00');
 const [technicianId,setTechnician]=useState(seed.coachId??''),[locationId,setLocation]=useState(seed.roomId??source.locations[0]?.id??'');
 const initialService=source.services.find(s=>!seed.coachId||source.technicians.find(t=>t.id===seed.coachId)?.serviceIds.includes(s.id))?.id??source.services[0]?.id??'';
 const [people,setPeople]=useState<Person[]>(()=>[{key:crypto.randomUUID(),customerId:seed.customerId??'',serviceId:initialService,cardId:source.cards.filter(c=>!c.closedAt&&c.memberIds.includes(seed.customerId??'')&&c.serviceIds.includes(initialService)&&c.remaining>c.held&&new Date(c.expiresAt)>(parseTaipeiDateTime(initialDate,seed.time??'09:00')??new Date())).sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt)||a.id.localeCompare(b.id))[0]?.id??'',notes:''}]);
 const [customers,setCustomers]=useState(source.customers),[trial,setTrial]=useState(false),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const [adding,setAdding]=useState<string|null>(null),[name,setName]=useState(''),[phone,setPhone]=useState(''),[creating,setCreating]=useState(false),[createError,setCreateError]=useState('');
 const [retry,setRetry]=useState(0);
 const [availability,setAvailability]=useState<{key:string;slots:string[];error?:string}|null>(null);
 useCourseDraftGuard(dirty,pending||creating);
 const ports=useRef(source);ports.current=source;
 const request=useRef(crypto.randomUUID()),version=useRef(0),lock=useRef(false),createLock=useRef(false);
 useEffect(()=>{onGuard(dirty,pending||creating);return()=>onGuard(false,false);},[dirty,pending,creating,onGuard]);
 function change(work:()=>void){if(lock.current||createLock.current)return;request.current=crypto.randomUUID();setDirty(true);setError('');work();}
 function update(key:string,patch:Partial<Person>){change(()=>setPeople(rows=>rows.map(p=>p.key===key?{...p,...patch}:p)));}
 const at=parseTaipeiDateTime(date,time);
 const resolved=people.map(p=>({p,customer:customers.find(c=>c.id===p.customerId),service:source.services.find(s=>s.id===p.serviceId),tech:p.technicianId===undefined?technicianId:p.technicianId,room:p.locationId===undefined?locationId:p.locationId}));
 function eligible(card:ReservationCard,p:Person){return !card.closedAt&&!!at&&new Date(card.expiresAt)>at&&card.memberIds.includes(p.customerId)&&card.serviceIds.includes(p.serviceId);}
 function cardsFor(p:Person){return source.cards.filter(c=>eligible(c,p)&&c.remaining-c.held-people.filter(other=>other.key!==p.key&&other.cardId===c.id).length>0).sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt)||a.id.localeCompare(b.id));}
 const issues=resolved.map(({p,customer,service,tech,room})=>{
  if(!customer)return '請選定顧客';
  if(!/^09\d{8}$/.test(customer.phone))return '請先至顧客管理補齊有效手機';
  if(!service||trial&&service.trialPrice==null)return '請選擇適用的服務項目';
  if(tech&&!source.technicians.some(t=>t.id===tech&&t.serviceIds.includes(service.id)))return '目前技師不適用此服務，請重新選擇';
  if(!room||!source.locations.some(r=>r.id===room))return '請選擇啟用中的位置';
  const roomConflict=resolved.findIndex(other=>other.p.key!==p.key&&other.room===room);if(roomConflict>=0)return `位置與第 ${roomConflict+1} 位重複，請調整此位位置`;
  const techConflict=tech?resolved.findIndex(other=>other.p.key!==p.key&&other.tech===tech):-1;if(techConflict>=0)return `技師與第 ${techConflict+1} 位重複，請調整此位技師`;
  if(!trial&&p.cardId){const card=source.cards.find(c=>c.id===p.cardId);if(!card||!eligible(card,p))return '此方案不適用或已到期，請重新選擇';if(card.remaining-card.held<people.filter(other=>other.cardId===p.cardId).length)return '本次合計使用超過方案可用次數';}
  return '';
 });
 const valid=!!at&&!issues.some(Boolean)&&!!people.length;
 const intent:PartyInput={requestKey:request.current,policyRevision:source.policyRevision,date,time,contactName:resolved[0]?.customer?.name??'',phone:resolved[0]?.customer?.phone??'',isTrial:trial,people:resolved.map(({p,customer,service,tech,room})=>({customerId:customer?.id??null,name:customer?.name??'',phone:customer?.phone??'',serviceId:p.serviceId,serviceRevision:service?.revision??0,preference:'ANY',specifiedTechnicianId:tech||null,specifiedLocationId:room||null,cardId:trial?null:p.cardId||null,notes:p.notes}))};
 // Notes do not change availability. Every resource, identity and payment-mode edit does.
 const availabilityKey=JSON.stringify({...intent,requestKey:'',people:intent.people.map(p=>({...p,notes:''}))});
 useEffect(()=>{
  const generation=++version.current;
  if(!valid)return;
  let active=true;
  const timer=setTimeout(async()=>{
   try{const result=await ports.current.readAvailability({...JSON.parse(availabilityKey),requestKey:request.current});if(!active||generation!==version.current)return;setAvailability(result.success?{key:availabilityKey,slots:result.data.slots}:{key:availabilityKey,slots:[],error:result.error});}
   catch{if(active&&generation===version.current)setAvailability({key:availabilityKey,slots:[],error:'無法確認時段，請重試'});}
  },350);
  return()=>{active=false;clearTimeout(timer);};
 },[availabilityKey,valid,retry]);
 const checked=availability?.key===availabilityKey,available=checked&&availability.slots.includes(time),checking=valid&&!checked;
 const due=resolved.reduce((sum,{p,service})=>sum+(trial?service?.trialPrice??0:p.cardId?0:service?.price??0),0),uses=trial?0:people.filter(p=>p.cardId).length;
 const end=(minutes:number)=>{if(!at)return '—';const endsAt=new Date(at.getTime()+minutes*60000);return (toLocalDateStr(endsAt)!==date?'次日 ':'')+formatTWDateTime(endsAt).slice(11);};
 async function createCustomer(key:string){
  if(!source.createCustomer||createLock.current||lock.current)return;
  createLock.current=true;setCreating(true);setCreateError('');
  try{const r=await source.createCustomer({name,phone});if(!r.success){setCreateError(r.error);return;}setCustomers(rows=>[...rows.filter(c=>c.id!==r.customer.id),r.customer]);setPeople(rows=>rows.map(p=>p.key===key?{...p,customerId:r.customer.id,cardId:''}:p));request.current=crypto.randomUUID();setDirty(true);setAdding(null);setName('');setPhone('');}
  catch{setCreateError('新增結果尚未確認，請先用電話搜尋核對');}
  finally{createLock.current=false;setCreating(false);}
 }
 return <form className="@container/reservation flex min-h-0 flex-col text-sm" onSubmit={async event=>{
  event.preventDefault();if(lock.current||creating||!valid||!available)return;
  lock.current=true;setPending(true);setError('');
  try{const r=await source.submit(intent);if(!r.success){setError(r.error??'尚未完成預約');setAvailability(null);setRetry(v=>v+1);return;}setDirty(false);onCreated(date);}
  catch{setError('送出結果尚未確認，請保留資料重試');}
  finally{lock.current=false;setPending(false);}
 }}>
  <fieldset disabled={pending||creating} className="min-w-0 space-y-3">
   <div className="grid min-w-0 grid-cols-2 gap-2 rounded-lg bg-primary-50/60 p-2 @min-[44rem]/reservation:grid-cols-4">
    <label>日期<input aria-label="預約日期" className={field} type="date" required value={date} onChange={e=>change(()=>setDate(e.target.value))}/></label>
    <label>開始時間<input aria-label="預約開始時間" className={field} type="time" step="300" required value={time} onChange={e=>change(()=>setTime(e.target.value))}/></label>
    <label>技師<select aria-label="預約技師" className={field} value={technicianId} onChange={e=>change(()=>setTechnician(e.target.value))}><option value="">不指定技師</option>{technicianId&&!source.technicians.some(t=>t.id===technicianId)&&<option value={technicianId}>原技師已停用，請重選</option>}{source.technicians.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>位置<select aria-label="預約位置" className={field} required value={locationId} onChange={e=>change(()=>setLocation(e.target.value))}>{!locationId&&<option value="">請選擇</option>}{locationId&&!source.locations.some(r=>r.id===locationId)&&<option value={locationId}>原位置已停用，請重選</option>}{source.locations.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
   </div>
   {resolved.map(({p,customer,service,tech,room},index)=><section key={p.key} aria-label={`第${index+1}位預約`} className="space-y-1 border-b border-earth-100 pb-2">
    <div className="flex items-center justify-between"><h3 className="font-medium">{index===0?'顧客':`同行者 ${index}`}</h3>{index>0&&<button type="button" className="min-h-11 px-2 text-earth-600" onClick={()=>change(()=>setPeople(rows=>rows.filter(row=>row.key!==p.key)))}>移除同行者 {index}</button>}</div>
    <div className="grid min-w-0 gap-2 @min-[28rem]/reservation:grid-cols-2 @min-[40rem]/reservation:grid-cols-3">
     <div className="min-w-0"><label>姓名<CourseOptionSelect searchable required label={`顧客姓名 ${index+1}`} placeholder="搜尋姓名／電話" onCreate={source.createCustomer?query=>{setAdding(p.key);setCreateError('');setName(/^[\d\s-]+$/.test(query)?'':query);setPhone(/^[\d\s-]+$/.test(query)?query.replace(/\D/g,''):'');setDirty(true);}:undefined} value={p.customerId} onSearchChange={()=>{if(p.customerId)update(p.key,{customerId:'',cardId:''});}} onChange={id=>{const next={...p,customerId:id,cardId:''};update(p.key,{customerId:id,cardId:cardsFor(next)[0]?.id??''});}} options={customers.map(c=>({id:c.id,label:`${c.name} · ${c.phone}`}))}/></label></div>
     <label>服務項目<select aria-label={`服務項目 ${index+1}`} className={field} required value={p.serviceId} onChange={e=>update(p.key,{serviceId:e.target.value})}>{source.services.map(s=><option key={s.id} value={s.id}>{s.name} · {s.duration} 分鐘</option>)}</select></label>
     <label>使用方案<select aria-label={`使用方案 ${index+1}`} className={field} disabled={trial||!customer} value={trial?'':p.cardId} onChange={e=>update(p.key,{cardId:e.target.value})}>{trial&&<option value="">體驗服務</option>}{!trial&&p.cardId&&!cardsFor(p).some(c=>c.id===p.cardId)&&<option value={p.cardId}>{source.cards.find(c=>c.id===p.cardId)?.name??'原方案'}（請重新核對）</option>}{!trial&&cardsFor(p).map(c=><option key={c.id} value={c.id}>{c.name} · 可用 {c.remaining-c.held} 次 · {toLocalDateStr(new Date(c.expiresAt))} 到期</option>)}{!trial&&<option value="">單次付款 · NT$ {(service?.price??0).toLocaleString()}</option>}</select></label>
    </div>
    {adding===p.key&&<div className="grid gap-2 rounded-lg bg-earth-50 p-2 @min-[28rem]/reservation:grid-cols-3"><label>新增顧客姓名<input aria-label="新增顧客姓名" className={field} value={name} onChange={e=>{setName(e.target.value);setDirty(true);}}/></label><label>新增顧客電話<input aria-label="新增顧客電話" className={field} type="tel" value={phone} onChange={e=>{setPhone(e.target.value);setDirty(true);}}/></label><div className="flex items-end gap-2"><button type="button" disabled={!name.trim()||!/^09\d{8}$/.test(phone)||creating} className={button+' self-end'} onClick={()=>void createCustomer(p.key)}>建立並選用</button><button type="button" className={button} onClick={()=>setAdding(null)}>取消新增</button></div>{createError&&<p role="alert" className="col-span-full text-red-700">{createError}</p>}</div>}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-0 text-earth-700"><strong className="text-primary-900" aria-label={`服務時段 ${index+1}`}>{time}–{end(service?.duration??0)} · {service?.duration??0} 分鐘</strong>{!!service?.buffer&&<span>整理至 {end(service.duration+service.buffer)}</span>}<span>{source.technicians.find(t=>t.id===tech)?.name??'不指定技師'} · {source.locations.find(r=>r.id===room)?.name??'請選擇位置'}</span></div>
    <details><summary className="min-h-11 cursor-pointer py-3 text-primary-800">調整技師／位置、備註{p.notes?'（已填寫）':''}</summary><div className="grid gap-2 @min-[28rem]/reservation:grid-cols-2"><label>此位技師<select aria-label={`此位技師 ${index+1}`} className={field} value={p.technicianId===undefined?'inherit':p.technicianId??''} onChange={e=>update(p.key,{technicianId:e.target.value==='inherit'?undefined:e.target.value||null})}><option value="inherit">依上方安排</option><option value="">不指定</option>{source.technicians.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>此位位置<select aria-label={`此位位置 ${index+1}`} className={field} value={p.locationId===undefined?'inherit':p.locationId??''} onChange={e=>update(p.key,{locationId:e.target.value==='inherit'?undefined:e.target.value||null})}><option value="inherit">依上方安排</option>{source.locations.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label className="col-span-full">本次備註<input aria-label={`本次備註 ${index+1}`} className={field} maxLength={1000} value={p.notes} onChange={e=>update(p.key,{notes:e.target.value})}/></label></div></details>
    {p.customerId&&issues[index]&&<p role="alert" className="text-red-700">第 {index+1} 位：{issues[index]}</p>}
   </section>)}
   <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className={button} disabled={people.length>=12} onClick={()=>change(()=>setPeople(rows=>[...rows,{key:crypto.randomUUID(),customerId:'',serviceId:rows[0]?.serviceId??initialService,cardId:'',notes:''}]))}>＋新增同行者</button>{source.services.some(s=>s.trialPrice!=null)&&<label className="flex min-h-11 items-center gap-2"><input className="!appearance-auto h-4 w-4 accent-primary-700" type="checkbox" checked={trial} onChange={e=>change(()=>setTrial(e.target.checked))}/>體驗預約</label>}</div>
  </fieldset>
  <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-earth-200 bg-white py-2" aria-label="預約確認摘要">
   <div><p>{people.length} 位 · 方案使用 {uses} 次 · 應收 NT$ {due.toLocaleString()}</p><p role="status" className="text-sm text-earth-600">{checking?'正在核對時段…':checked?availability.error??(available?'目前時段可安排':'此時段無法安排全部顧客，請調整時間、技師或位置'):'請選定顧客及服務'}</p>{checked&&availability.error&&<button type="button" className={button} onClick={()=>{setAvailability(null);setRetry(v=>v+1);}}>重新核對時段</button>}{error&&<p role="alert" className="text-red-700">{error}</p>}</div>
   <button className={button+' bg-primary-700 text-white'} disabled={pending||creating||!valid||!available}>{pending?'確認中…':'確認預約'}</button>
  </div>
 </form>;
}
