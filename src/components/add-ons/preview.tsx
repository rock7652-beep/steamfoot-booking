'use client';
import {useId,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {SharedGoodsChoices,type GoodsSelection} from './shared-goods-choices';
import {RightSheet} from '@/components/admin/right-sheet';
import {beautyServiceGoodsGroups} from '@/lib/beauty/shared-goods';
import {courseSubjectAddOnGroups,moduleAddOnGroups,addOnCatalogError,type AddOnGroup,type AddOnModule} from '@/lib/add-ons';

export function AddOnPreview({groups,module,subjects=[],onClose,renderChoices}:{subjects?:import('@/lib/add-ons').AddOnTeachingSubject[];groups:unknown;module:AddOnModule;onClose:()=>void;renderChoices:(groups:AddOnGroup[],selected:string[],onChange:(ids:string[])=>void)=>ReactNode}){
 const [goods,setGoods]=useState<GoodsSelection[]>([]);
 const [subjectId,setSubjectId]=useState('');
 const course=module==='FITNESS'||module==='MUSIC',mapped=course||module==='BEAUTY',subjectLabel=module==='BEAUTY'?'服務項目':'教學項目';
 const title=useId(),[selected,setSelected]=useState<string[]>([]);
 let catalog:AddOnGroup[]=[],error='';
 try{catalog=course?courseSubjectAddOnGroups(module,groups,subjectId):module==='BEAUTY'?beautyServiceGoodsGroups(moduleAddOnGroups(module,groups),[subjectId]):moduleAddOnGroups(module,groups);}catch(e){error=addOnCatalogError(e);}
 const total=catalog.filter(g=>g.kind!=='SHARED_GOODS').flatMap(g=>g.options).filter(o=>o.active&&selected.includes(o.id)).reduce((sum,o)=>sum+o.price,0)+catalog.filter(g=>g.kind==='SHARED_GOODS').flatMap(g=>g.options).reduce((sum,o)=>sum+o.price*(goods.find(g=>g.id===o.id)?.quantity??0),0);
 return createPortal(<div onChange={event=>event.stopPropagation()} onKeyDownCapture={event=>{if(event.key==='Escape'&&event.target instanceof Element&&event.target.closest('dialog[open]'))event.stopPropagation();}}>
  <RightSheet open compact width={480} labelledById={title} onClose={onClose}>
   <header className="flex shrink-0 items-center justify-between gap-3 border-b border-earth-200 px-4 py-3"><h2 id={title} className="font-semibold text-primary-900">顧客畫面預覽</h2><button type="button" aria-label="關閉附加項目預覽" className="min-h-11 min-w-11 rounded-lg text-earth-600 hover:bg-earth-50" onClick={onClose}>✕</button></header>
   <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
    <p className="rounded-lg bg-earth-50 p-3 text-sm leading-relaxed text-earth-600">預覽目前編輯的附加項目，不會建立預約。此處不是完整的顧客預約頁。</p>
    {mapped&&<label className="block text-earth-800">{subjectLabel}<select aria-label={subjectLabel} className="mt-1 min-h-11 w-full rounded-lg border border-earth-200 bg-white px-3 text-base" value={subjectId} onChange={e=>{setSubjectId(e.target.value);setSelected([]);setGoods([]);}}><option value="">請選擇{subjectLabel}</option>{subjects.filter(s=>s.isActive).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>:catalog.some(g=>g.options.some(o=>o.active))?<>{renderChoices(catalog.filter(g=>g.kind!=='SHARED_GOODS'&&g.options.some(o=>o.active)),selected,setSelected)}<SharedGoodsChoices groups={catalog} selections={goods} onChange={setGoods}/></>:<p className="py-6 text-earth-500">目前沒有啟用的附加項目</p>}
   </div>
   {!error&&<footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-earth-200 bg-white p-4"><span className="text-earth-600">附加項目小計</span><strong className="text-2xl tabular-nums text-primary-900">${total.toLocaleString('zh-TW')}</strong></footer>}
  </RightSheet>
 </div>,document.body);
}
