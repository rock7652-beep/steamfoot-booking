"use client";
import {useRef,useState} from 'react';
import {RightSheet} from '@/components/admin/right-sheet';
import {validateBeautyCharge,assertChargePersistence,type BeautyChargeDraft,type ChargeService,type ChargeTechnician} from '@/lib/beauty/charge-editor';
import styles from './charge-editor.module.css';
const button='min-h-11 rounded-lg border border-earth-200 px-3 py-2 text-sm disabled:opacity-50';
export type BeautyChargePort={perChargeTechnicians:boolean;save:(draft:BeautyChargeDraft)=>Promise<{success:boolean;error?:string}>};
/** Uses caller-owned data; the preview never imports a database writer. */
export function BeautyChargeEditor({storeId,services,technicians,onClose,onSaved,port,initialServiceId,initialKind='single',initialDraft}:{storeId:string;services:ChargeService[];technicians:ChargeTechnician[];onClose:()=>void;onSaved?:()=>void;port?:BeautyChargePort;initialServiceId?:string;initialKind?:'single'|'plan';initialDraft?:BeautyChargeDraft}){
 const [kind,setKind]=useState<'single'|'plan'>(initialDraft?.kind??initialKind),[serviceId,setService]=useState(initialDraft?.serviceId??initialServiceId??services.find(s=>s.active)?.id??'');
 const [selected,setSelected]=useState<string[]>(initialDraft?.technicianIds??[]),[error,setError]=useState(''),[summary,setSummary]=useState(''),[pending,setPending]=useState(false);
 const lock=useRef(false),dirty=useRef(false);
 const service=services.find(s=>s.id===serviceId&&s.active),eligible=technicians.filter(t=>t.active&&t.serviceIds.includes(serviceId));
 const visibleTechnicians=[...eligible,...selected.filter(id=>!eligible.some(t=>t.id===id)).map(id=>({id,name:(technicians.find(t=>t.id===id)?.name??'已移除技師')+'（請移除）',active:false,serviceIds:[]}))];
 const chosen=eligible.filter(t=>selected.includes(t.id));
 function close(){if(!lock.current&&(!dirty.current||window.confirm('尚有未儲存設定，確定關閉？')))onClose();}
 return <RightSheet open presentation="centered" fixedHeight width={640} maxHeight={690} onClose={close} closeOnEscape={!pending} labelledById="beauty-charge-title">
  <header className="flex shrink-0 items-center justify-between border-b border-earth-200 px-5 py-3"><h2 id="beauty-charge-title" className="font-semibold">{initialDraft?'編輯收費方式':'新增收費方式'}</h2><button className={button} disabled={pending} onClick={close}>關閉</button></header>
  <form id="beauty-charge-form" className={styles.body} onChange={()=>{dirty.current=true;setError('');setSummary('');}} onSubmit={async e=>{
   e.preventDefault();if(lock.current)return;setError('');setSummary('');
   const data=new FormData(e.currentTarget),number=(key:string)=>Number(data.get(key)),optional=(key:string)=>String(data.get(key)??'').trim()===''?null:number(key);
   try{
    const checked=validateBeautyCharge({expectedStoreId:storeId,kind,serviceId,name:String(data.get('name')),price:number('price'),technicianIds:selected,...(kind==='single'?{sessions:1,trialPrice:optional('trialPrice'),trialMinutes:optional('trialMinutes')}:{sessions:number('sessions'),validDays:number('validDays'),allowShared:data.get('allowShared')==='on'})},storeId,services,technicians);
    if(!port){setSummary(`${checked.draft.name}／${checked.draft.sessions} 次／價格 $${checked.amount}${kind==='single'?checked.trial?`／體驗 $${checked.trial.price}・${checked.trial.duration} 分鐘`:'／不提供體驗':''}／${chosen.map(t=>t.name).join('、')}。僅核對，未儲存。`);return;}
    assertChargePersistence(port);lock.current=true;setPending(true);const result=await port.save(checked.draft);
    if(!result.success)throw Error(result.error??'尚未儲存');dirty.current=false;onSaved?.();onClose();
   }catch(cause){setError(cause instanceof Error?cause.message:'請核對欄位');}finally{lock.current=false;setPending(false);}
  }}>
   <fieldset disabled={pending}>
    <div className={styles.pair}><label className={styles.field}>收費類型<select disabled={!!initialDraft} value={kind} onChange={e=>setKind(e.target.value as 'single'|'plan')}><option value="single">單次收費</option><option value="plan">多次方案</option></select></label><label className={styles.field}>服務項目<select disabled={!!initialDraft} required value={serviceId} onChange={e=>{setService(e.target.value);setSelected([]);}}><option value="">請選擇</option>{services.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
    <small className={styles.duration}>{service?`服務 ${service.duration} 分鐘・整理 ${service.buffer} 分鐘`:'請先建立服務項目'}</small>
    <div className={styles.pair}><label className={styles.field}>收費名稱<input name="name" required maxLength={100} defaultValue={initialDraft?.name}/></label><label className={styles.field}>價格（元）<input name="price" defaultValue={initialDraft?.price} type="number" min={0} max={10000000} required/></label></div>
    {kind==='single'?<div key="single" className={styles.pair}><label className={styles.field}>體驗價（元）<input name="trialPrice" defaultValue={initialDraft?.kind==='single'?initialDraft.trialPrice??'':''} type="number" min={0} max={10000000} placeholder="選填"/><small>留白不開放；0 為免費</small></label><label className={styles.field}>體驗分鐘（選填）<input name="trialMinutes" defaultValue={initialDraft?.kind==='single'?initialDraft.trialMinutes??'':''} type="number" min={5} max={720} placeholder={service?`沿用 ${service.duration} 分鐘`:'選填'}/><small>留白沿用服務時長</small></label></div>:<div key="plan" className={styles.plan}><label className={styles.field}>次數<input name="sessions" defaultValue={initialDraft?.kind==='plan'?initialDraft.sessions:undefined} type="number" min={2} max={10000} required/></label><label className={styles.field}>有效天數<input name="validDays" defaultValue={initialDraft?.kind==='plan'?initialDraft.validDays:undefined} type="number" min={1} max={3650} required/></label><label className={styles.share}><input name="allowShared" defaultChecked={initialDraft?.kind==='plan'&&initialDraft.allowShared} type="checkbox"/>允許具名共用</label></div>}
    <details className={styles.details} open><summary>可安排技師<span className={styles.summary}>{chosen.length?`${chosen.slice(0,2).map(t=>t.name).join('、')}${chosen.length>2?'…':''}・${chosen.length} 位`:'請選擇技師'}</span></summary><div className={styles.techs}>{visibleTechnicians.map(t=><label key={t.id}><input type="checkbox" checked={selected.includes(t.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))}/>{t.name}</label>)}</div>{!eligible.length&&<p className="p-2 text-sm">尚無具此服務資格的啟用技師。</p>}</details>
    <p className={styles.note}>實際可安排時間仍依技師排班與位置空位判斷。</p>
   </fieldset>
   {error&&<p role="alert" className={styles.error}>{error}</p>}{summary&&<p role="status" className="mt-2 text-sm text-primary-800">{summary}</p>}
  </form>
  <footer className={styles.footer}><small>{port?'核對後儲存':'核對模式・不儲存'}</small><button type="button" className={button} disabled={pending} onClick={close}>取消</button><button form="beauty-charge-form" className={button+' bg-primary-700 text-white'} disabled={pending||!chosen.length||!service}>{pending?'處理中…':port?'儲存':'核對設定'}</button></footer>
 </RightSheet>;
}
