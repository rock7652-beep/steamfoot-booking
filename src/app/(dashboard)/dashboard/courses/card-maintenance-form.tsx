"use client";
import {useEffect,useRef,useState} from 'react';
import {toLocalDateStr} from '@/lib/date-utils';
import type {BeautyCardMaintenanceInput} from '@/lib/beauty/card-maintenance';
import type {CourseCustomerSource} from './member-source';
const field='min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-base';
export function CardMaintenanceForm({storeId,card,save,onSaved,onPending,onDirtyChange,onUncertain}:{storeId:string;card:{id:string;remaining:number;expiresAt?:string|null;closed?:boolean;held:number};save:NonNullable<CourseCustomerSource['maintainCard']>;onSaved:()=>void;onPending:(value:boolean)=>void;onDirtyChange:(value:boolean)=>void;onUncertain:(value:boolean)=>void}){
 const [action,setAction]=useState<'close'|'expiry'|''>(''),[date,setDate]=useState(card.expiresAt?toLocalDateStr(new Date(card.expiresAt)):''),[reason,setReason]=useState(''),[pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),attempt=useRef<BeautyCardMaintenanceInput|null>(null);
 useEffect(()=>{onDirtyChange(!!action);},[action,onDirtyChange]);
 useEffect(()=>{onPending(pending);onUncertain(uncertain);return()=>{onPending(false);onUncertain(false);};},[pending,uncertain,onPending,onUncertain]);
 if(card.closed||!card.expiresAt)return null;
 const locked=pending||uncertain;
 return <section className="mt-3 border-t border-earth-100 pt-3" aria-label="方案註銷與期限調整">
  {!action?<div className="flex flex-wrap gap-2"><button type="button" className={field+' !w-auto'} onClick={()=>setAction('expiry')}>調整方案期限</button><button type="button" className={field+' !w-auto text-red-700'} disabled={card.held>0} title={card.held?'請先處理待服務預約':undefined} onClick={()=>setAction('close')}>註銷方案</button>{card.held>0&&<p className="w-full text-sm text-earth-600">仍有待服務預約，處理後才能註銷。</p>}</div>:<form className="space-y-2" onSubmit={async e=>{
   e.preventDefault();if(lock.current)return;lock.current=true;setPending(true);setError('');
   attempt.current??={expectedStoreId:storeId,cardId:card.id,requestKey:crypto.randomUUID(),action,reason,expectedRemaining:card.remaining,expectedExpiresAt:card.expiresAt!,...(action==='expiry'?{expiresDate:date}:{})};
   try{const result=await save(attempt.current);if(!result.success){setError(result.error??'操作未完成');attempt.current=null;setUncertain(false);return;}setUncertain(false);setAction('');setReason('');attempt.current=null;onSaved();}
   catch{setUncertain(true);setError('結果尚未確認，請重試核對同一次操作。');}
   finally{lock.current=false;setPending(false);}
  }}>
   <h3 className="font-semibold">{action==='close'?'註銷方案':'調整方案期限'}</h3>
   {action==='expiry'?<label className="block">新到期日<input aria-label="新到期日" className={field} type="date" required min={toLocalDateStr()} disabled={locked} value={date} onChange={e=>setDate(e.target.value)}/></label>:<p>註銷後無法再使用；付款、剩餘次數與使用紀錄保留，不會自動退款。</p>}
   <label className="block">原因<input aria-label="方案調整原因" className={field} required maxLength={500} disabled={locked} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   <div className="flex flex-wrap justify-end gap-2"><button type="button" className={field+' !w-auto'} disabled={locked} onClick={()=>{setAction('');setError('');attempt.current=null;}}>取消</button><button className={field+' !w-auto bg-primary-700 text-white'} disabled={pending}>{pending?'處理中…':uncertain?'重試核對':action==='close'?'確認註銷':'儲存期限'}</button></div>
  </form>}
 </section>;
}
