"use client";
import {useEffect,useRef,useState,useTransition} from 'react';
import {RightSheet} from '@/components/admin/right-sheet';
import {readBeautyMoveSlots,moveBeautyAppointment} from '@/server/actions/beauty';
import {toLocalDateStr,parseTaipeiDateTime,formatTWDateTime} from '@/lib/date-utils';
import {beautyServiceTime} from '@/lib/beauty/portal-groups';
const control='min-h-11 min-w-0 w-full rounded-lg border border-earth-200 bg-white px-3 py-2 text-base';
export function BeautyReschedulePanel({mode,item,onClose,onSaved}:{mode:'member'|'work';item:{id:string;revision:number;serviceName:string;personName:string;startsAt?:string;endsAt?:string};onClose:()=>void;onSaved:()=>void}){
 const today=toLocalDateStr(),original=item.startsAt?toLocalDateStr(new Date(item.startsAt)):today;
 const [date,setDate]=useState(original<today?today:original),[time,setTime]=useState(''),[slots,setSlots]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[saving,start]=useTransition();
 const request=useRef(crypto.randomUUID()),busy=useRef(false);
 useEffect(()=>{
  let active=true;setLoading(true);setSlots([]);setError('');
  readBeautyMoveSlots(mode,{id:item.id,date}).then(r=>{if(!active)return;if(r.success)setSlots(r.data.slots);else setError(r.error);}).catch(()=>{if(active)setError('讀取失敗，請重試。');}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[mode,item.id,date,retry]);
 const at=time?parseTaipeiDateTime(date,time):null,duration=item.startsAt&&item.endsAt?Date.parse(item.endsAt)-Date.parse(item.startsAt):0;
 const range=at&&duration>0?beautyServiceTime(at.toISOString(),new Date(+at+duration).toISOString()):time;
 return <RightSheet open presentation="centered" width={560} onClose={()=>!saving&&onClose()} closeOnEscape={!saving} labelledById="beauty-reschedule-title"><form className="min-w-0 space-y-4 overflow-y-auto p-4" onSubmit={e=>{e.preventDefault();if(busy.current||saving||loading||!slots.includes(time))return;busy.current=true;start(async()=>{try{const r=await moveBeautyAppointment(mode,{id:item.id,revision:item.revision,date,time,requestKey:request.current,reason:'前台改期'});if(r.success)onSaved();else setError(r.error);}catch{setError('連線失敗，內容已保留，請重試。');}finally{busy.current=false;}});}}>
 <h2 id="beauty-reschedule-title" className="text-lg font-semibold">改期</h2><p>{item.serviceName}</p>{item.startsAt&&<p className="text-sm text-earth-600">原預約：{formatTWDateTime(new Date(item.startsAt))}</p>}
 <fieldset disabled={saving} className="min-w-0 space-y-4"><label className="block">日期<input className={control+' block appearance-none'} type="date" required min={today} value={date} onChange={e=>{setDate(e.target.value);setTime('');setSlots([]);setLoading(true);request.current=crypto.randomUUID();}}/></label>
 {loading?<p role="status">讀取可用時段中…</p>:!slots.length&&!error?<p role="status">當日沒有可預約時段，請換日期。</p>:null}
 {!loading&&['上午','下午','晚上'].map((label,index)=>{const times=slots.filter(t=>index===0?t<'12:00':index===1?t>='12:00'&&t<'18:00':t>='18:00');return times.length>0&&<section key={label} aria-label={label+'可用時段'}><h3 className="mb-2 font-medium">{label}</h3><div className="grid grid-cols-3 gap-2">{times.map(t=><button type="button" key={t} aria-pressed={time===t} className={'min-h-11 rounded-lg border px-2 py-2 text-base '+(time===t?'border-primary-700 bg-primary-700 text-white':'border-earth-200 bg-white')} onClick={()=>{setTime(t);request.current=crypto.randomUUID();}}>{t}</button>)}</div></section>;})}
 {time&&<p aria-label="改期時間">{range}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}{error&&!slots.length&&!loading&&<button type="button" className={control} onClick={()=>{setTime('');setRetry(n=>n+1);}}>重試</button>}
 <div className="flex gap-3"><button type="button" className={control} onClick={onClose}>返回</button><button className="min-h-11 w-full rounded-lg bg-primary-700 px-3 py-2 text-base text-white disabled:opacity-50" disabled={loading||!time||!slots.includes(time)}>{saving?'處理中…':'確認改期'}</button></div></fieldset></form></RightSheet>;
}
