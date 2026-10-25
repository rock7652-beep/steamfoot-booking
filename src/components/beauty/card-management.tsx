"use client";
import {useRef,useState} from 'react';
import {toLocalDateStr} from '@/lib/date-utils';
import {saveBeautyCardManagement} from '@/server/actions/beauty-card-management';
import type {CourseCardView} from '@/app/(dashboard)/dashboard/courses/member-workspace';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
export function BeautyCardManagement({storeId,card,onSaved,onPending}:{storeId:string;card:CourseCardView;onSaved:()=>void;onPending:(pending:boolean)=>void}){
 const [mode,setMode]=useState<'close'|'expiry'|null>(null),[date,setDate]=useState(()=>card.expiresAt?toLocalDateStr(new Date(card.expiresAt)):''),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
 const busy=useRef(false),frozen=useRef<Parameters<typeof saveBeautyCardManagement>[0]|null>(null);
 const blocked=pending||uncertain;
 async function save(){
  if(busy.current||!mode||!reason.trim()||!card.expiresAt)return;
  busy.current=true;setPending(true);onPending(true);setMessage('');
  if(!frozen.current)frozen.current={expectedStoreId:storeId,requestKey:crypto.randomUUID(),cardId:card.id,operation:mode,expectedRemaining:card.remaining,expectedExpiresAt:card.expiresAt,reason,...(mode==='expiry'?{expiresDate:date}:{})};
  let unknown=false;
  try{const result=await saveBeautyCardManagement(frozen.current);
   if(!result.success){unknown=!!result.uncertain;setUncertain(unknown);if(!unknown)frozen.current=null;setMessage(result.error);return;}
   frozen.current=null;setUncertain(false);setMode(null);setReason('');setMessage(result.syncWarning?'已儲存，請重新載入核對。':mode==='close'?'方案已註銷，歷史與收款紀錄保留。':'方案期限已更新。');onSaved();
  }catch{unknown=true;setUncertain(true);setMessage('結果待確認，請用原內容重試。');}
  finally{busy.current=false;setPending(false);onPending(unknown);}
 }
 if(card.closed)return null;
 return <section className="my-3 space-y-2 border-t border-earth-100 pt-3" aria-label="方案管理">
  <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={blocked} onClick={()=>{setMode('expiry');setMessage('');}}>調整期限</button><button type="button" className={button+' text-red-700'} disabled={blocked} onClick={()=>{setMode('close');setMessage('');}}>註銷方案</button></div>
  {mode&&<div className="space-y-3 rounded-lg border border-earth-200 p-3">
   {mode==='expiry'?<label className="block">新到期日<input aria-label="新到期日" type="date" className="min-h-11 w-full rounded border p-2" disabled={blocked} value={date} onChange={e=>setDate(e.target.value)}/></label>:<p>註銷將收回剩餘 {card.remaining} 次，保留歷史與收款；不會自動退款。{card.held>0?'仍有預約占用，請先處理。':''}</p>}
   <label className="block">調整原因<textarea aria-label="調整原因" className="min-h-20 w-full rounded border p-2" disabled={blocked} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={blocked} onClick={()=>setMode(null)}>取消</button><button type="button" className={button+' bg-primary-700 text-white'} disabled={pending||!reason.trim()||mode==='expiry'&&!date||mode==='close'&&card.held>0} onClick={()=>void save()}>{pending?'處理中…':uncertain?'重試確認結果':mode==='close'?'確認註銷':'儲存期限'}</button></div>
  </div>}
  {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
