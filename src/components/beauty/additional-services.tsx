'use client';
import type {AdditionalService} from '@/lib/beauty/service-journey';
import {BeautyAddOnChoices} from './add-on-fields';
import type {MemberBookingCard} from '@/lib/beauty/member-booking';
import type {BeautyBookingCatalog} from './booking-form';
const field='min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base';
/** Progressive disclosure shared by member and desk booking; never writes payments. */
export function BeautyAdditionalServices({services,techs,cards,customerId,baseServiceId,baseCardId,at,value=[],separate=false,onChange,onSeparate,label='合併其他服務'}:{
 services:BeautyBookingCatalog['services'];techs:{id:string;name:string;serviceIds:string[]}[];cards:MemberBookingCard[];customerId:string;baseServiceId:string;baseCardId:string|null;at:Date|null;value?:AdditionalService[];separate?:boolean;onChange:(rows:AdditionalService[])=>void;onSeparate:(value:boolean)=>void;label?:string;
}){
 const validCards=cards.filter(c=>!c.closed&&c.memberIds.includes(customerId)&&c.remaining>c.held&&!!at&&Date.parse(c.expiresAt)>+at).sort((a,b)=>a.expiresAt.localeCompare(b.expiresAt)||a.id.localeCompare(b.id));
 const candidates=services.filter(s=>s.id!==baseServiceId&&validCards.some(c=>c.id!==baseCardId&&c.serviceIds.includes(s.id)));
 if(!baseCardId&&!value.length||!candidates.length&&!value.length)return null;
 return <section className="min-w-0 space-y-2" aria-label={label}>
  <details open={value.length>0||undefined}><summary className="min-h-11 cursor-pointer py-3 font-medium text-primary-800">{label}{value.length?` · 已選 ${value.length+1} 項主服務`:''}</summary>
   <div className="space-y-2">{[...new Set([...candidates.map(s=>s.id),...value.map(s=>s.serviceId)])].map(id=>{
    const service=services.find(s=>s.id===id),selected=value.find(s=>s.serviceId===id);
    const eligible=validCards.filter(c=>c.id!==baseCardId&&c.serviceIds.includes(id)&&!value.some(s=>s.serviceId!==id&&s.cardId===c.id));
    return <section key={id} className="min-w-0 rounded-lg border border-earth-200 bg-white px-3">
     <label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" checked={!!selected} disabled={!selected&&(!eligible.length||value.length>=5)} onChange={e=>onChange(e.target.checked?[...value,{serviceId:id,serviceRevision:service?.revision??0,cardId:eligible[0].id,specifiedTechnicianId:null,addOnIds:[]}]:value.filter(s=>s.serviceId!==id))}/><span className="min-w-0 break-words">{service?.name??'原服務已停用'}<span className="ml-2 text-sm text-earth-600">{service?.duration??0} 分鐘</span></span></label>
     {selected&&<div className="space-y-2 border-t border-earth-100 py-2">
      {eligible.length===1&&eligible[0].id===selected.cardId?<p className="flex min-h-11 flex-wrap items-center gap-x-2 text-earth-700"><span>{eligible[0].name}</span><span className="text-sm">使用 1 次 · 可用 {eligible[0].remaining-eligible[0].held} 次</span></p>:<label className="block">使用方案<select className={field} value={selected.cardId} onChange={e=>onChange(value.map(s=>s.serviceId===id?{...s,cardId:e.target.value}:s))}>{!eligible.some(c=>c.id===selected.cardId)&&<option value={selected.cardId}>原方案不可用，請重新選擇</option>}{eligible.map(c=><option key={c.id} value={c.id}>{c.name} · 可用 {c.remaining-c.held} 次 · 本次使用 1 次</option>)}</select></label>}
      {separate&&<label className="block">此段技師<select className={field} value={selected.specifiedTechnicianId??''} onChange={e=>onChange(value.map(s=>s.serviceId===id?{...s,specifiedTechnicianId:e.target.value||null}:s))}><option value="">不指定，自動安排</option>{techs.filter(t=>t.serviceIds.includes(id)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <BeautyAddOnChoices groups={service?.addOnGroups} selected={selected.addOnIds} onChange={addOnIds=>onChange(value.map(s=>s.serviceId===id?{...s,addOnIds}:s))}/>
     </div>}
    </section>;
   })}</div>
  </details>
  {!!value.length&&<label className="flex min-h-11 cursor-pointer items-center gap-2 text-primary-800"><input type="checkbox" checked={separate} onChange={e=>onSeparate(e.target.checked)}/>分別安排技師</label>}
 </section>;
}
