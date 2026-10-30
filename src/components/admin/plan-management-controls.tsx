'use client';
import {useRef,useState} from 'react';
import {toast} from 'sonner';
import {toLocalDateStr} from '@/lib/date-utils';
import type {PlanManagementInput,PlanManagementResult} from '@/lib/plan-management';

const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
export type ManagedPlan={id:string;remaining:number;held:number;expiresAt:string|null;closed:boolean};
export function PlanManagementControls({storeId,card,save,unitLabel='堂',allowExpiry=true,expiryHint,onSaved,onPending,onDirtyChange}:{
 storeId:string;card:ManagedPlan;save:(input:PlanManagementInput)=>Promise<PlanManagementResult>;unitLabel?:string;allowExpiry?:boolean;expiryHint?:string;
 onSaved:()=>void;onPending?:(pending:boolean)=>void;onDirtyChange?:(dirty:boolean)=>void;
}){
 const initialDate=card.expiresAt?toLocalDateStr(new Date(card.expiresAt)):'';
 const [mode,setMode]=useState<'close'|'expiry'|null>(null),[date,setDate]=useState(initialDate),[reason,setReason]=useState('');
 const [pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
 const busy=useRef(false),frozen=useRef<PlanManagementInput|null>(null),blocked=pending||uncertain;
 async function submit(){
  if(busy.current||!mode||!reason.trim()||(mode==='expiry'&&!date))return;
  busy.current=true;setPending(true);onPending?.(true);setMessage('');let unknown=false;
  frozen.current??={expectedStoreId:storeId,requestKey:crypto.randomUUID(),cardId:card.id,operation:mode,expectedRemaining:card.remaining,expectedExpiresAt:card.expiresAt,reason,...(mode==='expiry'?{expiresDate:date}:{})};
  try{
   const result=await save(frozen.current);
   if(!result.success){unknown=!!result.uncertain;setUncertain(unknown);if(!unknown)frozen.current=null;setMessage(result.error);return;}
   frozen.current=null;setUncertain(false);setMode(null);setReason('');onDirtyChange?.(false);
   const text=result.syncWarning?'已儲存，請重新核對方案資料，勿重複送出。':mode==='close'?'方案已註銷，歷史與收款紀錄保留。':'方案期限已更新。';
   setMessage(text);toast.success(text);try{onSaved();}catch{setMessage('已儲存，方案畫面更新失敗，請重新開啟核對，勿重複送出。');}
  }catch{unknown=true;setUncertain(true);setMessage('結果待確認，請用原內容重試，勿另建操作。');}
  finally{busy.current=false;setPending(false);onPending?.(unknown);}
 }
 if(card.closed)return null;
 return <section className="my-3 min-w-0 space-y-2 border-t border-earth-100 pt-3 text-sm" aria-label="方案管理">
  <div className="flex flex-wrap gap-2">{allowExpiry&&<button type="button" className={button} disabled={blocked} onClick={()=>{setMode('expiry');setMessage('');}}>調整期限</button>}<button type="button" className={button+' text-red-700'} disabled={blocked} onClick={()=>{setMode('close');setMessage('');}}>註銷方案</button></div>
  {mode&&<div className="min-w-0 space-y-3 rounded-lg border border-earth-200 p-3">
   {mode==='expiry'?<><label className="block">新到期日<input aria-label="新到期日" type="date" min={toLocalDateStr()} className="mt-1 min-h-11 w-full min-w-0 rounded border p-2" disabled={blocked} value={date} onChange={e=>{setDate(e.target.value);onDirtyChange?.(!!reason.trim()||e.target.value!==initialDate);}}/></label>{expiryHint&&<p>{expiryHint}</p>}</>:<p className="break-words">確認後收回剩餘 {card.remaining} {unitLabel}，保留原收款及歷史紀錄；不會自動退款。{card.held>0?'仍有預約占用，請先處理。':''}</p>}
   <label className="block">調整原因<textarea aria-label="調整原因" className="mt-1 min-h-20 w-full min-w-0 rounded border p-2" disabled={blocked} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);onDirtyChange?.(!!e.target.value.trim()||(mode==='expiry'&&date!==initialDate));}}/></label>
   {message&&<p role="alert" className="break-words text-red-700">{message}</p>}
   <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={blocked} onClick={()=>{setMode(null);setReason('');setDate(initialDate);setMessage('');onDirtyChange?.(false);}}>取消</button><button type="button" className={button+' bg-primary-700 text-white'} disabled={pending||!reason.trim()||(mode==='expiry'&&!date)||(mode==='close'&&card.held>0)} onClick={()=>void submit()}>{pending?'處理中…':uncertain?'重試確認結果':mode==='close'?'確認註銷':'儲存期限'}</button></div>
  </div>}
  {!mode&&message&&<p role="status" className="break-words">{message}</p>}
 </section>;
}
