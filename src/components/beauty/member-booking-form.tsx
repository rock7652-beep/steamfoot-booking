"use client";
import {useEffect,useRef,useState,useTransition} from 'react';
import {bookBeautyParty,readBeautySlots} from '@/server/actions/beauty';
import {useCourseDraftGuard} from '@/components/admin/use-course-draft-guard';
import {toLocalDateStr,parseTaipeiDateTime,formatTWDateTime} from '@/lib/date-utils';
import {applicableCards,type MemberBookingCard,type MemberPartyInput} from '@/lib/beauty/member-booking';
import type {BeautyBookingCatalog} from './booking-form';
const control='min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base';
const button='min-h-11 rounded-lg border border-primary-300 px-4 py-2 text-base disabled:opacity-50';
type Person=MemberPartyInput['people'][number]&{chooseTechnician:boolean};
export function BeautyMemberBookingForm({catalog,slug,customer,cards=[],onBooked,onViewBookings,onStateChange}:{catalog:BeautyBookingCatalog;slug:string;customer?:{id:string}|null;cards?:MemberBookingCard[];onBooked?:()=>void;onViewBookings?:()=>void;onStateChange?:(s:{dirty:boolean;pending:boolean})=>void}){
 const [date,setDate]=useState(toLocalDateStr),[time,setTime]=useState('');
 const choices=(serviceId:string,index:number,others:Person[],day=date,at='00:00')=>applicableCards(cards,serviceId,customer?.id??'',day,at,index>0).filter(c=>c.remaining-c.held>others.filter(p=>p.cardId===c.id).length);
 const blank=(index:number,others:Person[],serviceId=catalog.services[0]?.id??''):Person=>({serviceId,serviceRevision:catalog.services.find(s=>s.id===serviceId)?.revision??0,specifiedTechnicianId:null,cardId:choices(serviceId,index,others)[0]?.id??null,notes:'',chooseTechnician:false});
 const [people,setPeople]=useState<Person[]>(()=>[blank(0,[])]),[stage,setStage]=useState<'services'|'slots'|'confirm'|'success'>('services');
 const [slots,setSlots]=useState<string[]>([]),[error,setError]=useState(''),[dirty,setDirty]=useState(false),[pending,start]=useTransition();
 const request=useRef(crypto.randomUUID()),generation=useRef(0),lock=useRef(false);
 useCourseDraftGuard(dirty,pending);
 useEffect(()=>{onStateChange?.({dirty,pending});},[dirty,pending,onStateChange]);
 function invalidate(){generation.current++;request.current=crypto.randomUUID();setSlots([]);setTime('');setError('');}
 function change(index:number,patch:Partial<Person>){invalidate();setPeople(p=>p.map((v,i)=>i===index?{...v,...patch}:v));}
 function payload(day=date,at=time||'00:00'):MemberPartyInput{return {requestKey:request.current,date:day,time:at,policyRevision:catalog.policy?.revision??0,people:people.map(p=>({serviceId:p.serviceId,specifiedTechnicianId:p.specifiedTechnicianId,cardId:p.cardId,notes:p.notes,serviceRevision:catalog.services.find(s=>s.id===p.serviceId)?.revision??0}))};}
 function validate(day=date,at='00:00'){
  if(!people.every(p=>p.serviceId&&(!p.chooseTechnician||p.specifiedTechnicianId))){setError('請選擇服務與指定技師，或改為不指定。');return false;}
  const usage=new Map<string,number>();
  for(const [i,p] of people.entries())if(p.cardId){
   const card=applicableCards(cards,p.serviceId,customer?.id??'',day,at,i>0).find(c=>c.id===p.cardId);
   const n=(usage.get(p.cardId)??0)+1;usage.set(p.cardId,n);
   if(!card||card.remaining-card.held<n){setError('所選方案在此日期不適用或次數不足，請返回修改方案。');return false;}
  }
  return true;
 }
 function query(day:string){
  invalidate();if(!validate(day))return;
  const version=generation.current;
  start(async()=>{try{const r=await readBeautySlots('member',slug,payload(day,'00:00'));if(version!==generation.current)return;if(r.success){setSlots(r.data.slots.filter(t=>/:(00|30)$/.test(t)));if(!r.data.slots.some(t=>/:(00|30)$/.test(t)))setError('當日沒有可安排全部同行者的時段，請換日期。');}else setError(r.error);}catch{if(version===generation.current)setError('查詢失敗，請重試。');}});
 }
 const cash=people.reduce((n,p)=>n+(p.cardId?0:catalog.services.find(s=>s.id===p.serviceId)?.price??0),0),uses=people.filter(p=>p.cardId).length;
 function range(p:Person){const start=parseTaipeiDateTime(date,time);if(!start)return '';const end=new Date(+start+(catalog.services.find(s=>s.id===p.serviceId)?.duration??0)*60000);const a=formatTWDateTime(start),b=formatTWDateTime(end);return `${a.slice(11)}–${a.slice(0,10)===b.slice(0,10)?b.slice(11):b}`;}
 const summary=<section className="space-y-3" aria-label="預約摘要"><h2 className="font-semibold">{date}</h2>{people.map((p,i)=><article key={i} className="cp-card cp-pad"><strong>{i===0?'本人':`同行者 ${i}`} · {catalog.services.find(s=>s.id===p.serviceId)?.name}</strong><p>{range(p)}</p><p>{p.specifiedTechnicianId?`${catalog.techs.find(t=>t.id===p.specifiedTechnicianId)?.name}（${catalog.techs.find(t=>t.id===p.specifiedTechnicianId)?.gender==='FEMALE'?'女':'男'}）`:'不指定（男女皆可）'}</p><p>{p.cardId?`${cards.find(c=>c.id===p.cardId)?.name} · 使用 1 次`:`單次 NT$ ${(catalog.services.find(s=>s.id===p.serviceId)?.price??0).toLocaleString('zh-TW')}`}</p>{p.notes&&<p>{p.notes}</p>}</article>)}<p>{uses>0?`方案使用 ${uses} 次 · `:''}單次應付 NT$ {cash.toLocaleString('zh-TW')}</p></section>;
 if(catalog.policy?.selfBooking===false)return <p>店家暫未開放自行預約，請聯絡店家安排。</p>;
 if(stage==='success')return <section role="status" className="space-y-4"><h2 className="text-lg font-semibold">預約成功</h2>{summary}<button className={button+' bg-primary-700 text-white'} onClick={onViewBookings}>查看我的預約</button><button className={button} onClick={()=>{invalidate();setPeople([blank(0,[])]);setDirty(false);setStage('services');}}>再約一筆</button></section>;
 return <form className="min-w-0 space-y-4" onChangeCapture={()=>setDirty(true)} onSubmit={e=>{e.preventDefault();if(stage!=='confirm'||lock.current||pending||!time||!validate(date,time))return;lock.current=true;start(async()=>{try{const r=await bookBeautyParty('member',payload());if(r.success){setDirty(false);setStage('success');onBooked?.();}else setError(r.error);}catch{setError('連線失敗，內容已保留，請重試。');}finally{lock.current=false;}});}}>
  <fieldset disabled={pending} className="space-y-4">
   {stage==='services'&&<><label>預約人數<select aria-label="預約人數" className={control} value={people.length} onChange={e=>{invalidate();const count=Number(e.target.value);setPeople(previous=>{const next=previous.slice(0,count);while(next.length<count)next.push(blank(next.length,next,previous[0].serviceId));return next;});}}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}人</option>)}</select></label>
    {people.map((p,i)=>{const eligible=choices(p.serviceId,i,people.filter((_,j)=>j!==i));return <section className="cp-card cp-pad space-y-3" key={i}><h2 className="font-semibold">{i===0?'本人':`同行者 ${i}`}</h2><label>服務項目<select aria-label={`服務項目 ${i+1}`} className={control} value={p.serviceId} onChange={e=>{const id=e.target.value;change(i,{serviceId:id,specifiedTechnicianId:catalog.techs.some(t=>t.id===p.specifiedTechnicianId&&t.serviceIds.includes(id))?p.specifiedTechnicianId:null});}}>{catalog.services.map(s=><option key={s.id} value={s.id}>{s.name} · {s.duration}分鐘</option>)}</select></label>
    <div role="group" aria-label={`技師安排 ${i+1}`}><p>技師安排</p><div className="flex flex-wrap gap-4 py-2">{[false,true].map(specified=><label key={String(specified)} className="flex min-h-11 items-center gap-2"><input type="radio" name={`technician-${i}`} checked={p.chooseTechnician===specified} onChange={()=>change(i,{chooseTechnician:specified,specifiedTechnicianId:null})}/>{specified?'指定技師':'不指定（男女皆可）'}</label>)}</div>{p.chooseTechnician&&<label>選擇技師<select required aria-label={`選擇技師 ${i+1}`} className={control} value={p.specifiedTechnicianId??''} onChange={e=>change(i,{specifiedTechnicianId:e.target.value||null})}><option value="">請選擇技師</option>{catalog.techs.filter(t=>t.serviceIds.includes(p.serviceId)).map(t=><option key={t.id} value={t.id}>{t.name}（{t.gender==='FEMALE'?'女':'男'}）</option>)}</select></label>}</div>
    <label>方案<select aria-label={`方案 ${i+1}`} className={control} value={p.cardId??''} onChange={e=>change(i,{cardId:e.target.value||null})}>{p.cardId&&!eligible.some(c=>c.id===p.cardId)&&<option value={p.cardId} disabled>原方案在此日期不適用或次數不足</option>}{eligible.map(c=><option key={c.id} value={c.id}>{c.name} · 可用 {c.remaining-c.held} 次 · {toLocalDateStr(new Date(c.expiresAt))} 到期</option>)}<option value="">單次消費 · NT$ {(catalog.services.find(s=>s.id===p.serviceId)?.price??0).toLocaleString('zh-TW')}</option></select></label><details><summary className="min-h-11 cursor-pointer py-2">備註（選填）</summary><textarea aria-label={`備註 ${i+1}`} className={control} maxLength={1000} value={p.notes} onChange={e=>change(i,{notes:e.target.value})}/></details></section>;})}
    <button type="button" className={button+' w-full bg-primary-700 text-white'} disabled={!catalog.services.length} onClick={()=>{if(validate()){setDirty(true);setStage('slots');query(date);}}}>查詢時段</button></>}
   {stage==='slots'&&<><button type="button" className={button} onClick={()=>setStage('services')}>修改服務與方案</button><label>日期<input aria-label="日期" className={control} required type="date" min={toLocalDateStr()} value={date} onChange={e=>{setDate(e.target.value);query(e.target.value);}}/></label><div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="可用時段">{slots.map(slot=><button type="button" className={button} key={slot} onClick={()=>{if(validate(date,slot)){setTime(slot);setStage('confirm');setError('');}}}>{slot}</button>)}</div>{!slots.length&&!error&&<p role="status">查詢時段中…</p>}<button type="button" className={button} onClick={()=>query(date)}>重新查詢</button></>}
   {stage==='confirm'&&<><h2 className="text-lg font-semibold">確認預約</h2>{summary}{catalog.policy&&<details><summary className="min-h-11 cursor-pointer py-2">取消{catalog.policy.cancelDeduct?'扣次':'不扣次'} · 未到{catalog.policy.noShowDeduct?'扣次':'不扣次'}</summary><p>{catalog.policy.selfCancel?`請於服務前 ${catalog.policy.cancelLeadMinutes} 分鐘完成取消。`:'取消請聯絡店家。'}</p></details>}<div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={()=>{setStage('slots');query(date);}}>重選時段</button><button type="submit" className={button+' bg-primary-700 text-white'}>確認預約</button></div></>}
  </fieldset>{pending&&<p role="status">處理中…</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
 </form>;
}
