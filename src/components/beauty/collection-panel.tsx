"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePanelReader} from '@/components/operations/panel-read-cache';
import {ServiceCollectionFields,type ServiceCollectionValue} from '@/components/admin/service-collection-fields';
import {readBeautyCollection,collectBeautyPayment} from '@/server/actions/beauty';
import {ModalPanel} from '@/components/admin/modal-panel';
import {COURSE_PAYMENT_LABELS} from '@/lib/course-checkout';
import type {ServiceCharge} from '@/server/beauty/service-charges';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-base disabled:opacity-50';
type Props={ids:string[];canDiscount:boolean;onClose:()=>void;onSaved:()=>void;onGuard:(dirty:boolean,pending:boolean)=>void;modal?:boolean};
export function BeautyCollectionPanel(props:Props){
 // A different target owns a new draft, quote and request identity. The roster stays mounted.
 return <CollectionDraft key={JSON.stringify(props.ids)} {...props}/>;
}
function CollectionDraft({ids,canDiscount,onClose,onSaved,onGuard,modal=false}:Props){
 const reader=usePanelReader('beauty-service-collection',readBeautyCollection,'',0),key=JSON.stringify(ids);
 const target=useRef(ids).current;
 const [charges,setCharges]=useState<ServiceCharge[]|null>(null),[values,setValues]=useState<Record<string,ServiceCollectionValue>>({}),[error,setError]=useState(''),[retry,setRetry]=useState(0),[pending,setPending]=useState(false),[dirty,setDirty]=useState(false);
 const lock=useRef(false),request=useRef(crypto.randomUUID());
 useEffect(()=>{onGuard(dirty,pending);return()=>onGuard(false,false);},[dirty,pending,onGuard]);
 useEffect(()=>{let active=true;reader.clear();reader.read(JSON.parse(key)).then(r=>{if(active){if(r.success){if(r.data.length!==target.length||new Set(r.data.map(c=>c.id)).size!==target.length||!r.data.every(c=>target.includes(c.id))){setError('收款對象不符，請關閉後重新開啟');return;}setCharges(r.data);}else setError(r.error);}}).catch(()=>{if(active)setError('讀取收款資料失敗，請重試');});return()=>{active=false;};},[key,retry,reader,target]);
 const update=useCallback((v:ServiceCollectionValue)=>setValues(old=>{const prior=old[v.id];return prior&&prior.amount===v.amount&&prior.valid===v.valid&&prior.discount.kind===v.discount.kind&&Object.is(prior.discount.value,v.discount.value)?old:{...old,[v.id]:v};}),[]);
 const valid=!!charges&&charges.length===ids.length&&charges.every(c=>ids.includes(c.id))&&charges.every(c=>values[c.id]?.valid)&&charges.some(c=>{const v=values[c.id];return v&&(v.amount>0||v.discount.kind!==c.discount.kind||v.discount.value!==c.discount.value);});
 const settled=!!charges&&charges.length===ids.length&&charges.every(c=>c.due===0);
 const needsPayment=charges?.some(c=>(values[c.id]?.amount??c.due)>0)??false;
 const method=needsPayment?<label className="block">付款方式<select name="method" required className="min-h-11 w-full rounded-lg border border-earth-200 bg-white p-2 text-base">{Object.entries(COURSE_PAYMENT_LABELS).filter(([k])=>k!=='DISCOUNT').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>:null;
 const close=()=>{if(!lock.current&&!pending)onClose();};
 const content=<form className="min-h-0 min-w-0 space-y-3 overflow-y-auto p-4" onChangeCapture={()=>{setDirty(true);request.current=crypto.randomUUID();setError('');}} onSubmit={async e=>{e.preventDefault();if(lock.current||!valid||!charges)return;const form=new FormData(e.currentTarget);lock.current=true;setPending(true);setError('');try{const r=await collectBeautyPayment({requestKey:request.current,ids:charges.map(c=>c.id),amounts:charges.map(c=>values[c.id].amount),quotes:charges.map(c=>({id:c.id,revision:c.revision,price:c.price,collected:c.collected,...(canDiscount?{discount:values[c.id].discount}:{})})),method:form.get('method')??'CASH',note:form.get('note')??''});if(r.success){setDirty(false);onSaved();}else setError(r.error);}catch{setError('收款結果尚未確認，請保留資料重試，勿重複登錄');}finally{lock.current=false;setPending(false);}}}>
  <header className="flex items-center justify-between gap-2"><h2 id="beauty-collection-title" className="font-semibold">服務收款</h2><button type="button" className={button} disabled={pending} onClick={close}>關閉</button></header>
  {!charges&&!error&&<p role="status">核對應收與已收款…</p>}
  {settled&&<p role="status">本次無待收款金額。</p>}
  <fieldset disabled={pending||settled} className="min-w-0 space-y-3">{charges?.map(c=><ServiceCollectionFields key={c.id} charge={c} compact={modal} paymentControl={modal&&charges.length===1?method:undefined} canDiscount={canDiscount} onValue={update}/>)}
  {charges&&<>{(!modal||charges.length!==1)&&method}<details><summary className="min-h-11 cursor-pointer py-2">備註（選填）</summary><input name="note" maxLength={500} className="min-h-11 w-full rounded-lg border border-earth-200 p-2 text-base"/></details></>}
  </fieldset>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {!charges&&error&&<button type="button" className={button} onClick={()=>{setError('');setRetry(n=>n+1);}}>重新讀取</button>}
  <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-white py-3"><button type="button" className={button} disabled={pending} onClick={close}>{modal?'取消':'返回'}</button><button type={settled?"button":"submit"} onClick={settled?onSaved:undefined} className={button+' bg-primary-700 text-white'} disabled={pending||!settled&&!valid}>{pending?'儲存中…':settled?'完成':valid&&!needsPayment?'確認折抵':'確認收款'}</button></footer>
 </form>;
 return modal?<ModalPanel open onClose={close} labelledById="beauty-collection-title" pending={pending} width={560}>{content}</ModalPanel>:content;
}
