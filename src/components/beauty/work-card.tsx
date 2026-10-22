"use client";
import type {BeautyPortalData} from '@/server/beauty/queries';
import {beautyServiceTime} from '@/lib/beauty/portal-groups';
import {toLocalDateStr} from '@/lib/date-utils';
type Item=BeautyPortalData['items'][number];
export function BeautyWorkCard({item,now,showDate,location,grants,disabled,onChange,onMove}:{item:Item;now:number;showDate:boolean;location?:string;grants:string[];disabled:boolean;onChange:(target:'COMPLETED'|'CANCELLED'|'NO_SHOW'|'RESERVED')=>void;onMove:()=>void}){
 const label=item.status==='RESERVED'?(Date.parse(item.endsAt)<=now?'待處理':Date.parse(item.startsAt)<=now?'服務中':'待服務'):({COMPLETED:'已完成',CANCELLED:'已取消',NO_SHOW:'未到'} as Record<string,string>)[item.status]??item.status;
 const reserved=item.status==='RESERVED',complete=grants.includes('complete');
 const more=reserved?(complete||grants.includes('cancel')||grants.includes('reschedule')):complete;
 return <article className="cp-card beauty-work-card">
  <div className="beauty-work-heading"><strong>{showDate&&<span>{toLocalDateStr(new Date(item.startsAt))} </span>}{beautyServiceTime(item.startsAt,item.endsAt)}</strong><span className={'beauty-work-status'+(label==='待處理'?' needs-attention':'')}>{label}</span></div>
  <h2>{item.personName||'同行者'} · {item.serviceName}</h2>
  {location&&<p>空間：{location}</p>}
  {item.notes&&<p className="beauty-work-note">備註：{item.notes}</p>}
  {(more||reserved&&complete)&&<div className="beauty-work-actions">
   {more&&<details><summary>更多 ⋯</summary><div className="beauty-work-options">
    {reserved&&grants.includes('reschedule')&&<button disabled={disabled} onClick={onMove}>改期</button>}
    {reserved&&grants.includes('cancel')&&<button disabled={disabled} onClick={()=>onChange('CANCELLED')}>取消預約</button>}
    {reserved&&complete&&<button disabled={disabled} onClick={()=>onChange('NO_SHOW')}>未到</button>}
    {!reserved&&complete&&<button disabled={disabled} onClick={()=>onChange('RESERVED')}>{item.status==='CANCELLED'?'恢復預約':'更正回預約'}</button>}
   </div></details>}
   {reserved&&complete&&<button className="primary" disabled={disabled} onClick={()=>onChange('COMPLETED')}>服務完成</button>}
  </div>}
 </article>;
}
