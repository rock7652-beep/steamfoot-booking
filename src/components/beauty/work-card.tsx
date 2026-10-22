"use client";
import type {BeautyPortalData} from '@/server/beauty/queries';
import {beautyServiceTime} from '@/lib/beauty/portal-groups';
import {toLocalDateStr} from '@/lib/date-utils';
type Item=BeautyPortalData['items'][number];
export function BeautyWorkCard({item,now,showDate,location,grants,disabled,onChange,onMove}:{item:Item;now:number;showDate:boolean;location?:string;grants:string[];disabled:boolean;onChange:(target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED')=>void;onMove:()=>void}){
 const label=item.status==='RESERVED'?(Date.parse(item.endsAt)<=now?'待處理':Date.parse(item.startsAt)<=now?'服務中':'待服務'):({COMPLETED:'已完成',CANCELLED:'已取消',NO_SHOW:'未到'} as Record<string,string>)[item.status]??item.status;
 const reserved=item.status==='RESERVED',complete=grants.includes('complete');
 const options=reserved?[
  ...(grants.includes('reschedule')?[{label:'改期',run:onMove}]:[]),
  ...(grants.includes('cancel')?[{label:'取消預約',run:()=>onChange('CANCELLED')}]:[]),
  ...(complete?[{label:'未到',run:()=>onChange('NO_SHOW')}]:[]),
 ]:[];
 const buttons=options.map(option=><button key={option.label} disabled={disabled} onClick={option.run}>{option.label}</button>);
 return <article className="cp-card beauty-work-card">
  <div className="beauty-work-heading"><strong>{showDate&&<span>{toLocalDateStr(new Date(item.startsAt))} </span>}{beautyServiceTime(item.startsAt,item.endsAt)}</strong><span className={'beauty-work-status'+(label==='待處理'?' needs-attention':'')}>{label}</span></div>
  <h2>{item.personName||'同行者'} · {item.serviceName}</h2>
  {location&&<p>空間：{location}</p>}
  {item.notes&&<p className="beauty-work-note">備註：{item.notes}</p>}
  {(options.length>0||reserved&&complete)&&<div className="beauty-work-actions">
   {options.length===1?buttons:options.length>1&&<details><summary>更多 ⋯</summary><div className="beauty-work-options" onClick={e=>{if((e.target as HTMLElement).closest('button'))e.currentTarget.closest('details')?.removeAttribute('open');}}>{buttons}</div></details>}
   {reserved&&complete&&<button className="primary" disabled={disabled} onClick={()=>onChange('COMPLETED')}>服務完成</button>}
  </div>}
 </article>;
}
