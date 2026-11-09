'use client';
import {formatTWDateTime} from '@/lib/date-utils';
import {useRetainedState} from '@/components/operations/operation-scope';
import {useEffect,useRef,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import type {readSteamfootParticipantAddOns,mutateSteamfootParticipantAddOns} from '@/server/actions/steamfoot-add-ons';
import {useSettingsPanelGuard} from '@/components/admin/settings-panel-context';
import {MAX_SHARED_GOODS_QUANTITY,type AddOnModule} from '@/lib/add-ons';
import {SharedGoodsChoices,type GoodsSelection} from './shared-goods-choices';
import {AddOnChoices} from './fields';
type Data=NonNullable<Extract<Awaited<ReturnType<typeof readSteamfootParticipantAddOns>>,{success:true}>['data']>;
const methodLabels:Record<string,string>={CASH:'現金',TRANSFER:'銀行轉帳',LINE_PAY:'LINE Pay',CREDIT_CARD:'信用卡',OTHER:'其他'};
type Draft={selections?:GoodsSelection[];ids:string[];dirty:boolean;revision:number|null};
const validDraft=(value:unknown):value is Draft=>{const d=value as Draft|null;return !!d&&Array.isArray(d.ids)&&d.ids.length<=100&&d.ids.every(id=>typeof id==='string')&&(!d.selections||Array.isArray(d.selections)&&d.selections.length<=100&&d.selections.every(o=>typeof o.id==='string'&&Number.isInteger(o.quantity)&&o.quantity>=1&&o.quantity<=MAX_SHARED_GOODS_QUANTITY))&&typeof d.dirty==='boolean'&&(d.revision===null||Number.isInteger(d.revision));};
export function BookingAddOns({shared=false,initialOpen=false,onStateChange,allowedMethods,module,read,mutate,storeId,bookingId,participantId,blocked,canEdit,canCollect,canRefund,onBusy,onUpdated}:{shared?:boolean;module:AddOnModule;allowedMethods?:string[];initialOpen?:boolean;onStateChange?:(s:{dirty:boolean;busy:boolean})=>void;read:typeof readSteamfootParticipantAddOns;mutate:typeof mutateSteamfootParticipantAddOns;storeId:string;bookingId:string;participantId:string;blocked:boolean;canEdit:boolean;canCollect:boolean;canRefund:boolean;onBusy:(busy:boolean)=>void;onUpdated:()=>void}){
 const reader=usePanelReader(module+(shared?'-shared-goods':'-add-ons'),read,storeId,0),[view,setView]=useState<'summary'|'edit'|'collect'|'refund'>('summary'),[open,setOpen]=useState(initialOpen),[data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[amount,setAmount]=useState(''),[method,setMethod]=useState<'CASH'|'TRANSFER'|'LINE_PAY'|'CREDIT_CARD'|'OTHER'>('OTHER'),[originalId,setOriginalId]=useState(''),request=useRef(crypto.randomUUID()),mounted=useRef(true),lock=useRef(false);
 const [draft,setDraft]=useRetainedState<Draft>(module+(shared?'-shared-goods:':'-addons:')+storeId+':'+bookingId+':'+participantId,{ids:[],dirty:false,revision:null},validDraft);
 const ids=draft.ids,dirty=draft.dirty,draftRef=useRef(draft);draftRef.current=draft;
 useSettingsPanelGuard(dirty,busy);
 useEffect(()=>{onStateChange?.({dirty,busy});},[onStateChange,dirty,busy]);
 const input={storeId,bookingId,participantId};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(!open)return;let active=true;setError('');void reader.read({storeId,bookingId,participantId}).then(r=>{if(!active)return;if(r.success&&r.data){setData(r.data);if(draftRef.current.dirty&&draftRef.current.revision!==(r.data.order?.revision??0)){setError('資料已變更，請重新讀取並捨棄保留草稿');setData(null);return;}
 if(draftRef.current.dirty)setView('edit');
 if(!draftRef.current.dirty)setDraft({ids:r.data.order?.items.map(o=>o.id)??[],selections:r.data.order?.items.map(o=>({id:o.id,quantity:o.quantity}))??[],dirty:false,revision:r.data.order?.revision??0});setAmount(String(Math.max(0,(r.data.order?.total??0)-r.data.collected)));}else setError('error' in r?String(r.error):'讀取失敗');}).catch(()=>{if(active)setError('讀取失敗，請重試');});return()=>{active=false;};},[open,reader,storeId,bookingId,participantId,retry,setDraft]);
 async function run(operation:'SAVE'|'COLLECT'|'REFUND'){
  if(!data||lock.current||blocked||operation==='SAVE'&&!canEdit||operation==='COLLECT'&&!canCollect||operation==='REFUND'&&!canRefund)return;lock.current=true;setBusy(true);onBusy(true);setError('');
  try{const result=await mutate({...input,requestKey:request.current,revision:data.order?.revision??0,catalogRevision:data.catalogRevision,operation,...(operation==='SAVE'?shared?{selections:draft.selections??[]}:{ids}:{amount:Number(amount),method,...(operation==='REFUND'?{originalId}:{})})});if(result.success){reader.invalidate(input);request.current=crypto.randomUUID();if(mounted.current){setDraft({ids:[],dirty:false,revision:null});setView('summary');setData(null);setRetry(n=>n+1);onUpdated();}}else if(mounted.current)setError(result.error);}catch{if(mounted.current)setError('連線中斷，請保留畫面並重試原操作');}finally{lock.current=false;if(mounted.current){setBusy(false);onBusy(false);}}
 }
 const change=()=>{request.current=crypto.randomUUID();};
 const button='min-h-11 rounded-lg border border-earth-200 px-4 py-2 text-base text-earth-700 hover:bg-earth-50 disabled:opacity-50';
 const primary=button+' border-primary-700 bg-primary-700 text-white hover:bg-primary-800';
 const field='mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-earth-200 bg-white px-3 py-2 text-base';
 const cash=(n:number)=>'$'+n.toLocaleString('zh-TW');
 const due=data?.editable?Math.max(0,(data.order?.total??0)-data.collected):0;
 const refundable=data?.receipts.filter(r=>r.amount>0).map(r=>({...r,remaining:r.amount+(data.receipts.filter(other=>other.originalId===r.id).reduce((n,other)=>n+other.amount,0))})).filter(r=>r.remaining>0)??[];
 const selectedReceipt=refundable.find(r=>r.id===originalId);
 const limit=view==='refund'?Math.min(data?.collected??0,selectedReceipt?.remaining??0):due;
 const moneyValid=Number.isSafeInteger(Number(amount))&&Number(amount)>0&&Number(amount)<=limit;
 function startMoney(mode:'collect'|'refund'){
  if(busy||blocked||!data)return;
  setError('');setMethod('OTHER');change();setView(mode);
  if(mode==='collect'){setAmount(String(due));setOriginalId('');}
  else{const first=refundable[0];setOriginalId(first?.id??'');setAmount(String(Math.min(data.collected,first?.remaining??0)));}
 }
 function cancelEdit(){setDraft({ids:data?.order?.items.map(o=>o.id)??[],selections:data?.order?.items.map(o=>({id:o.id,quantity:o.quantity}))??[],dirty:false,revision:data?.order?.revision??0});setError('');setView('summary');change();}
 return <section className="@container mt-3 min-w-0 overflow-visible rounded-xl border border-earth-200 bg-white" aria-label={shared?'共同商品明細':'附加項目明細'}>
  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
   <button type="button" disabled={blocked||busy} className="flex min-h-11 items-center gap-2 text-base font-semibold text-earth-900 disabled:opacity-50" aria-expanded={open} onClick={()=>{
    if(open&&dirty&&!window.confirm('尚有未儲存的附加項目，確定關閉？'))return;
    if(open){setDraft({ids:[],dirty:false,revision:null});setView('summary');}else setData(null);setError('');setOpen(v=>!v);
   }}>{shared?'共同商品（整筆預約）':'附加項目'} <span className="text-earth-400" aria-hidden="true">{open?'▴':'▾'}</span></button>
   <div className="flex items-center gap-2">
   {open&&data&&<details className="relative"><summary aria-label="附加項目說明" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-earth-500 hover:bg-earth-50">ⓘ</summary><div className="absolute right-0 z-20 w-64 max-w-[calc(100vw-3rem)] rounded-lg border border-earth-200 bg-white p-3 text-sm leading-relaxed text-earth-600 shadow-lg">{shared?'共同商品由整筆預約共用，不隨人數自動變更數量。':'附加項目另外計費，不影響原服務與方案扣堂。'}「確認已收款／已退款」僅記錄已完成的款項，不會自動扣款或退款。</div></details>}
   {open&&data&&view==='summary'&&canEdit&&data.canSelect&&data.editable&&<button type="button" className="min-h-11 px-2 text-base text-primary-800 disabled:opacity-50" disabled={blocked||busy} onClick={()=>{setView('edit');setError('');}}>調整品項</button>}
   {open&&view==='edit'&&dirty&&<span className="text-sm text-amber-800">未儲存</span>}
   </div>
  </div>
  {open&&<div className="space-y-4 border-t border-earth-100 px-4 pb-4 pt-3">
   {!data&&!error&&<p role="status" className="py-3 text-earth-600">讀取附加項目中…</p>}
   {data&&<>
    {!data.canSelect&&<p role="status" className="text-sm text-earth-600">附加選購已關閉，既有款項仍可處理。</p>}
    {view==='edit'?<>
     <fieldset disabled={!canEdit||!data.canSelect||blocked||busy||!data.editable}>{shared?<SharedGoodsChoices groups={data.groups} quantityCeilings={data.purchasableIds?Object.fromEntries((data.order?.items??[]).filter(i=>!data.purchasableIds!.includes(i.id)).map(i=>[i.id,i.quantity])):undefined} selections={draft.selections??[]} onChange={next=>{setDraft({ids:next.map(o=>o.id),selections:next,dirty:true,revision:data.order?.revision??0});change();}}/>:<AddOnChoices module={module} imageBasePath="/api/add-ons/images" groups={data.groups} selected={ids} onChange={next=>{setDraft({ids:next,dirty:true,revision:data.order?.revision??0});change();}}/>}</fieldset>
     {!data.groups.length&&<p className="text-earth-600">尚未設定附加項目，請先到設定新增。</p>}
     <div className="flex flex-wrap justify-end gap-2 border-t border-earth-100 pt-3"><button type="button" className={button} disabled={busy||blocked} onClick={cancelEdit}>取消</button><button type="button" className={primary} disabled={busy||blocked||!dirty||!canEdit||!data.canSelect||!data.editable} onClick={()=>run('SAVE')}>{busy?'儲存中…':'儲存附加項目'}</button></div>
    </>:<>
     <div className="divide-y divide-earth-100">{data.order?.items.length?data.order.items.map(item=><div key={item.id} className="flex items-start justify-between gap-4 py-2 first:pt-0"><span className="min-w-0 break-words text-earth-900">{item.name}{shared&&item.quantity>1&&<span className="ml-2 text-earth-500">× {item.quantity}</span>}</span><span className="shrink-0 tabular-nums text-earth-700">{item.price?cash(item.price*item.quantity):'免費'}</span></div>):<p className="py-2 text-earth-500">尚未選擇附加項目</p>}</div>
     {data.order&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-earth-50 px-3 py-3" aria-label="附加項目收款摘要">
      <div><p className="text-sm text-earth-600">{!data.editable?'已停止收款':due>0?'未收':data.order.total===0?'免費項目':'已收齊'}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-earth-900">{cash(due>0?due:data.collected)}</p><p className="mt-1 text-sm text-earth-600">總額 {cash(data.order.total)} · 已收 {cash(data.collected)}</p>{shared&&<p className="mt-1 text-sm text-earth-600">共 {data.order.items.reduce((n,i)=>n+i.quantity,0)} 件</p>}</div>
      {view==='summary'&&canCollect&&data.editable&&due>0&&<button type="button" className={primary} disabled={busy||blocked} onClick={()=>startMoney('collect')}>收款</button>}
     </div>}
     {(view==='collect'||view==='refund')&&<section className="space-y-3 rounded-lg border border-earth-200 p-3" aria-label={view==='refund'?'附加項目退款':'附加項目收款'}>
      <h4 className="font-semibold text-earth-900">{view==='refund'?'退款':'收款'}</h4>
      <fieldset disabled={blocked||busy} className="grid min-w-0 gap-3 @min-[380px]:grid-cols-2">
       {view==='refund'&&<label className="min-w-0 @min-[380px]:col-span-2">原收款<select aria-label="原收款" className={field} value={originalId} onChange={e=>{const receipt=refundable.find(r=>r.id===e.target.value);setOriginalId(e.target.value);setAmount(String(Math.min(data.collected,receipt?.remaining??0)));change();}}>{refundable.map(r=><option key={r.id} value={r.id}>{methodLabels[r.method]??r.method} {cash(r.amount)} · {formatTWDateTime(new Date(r.createdAt))}</option>)}</select></label>}
       <label className="min-w-0">{view==='refund'?'退款金額':'本次收款'}<input aria-label="金額" className={field} inputMode="numeric" type="number" min={1} max={limit} value={amount} onChange={e=>{setAmount(e.target.value);change();}}/></label>
       <label className="min-w-0">{view==='refund'?'退款方式':'付款方式'}<select aria-label="付款方式" className={field} value={method} onChange={e=>{setMethod(e.target.value as typeof method);change();}}>{Object.entries(methodLabels).filter(([value])=>!allowedMethods||allowedMethods.includes(value)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </fieldset>
      {view==='refund'&&<p className="text-sm text-earth-600">最多可退 {cash(limit)}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy||blocked} onClick={()=>{setView('summary');setError('');change();}}>取消</button><button type="button" className={view==='refund'?button+' border-red-200 text-red-700':primary} disabled={busy||blocked||!moneyValid||(view==='refund'?!canRefund:!canCollect)} onClick={()=>run(view==='refund'?'REFUND':'COLLECT')}>{busy?'處理中…':view==='refund'?'確認已退款':'確認已收款'}</button></div>
     </section>}
     {!data.editable&&<p className="text-sm text-earth-600">預約已取消或未到，僅可處理既有款項退款。</p>}
     {view==='summary'&&canRefund&&data.collected>0&&refundable.length>0&&<details><summary className="min-h-11 cursor-pointer py-3 text-earth-600">更多操作</summary><button type="button" className="min-h-11 px-3 text-red-700 disabled:opacity-50" disabled={blocked||busy} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');startMoney('refund');}}>退款</button></details>}
     {data.receipts.length>0&&<details className="border-t border-earth-100"><summary className="min-h-11 cursor-pointer py-3 text-earth-600">收退款紀錄</summary><div className="divide-y divide-earth-100">{data.receipts.map(r=><div key={r.id} className="flex flex-wrap justify-between gap-2 py-2"><div><p>{r.amount<0?'退款':'收款'} · {methodLabels[r.method]??r.method}</p><p className="mt-1 text-sm text-earth-500">{formatTWDateTime(new Date(r.createdAt))}</p></div><span className="tabular-nums">{r.amount<0?'−':''}{cash(Math.abs(r.amount))}</span></div>)}</div></details>}
    </>}
   </>}
   {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
   {!data&&error&&<button type="button" className={button} onClick={()=>{setDraft({ids:[],dirty:false,revision:null});setRetry(n=>n+1);}}>重新讀取</button>}
  </div>}
 </section>;
}
