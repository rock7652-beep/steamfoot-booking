"use client";
import {useRef,useState} from 'react';
import {useCourseDisplayOrder} from '@/components/admin/course-display-order';
import {saveBeautyDisplayOrder} from '@/server/actions/beauty-display-order';
import {orderCourseRows} from '@/lib/course-display-order';
import {useRouter,useSearchParams} from 'next/navigation';
import {DataTable,type Column} from '@/components/desktop';
import {BeautyCourseCatalog} from './catalog-adapter';
import {BeautyChargeEditor} from './charge-editor';
import {BeautyOpeningGuide} from './opening-guide';
import {saveBeautyCharge} from '@/server/actions/beauty-charge';
import type {BeautyChargeDraft} from '@/lib/beauty/charge-editor';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const button='min-h-11 rounded-lg border border-earth-200 px-3 text-sm';
type Editor={draft?:BeautyChargeDraft;planId?:string;revision?:number};
type Row={serviceIds:string[];id:string;label:string;type:string;sessions:number;price:number;service:string;edit:()=>void};
export function BeautyChargeWorkspace({data,canEdit}:{data:BeautyDashboardData;canEdit:boolean}){
 const router=useRouter(),[editor,setEditor]=useState<Editor|null>(null),[legacy,setLegacy]=useState(false);
 const [confirmed,setConfirmed]=useState<Record<string,{draft:BeautyChargeDraft;revision:number}>>({});
 // A successful write is authoritative while router.refresh still supplies the previous catalog.
 // Never override an equal/newer server revision, or a different store's record.
 function openEditor(value:Editor){
  const draft=value.draft,id=value.planId??draft?.serviceId;
  const saved=draft&&id?confirmed[`${data.storeId}:${draft.kind}:${id}`]:undefined;
  setEditor(saved&&saved.revision>(value.revision??0)?{...value,draft:saved.draft,revision:saved.revision}:value);
 }
 const requestKeys=useRef(new Map<string,string>());
 const enabled=data.chargeCatalog?.enabled===true;
 const editable=canEdit&&(!enabled||data.chargeCatalog?.editingEnabled===true);
 const rows:Row[]=[...data.services.filter(s=>s.active).map(s=>{const meta=data.chargeCatalog?.singles.find(row=>row.id===s.id);return {serviceIds:[s.id],id:'service:'+s.id,label:meta?.name??s.name,type:meta?.configured===false?'單次・未定價':meta?.configured===null?'單次・待核對':'單次',sessions:1,price:s.price,service:s.name,edit:()=>openEditor({revision:s.revision,draft:{trialStoreCost:meta?.trialStoreCost??null,storeCost:meta?.storeCost??null,expectedStoreId:data.storeId,kind:'single',serviceId:s.id,name:meta?.name??s.name,price:s.price,sessions:1,trialPrice:s.trialPrice,trialMinutes:s.trialDuration??null,technicianIds:meta?.rule.mode==='SELECTED'?meta.rule.technicianIds:[]}})};}),...data.plans.map(p=>{const meta=data.chargeCatalog?.plans.find(row=>row.id===p.id);return {serviceIds:p.serviceIds,id:'plan:'+p.id,label:p.name,type:p.serviceIds.length>1?'既有多服務方案':p.sessions===1?'既有單次方案':'多次方案',sessions:p.sessions,price:p.price,service:data.services.filter(s=>p.serviceIds.includes(s.id)).map(s=>s.name).join('、'),edit:()=>{if(p.serviceIds.length!==1||p.sessions<2){setLegacy(true);return;}openEditor({planId:p.id,revision:p.revision,draft:{storeCost:meta?.storeCost??null,expectedStoreId:data.storeId,kind:'plan',serviceId:p.serviceIds[0],name:p.name,price:p.price,sessions:p.sessions,validDays:p.validDays,allowShared:p.allowShared,technicianIds:meta?.rule.mode==='SELECTED'?meta.rule.technicianIds:[]}});}};})];
 const requested=useSearchParams().get('serviceId')??'';
 const [selection,setSelection]=useState({requested,value:requested}),[categoryFilter,setCategoryFilter]=useState(''),[query,setQuery]=useState('');
 if(selection.requested!==requested)setSelection({requested,value:requested});
 const serviceFilter=selection.requested===requested?selection.value:requested;
 const setServiceFilter=(value:string)=>setSelection({requested,value});
 const groupKey=(row:Row)=>row.serviceIds.length===1?row.serviceIds[0]:'legacy';
 const order=useCourseDisplayOrder('plan',rows,data.displayOrders?.plan,editable&&!legacy&&!query,row=>groupKey(row),saveBeautyDisplayOrder);
 const groups=[...orderCourseRows(data.services,data.displayOrders?.subject?.ids??[]).map(s=>({id:s.id,label:s.name,category:s.category})),{id:'legacy',label:'既有跨服務方案',category:''}];
 const filtered=order.rows.filter(row=>(!serviceFilter||row.serviceIds.includes(serviceFilter))&&(!categoryFilter||data.services.some(s=>row.serviceIds.includes(s.id)&&s.category===categoryFilter))&&(!query||[row.label,row.service].some(v=>v.includes(query))));
 const columns:Column<Row>[]=[{key:'name',header:'收費方式',accessor:row=><span className="inline-flex items-center gap-2">{editable&&order.handle(row.id,row.label)}{row.label}</span>},{key:'type',header:'類型',accessor:row=>row.type},{key:'service',header:'服務',accessor:row=>row.service},{key:'sessions',header:'次數',accessor:row=>row.sessions},{key:'price',header:'價格',accessor:row=>/未定價|待核對/.test(row.type)?'未設定':row.price.toLocaleString('zh-TW')},{key:'edit',header:'操作',accessor:row=>editable?<button className={button} onClick={row.edit}>設定</button>:null}];
 if(data.chargeRulesActive&&!data.chargeCatalog)return <p role="status" className="text-sm">新版收費設定需要人員檢視權限，請由有權限者操作。</p>;
 return <><div className="mb-3 flex flex-wrap items-center justify-end gap-2"><BeautyOpeningGuide data={data}/>{enabled&&<button className={button} onClick={()=>setLegacy(value=>!value)}>{legacy?'返回收費清單':'既有方案進階設定'}</button>}{editable&&<button className={button} onClick={()=>setEditor({})}>{enabled?'新增收費方式':'新版收費設定核對'}</button>}</div>{enabled&&!legacy?<section aria-label="依服務分類的收費方式" className="space-y-3"><div className="flex flex-wrap gap-2"><input className={button} aria-label="搜尋收費方式" placeholder="搜尋收費方式或服務" value={query} onChange={e=>setQuery(e.target.value)}/><select className={button} aria-label="收費服務篩選" value={serviceFilter} onChange={e=>setServiceFilter(e.target.value)}><option value="">全部服務</option>{data.services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select className={button} aria-label="收費分類篩選" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">全部分類</option>{[...new Set(data.services.map(s=>s.category).filter(Boolean))].map(c=><option key={c}>{c}</option>)}</select>{(query||serviceFilter||categoryFilter)&&<button className={button} onClick={()=>{setQuery('');setServiceFilter('');setCategoryFilter('');}}>清除篩選</button>}</div>{groups.map(group=>{const members=filtered.filter(row=>groupKey(row)===group.id);return members.length?<section key={group.id} aria-label={group.label+'收費方式'} className="min-w-0 overflow-x-auto rounded-xl border border-earth-200"><h3 className="bg-primary-50 px-4 py-3 font-semibold">{group.label}{group.category&&<span className="ml-3 text-sm font-normal text-earth-600">{group.category}</span>}</h3><DataTable rows={members} rowKey={row=>row.id} rowAttributes={row=>order.rowProps(row.id)} columns={columns}/></section>:null;})}{!filtered.length&&<p role="status" className="p-4 text-earth-600">沒有符合條件的收費方式</p>}</section>:<BeautyCourseCatalog tab="收費方式" data={data} canEdit={editable}/>}{editor&&<BeautyChargeEditor key={data.storeId+':'+(editor.planId??editor.draft?.serviceId??'new')} storeId={data.storeId} services={data.services} technicians={data.techs} initialDraft={editor.draft} onClose={()=>{setEditor(null);requestKeys.current.clear();}} onSaved={()=>router.refresh()} port={enabled&&editable?{perChargeTechnicians:true,save:async draft=>{const payload=JSON.stringify(draft);if(!requestKeys.current.has(payload))requestKeys.current.set(payload,crypto.randomUUID());const result=await saveBeautyCharge({draft,planId:editor.planId,expectedRevision:editor.revision??(draft.kind==='single'?data.services.find(s=>s.id===draft.serviceId)?.revision??0:0),requestKey:requestKeys.current.get(payload)!});if(result.success){const key=`${data.storeId}:${result.data.kind}:${result.data.id}`;setConfirmed(current=>(current[key]?.revision??-1)>=result.data.revision?current:{...current,[key]:{draft,revision:result.data.revision}});}return result;}}:undefined}/>}</>;
}
