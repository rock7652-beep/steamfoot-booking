"use client";
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {DataTable,type Column} from '@/components/desktop';
import {BeautyCourseCatalog} from './catalog-adapter';
import {BeautyChargeEditor} from './charge-editor';
import {BeautyOpeningGuide} from './opening-guide';
import {saveBeautyCharge} from '@/server/actions/beauty-charge';
import type {BeautyChargeDraft} from '@/lib/beauty/charge-editor';
import type {BeautyDashboardData} from '@/server/beauty/queries';
const button='min-h-11 rounded-lg border border-earth-200 px-3 text-sm';
type Row={id:string;label:string;type:string;sessions:number;price:number;service:string;edit:()=>void};
export function BeautyChargeWorkspace({data,canEdit}:{data:BeautyDashboardData;canEdit:boolean}){
 const router=useRouter(),[editor,setEditor]=useState<{draft?:BeautyChargeDraft;planId?:string;revision?:number}|null>(null),[legacy,setLegacy]=useState(false);
 const requestKeys=useRef(new Map<string,string>());
 const enabled=data.chargeCatalog?.enabled===true;
 const editable=canEdit&&(!enabled||data.chargeCatalog?.editingEnabled===true);
 const rows:Row[]=[...data.services.filter(s=>s.active).map(s=>{const meta=data.chargeCatalog?.singles.find(row=>row.id===s.id);return {id:'service:'+s.id,label:meta?.name??s.name,type:meta?.configured===false?'單次・未定價':meta?.configured===null?'單次・待核對':'單次',sessions:1,price:s.price,service:s.name,edit:()=>setEditor({revision:s.revision,draft:{expectedStoreId:data.storeId,kind:'single',serviceId:s.id,name:meta?.name??s.name,price:s.price,sessions:1,trialPrice:s.trialPrice,trialMinutes:s.trialDuration??null,technicianIds:meta?.rule.mode==='SELECTED'?meta.rule.technicianIds:[]}})};}),...data.plans.map(p=>{const meta=data.chargeCatalog?.plans.find(row=>row.id===p.id);return {id:'plan:'+p.id,label:p.name,type:p.serviceIds.length>1?'既有多服務方案':p.sessions===1?'既有單次方案':'多次方案',sessions:p.sessions,price:p.price,service:data.services.filter(s=>p.serviceIds.includes(s.id)).map(s=>s.name).join('、'),edit:()=>{if(p.serviceIds.length!==1||p.sessions<2){setLegacy(true);return;}setEditor({planId:p.id,revision:p.revision,draft:{expectedStoreId:data.storeId,kind:'plan',serviceId:p.serviceIds[0],name:p.name,price:p.price,sessions:p.sessions,validDays:p.validDays,allowShared:p.allowShared,technicianIds:meta?.rule.mode==='SELECTED'?meta.rule.technicianIds:[]}});}};})];
 const columns:Column<Row>[]=[{key:'name',header:'收費方式',accessor:row=>row.label},{key:'type',header:'類型',accessor:row=>row.type},{key:'service',header:'服務',accessor:row=>row.service},{key:'sessions',header:'次數',accessor:row=>row.sessions},{key:'price',header:'價格',accessor:row=>row.price.toLocaleString('zh-TW')},{key:'edit',header:'操作',accessor:row=>editable?<button className={button} onClick={row.edit}>設定</button>:null}];
 if(data.chargeRulesActive&&!data.chargeCatalog)return <p role="status" className="text-sm">新版收費設定需要人員檢視權限，請由有權限者操作。</p>;
 return <><div className="mb-3 flex flex-wrap items-center justify-end gap-2"><BeautyOpeningGuide data={data}/>{enabled&&<button className={button} onClick={()=>setLegacy(value=>!value)}>{legacy?'返回收費清單':'既有方案進階設定'}</button>}{editable&&<button className={button} onClick={()=>setEditor({})}>{enabled?'新增收費方式':'新版收費設定核對'}</button>}</div>{enabled&&!legacy?<DataTable rows={rows} rowKey={row=>row.id} columns={columns}/>:<BeautyCourseCatalog tab="收費方式" data={data} canEdit={editable}/>}{editor&&<BeautyChargeEditor key={data.storeId+':'+(editor.planId??editor.draft?.serviceId??'new')} storeId={data.storeId} services={data.services} technicians={data.techs} initialDraft={editor.draft} onClose={()=>{setEditor(null);requestKeys.current.clear();}} onSaved={()=>router.refresh()} port={enabled&&editable?{perChargeTechnicians:true,save:async draft=>{const payload=JSON.stringify(draft);if(!requestKeys.current.has(payload))requestKeys.current.set(payload,crypto.randomUUID());return saveBeautyCharge({draft,planId:editor.planId,expectedRevision:editor.revision??(draft.kind==='single'?data.services.find(s=>s.id===draft.serviceId)?.revision??0:0),requestKey:requestKeys.current.get(payload)!});}}:undefined}/>}</>;
}
