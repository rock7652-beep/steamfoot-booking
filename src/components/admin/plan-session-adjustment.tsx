'use client';
import {useRef,useState} from 'react';
import {toast} from 'sonner';
import {formatTWDateTime,toLocalDateStr} from '@/lib/date-utils';
import {activeSessionAdjustments,type SessionAdjustmentInput,type SessionAdjustmentRecord,type SessionAdjustmentResult} from '@/lib/plan-session-adjustment';
import type {ManagedPlan} from './plan-management-controls';

export type SessionAdjustmentPort={
  save:(input:SessionAdjustmentInput)=>Promise<SessionAdjustmentResult>;
  records:SessionAdjustmentRecord[];members:Array<{id:string;name:string}>;blockedReason?:string;
};
const field='min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-sm';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
export function PlanSessionAdjustment({storeId,card,port,unitLabel,onPending,onDirtyChange,onSaved,onCancel}:{
  storeId:string;card:ManagedPlan;port:SessionAdjustmentPort;unitLabel:string;
  onPending:(pending:boolean)=>void;onDirtyChange?:(dirty:boolean)=>void;onSaved:()=>void;onCancel:()=>void;
}){
  const [operation,setOperation]=useState<SessionAdjustmentInput['operation']>('BACKFILL');
  const [quantity,setQuantity]=useState('1'),[date,setDate]=useState(''),[reason,setReason]=useState('');
  const [customerId,setCustomerId]=useState(port.members.length===1?port.members[0].id:'');
  const [original,setOriginal]=useState<SessionAdjustmentRecord|null>(null);
  const [pending,setPending]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState('');
  const [hasError,setHasError]=useState(false);
  const [records,setRecords]=useState(port.records),[remaining,setRemaining]=useState(card.remaining),[limit,setLimit]=useState(20);
  const [expiresAt,setExpiresAt]=useState(card.expiresAt);
  const frozen=useRef<SessionAdjustmentInput|null>(null),busy=useRef(false),blocked=pending||uncertain;
  const amount=Number(quantity),available=Math.max(0,remaining-card.held);
  const valid=!!customerId&&Number.isInteger(amount)&&amount>0&&amount<=1000&&(operation==='REVERSE'||amount<=available)&&
    (operation!=='BACKFILL'||!!date&&date<=toLocalDateStr());
  const active=new Set(activeSessionAdjustments(records).map(r=>r.id));
  async function submit(){
    if(busy.current||(!frozen.current&&!valid)||port.blockedReason)return;
    frozen.current??={expectedStoreId:storeId,requestKey:crypto.randomUUID(),cardId:card.id,customerId,operation,quantity:amount,expectedRemaining:remaining,expectedExpiresAt:expiresAt,reason,...(operation==='BACKFILL'?{occurredOn:date}:{}),...(original?{reversalOf:original.id}:{})};
    busy.current=true;setPending(true);onPending(true);setMessage('');setHasError(false);let unknown=false;
    try{
      const result=await port.save(frozen.current);
      if(!result.success){unknown=!!result.uncertain;setUncertain(unknown);if(!unknown)frozen.current=null;setHasError(true);setMessage(result.error);return;}
      frozen.current=null;setUncertain(false);setRemaining(result.data.remaining);setExpiresAt(result.data.expiresAt);
      setRecords(previous=>[result.data.record,...previous.filter(r=>r.id!==result.data.record.id)]);
      setReason('');setDate('');setQuantity('1');setOriginal(null);setOperation('BACKFILL');onDirtyChange?.(false);
      const text=`已${result.data.record.operation==='BACKFILL'?'補登上課並扣除':result.data.record.operation==='VOID'?'註銷':'更正返還'} ${result.data.record.quantity} ${unitLabel}，剩餘 ${result.data.remaining} ${unitLabel}。`;
      setMessage(result.syncWarning?text+'畫面同步待確認，請勿重複送出。':text);toast.success(text);
      try{onSaved();}catch{setMessage(text+'畫面更新失敗，請重新開啟核對，勿重複送出。');}
    }catch{unknown=true;setUncertain(true);setHasError(true);setMessage('結果待確認，請用原內容重試，勿另建操作。');}
    finally{busy.current=false;setPending(false);onPending(unknown);}
  }
  return <section className="@container space-y-3 rounded-lg border border-earth-200 p-3 text-sm" aria-label="調整堂數">
    <h3 className="font-semibold">調整堂數</h3>
    {port.blockedReason?<p role="status">{port.blockedReason}</p>:<>
      {operation==='REVERSE'?<p>更正「{original?.operation==='BACKFILL'?'補登已上課':'註銷堂數'}」紀錄，返還 {amount} {unitLabel}。原紀錄保留。</p>:<label className="block">調整類型<select className={field+' mt-1'} aria-label="調整類型" disabled={blocked} value={operation} onChange={e=>{setOperation(e.target.value as 'BACKFILL'|'VOID');onDirtyChange?.(true);}}><option value="BACKFILL">補登已上課</option><option value="VOID">註銷堂數</option></select></label>}
      {port.members.length>1?<label className="block">學員／顧客<select className={field+' mt-1'} aria-label="調整學員" disabled={blocked||operation==='REVERSE'} value={customerId} onChange={e=>{setCustomerId(e.target.value);onDirtyChange?.(true);}}><option value="">請選擇</option>{port.members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>:<p>{port.members[0]?.name}</p>}
      <div className="grid min-w-0 gap-3 @min-[420px]:grid-cols-2">
        <label className="block">{unitLabel==='點'?'調整點數':'堂數'}<input type="number" aria-label="調整數量" className={field+' mt-1'} min={1} max={operation==='REVERSE'?1000:available} step={1} value={quantity} disabled={blocked||operation==='REVERSE'} onChange={e=>{setQuantity(e.target.value);onDirtyChange?.(true);}}/></label>
        {operation==='BACKFILL'&&<label className="block">實際上課日期<input type="date" aria-label="實際上課日期" className={field+' mt-1'} max={toLocalDateStr()} value={date} disabled={blocked} onChange={e=>{setDate(e.target.value);onDirtyChange?.(true);}}/></label>}
      </div>
      <label className="block">原因（選填）<textarea aria-label="調整原因（選填）" className={field+' mt-1 min-h-20'} maxLength={500} value={reason} disabled={blocked} onChange={e=>{setReason(e.target.value);onDirtyChange?.(true);}}/></label>
      <p className="rounded-lg bg-earth-50 p-3" aria-live="polite">剩餘 {remaining} → {Number.isInteger(amount)&&amount>0?remaining+(operation==='REVERSE'?amount:-amount):'—'} {unitLabel}{operation!=='REVERSE'&&`；目前可調整 ${available} ${unitLabel}（不含預約占用）`}。</p>
      <p className="text-earth-600">{operation==='BACKFILL'?'補記實際上課並扣除方案額度；不新增收款、薪資或業績。':operation==='VOID'?'僅收回方案額度，不記為上課，也不自動退款。':'以新紀錄返還額度，不刪除原紀錄。'}</p>
    </>}
    {message&&<p role={hasError?'alert':'status'} className={'break-words '+(hasError?'text-red-700':'text-primary-800')}>{message}</p>}
    <div className="flex flex-wrap justify-end gap-2"><button className={button} type="button" disabled={blocked} onClick={()=>{onDirtyChange?.(false);onCancel();}}>取消</button>{!port.blockedReason&&<button className={button+' bg-primary-700 text-white'} type="button" disabled={pending||(!uncertain&&!valid)} onClick={()=>void submit()}>{pending?'處理中…':uncertain?'重試確認結果':operation==='REVERSE'?'確認更正返還':'確認調整'}</button>}</div>
    {!!records.length&&<details open className="border-t border-earth-100 pt-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">堂數調整紀錄（{records.length}）</summary><ul className="divide-y divide-earth-100">{records.slice(0,limit).map(r=><li key={r.id} className="space-y-1 py-3">
      <p className="font-medium">{r.customerName} · {r.operation==='BACKFILL'?'補登已上課':r.operation==='VOID'?'註銷堂數':'更正返還'} {r.quantity} {unitLabel}{r.operation!=='REVERSE'&&!active.has(r.id)?'（已更正）':''}</p>
      {r.occurredOn&&<p>實際上課：{r.occurredOn}</p>}
      <p>操作：{formatTWDateTime(new Date(r.recordedAt))} · {r.actorName}</p>
      <p>原因：{r.reason||'未填寫'} · 剩餘 {r.remainingBefore} → {r.remainingAfter} {unitLabel}</p>
      {!!r.slots?.length&&<p>音樂堂次：{r.slots.map(s=>`第 ${s.period} 期第 ${s.ordinal} 堂`).join('、')}</p>}
      {!port.blockedReason&&active.has(r.id)&&<button type="button" className={button} disabled={blocked} onClick={()=>{setOriginal(r);setOperation('REVERSE');setCustomerId(r.customerId);setQuantity(String(r.quantity));setDate('');setReason('');setMessage('');onDirtyChange?.(true);}}>更正返還</button>}
    </li>)}</ul>{records.length>limit&&<button type="button" className={button} onClick={()=>setLimit(n=>n+20)}>顯示更多紀錄</button>}</details>}
  </section>;
}
