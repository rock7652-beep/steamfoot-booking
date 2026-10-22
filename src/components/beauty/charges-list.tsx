"use client";
import {useState} from 'react';
import {DataTable,type Column} from '@/components/desktop';
import {RightSheet} from '@/components/admin/right-sheet';
import {RosterToolbar,RosterMoreMenu} from '@/components/admin/roster-primitives';
import {useRetainedState,retainedString,retainedPage} from '@/components/operations/operation-scope';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {EditorKind} from './catalog-editor';

type Service=BeautyDashboardData['services'][number];
type Plan=BeautyDashboardData['plans'][number];
type Charge={id:string;name:string;type:'single'|'trial'|'plan';price:number|null;active:boolean;services:string[];source:Service|Plan};
const labels={single:'單次',trial:'體驗',plan:'次數方案'};
const field='min-h-11 min-w-0 rounded-lg border border-earth-200 bg-white px-3 text-sm';
export function BeautyChargesList({data,canEdit,onEdit}:{data:BeautyDashboardData;canEdit:boolean;onEdit:(kind:EditorKind,draft?:Record<string,unknown>)=>void}){
 const [search,setSearch]=useRetainedState('beauty:charges:search','',retainedString),[type,setType]=useRetainedState('beauty:charges:type','all',retainedString),[status,setStatus]=useRetainedState('beauty:charges:status','active',retainedString),[page,setPage]=useRetainedState('beauty:charges:page',0,retainedPage);
 const [sort,setSort]=useRetainedState('beauty:charges:sort','name',retainedString);
 const [creating,setCreating]=useState(false),[newType,setNewType]=useState(''),[serviceId,setServiceId]=useState('');
 const charges:Charge[]=[...data.services.flatMap(s=>(['single','trial'] as const).map(type=>({id:`${type}:${s.id}`,name:s.name,type,price:type==='single'?s.price:s.trialPrice,active:s.active,services:[s.id],source:s}))),...data.plans.map(p=>({id:p.id,name:p.name,type:'plan' as const,price:p.price,active:p.active,services:p.serviceIds,source:p}))];
 const rows=charges.filter(r=>r.name.includes(search)&&(type==='all'||r.type===type)&&(status==='all'||r.active===(status==='active'))).sort((a,b)=>Number(b.active)-Number(a.active)||(sort==='price'?(a.price??0)-(b.price??0):(sort==='reverse'?-1:1)*a.name.localeCompare(b.name,'zh-TW'))||a.type.localeCompare(b.type));
 const currentPage=Math.min(page,Math.max(0,Math.ceil(rows.length/20)-1));
 function edit(r:Charge){onEdit(r.type==='plan'?'plan':'pricing',{...r.source,...(r.type==='plan'?{}:{pricingType:r.type})});}
 function create(){setNewType('');setServiceId('');setCreating(true);}
 const columns:Column<Charge>[]=[
  {key:'name',header:'收費方式',accessor:r=><button className="min-h-11 text-primary-800 hover:underline" onClick={()=>edit(r)}>{r.name}</button>},
  {key:'type',header:'類型',accessor:r=>labels[r.type]},
  {key:'sessions',header:'次數／期限',accessor:r=>r.type==='plan'?`${(r.source as Plan).sessions} 次／${(r.source as Plan).validDays} 天`:'1 次'},
  {key:'price',header:'金額',align:'right',accessor:r=>r.price===null?'未開放':`NT$ ${r.price.toLocaleString('zh-TW')}`},
  {key:'services',header:'適用服務',accessor:r=>data.services.filter(s=>r.services.includes(s.id)).map(s=>s.name).join('、')||'尚未設定'},
  {key:'status',header:'狀態',accessor:r=>!r.active?'已停用':r.price===null?'未開放':'啟用中'},
  {key:'actions',header:'操作',sticky:'right',accessor:r=><RosterMoreMenu openLabel={canEdit?'編輯':'查看明細'} name={r.name} onOpen={()=>edit(r)}/>},
 ];
 return <section className="space-y-3"><RosterToolbar label="收費方式搜尋與篩選"><input className={field} aria-label="搜尋收費方式" placeholder="搜尋收費方式" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select className={field} aria-label="收費類型篩選" value={type} onChange={e=>{setType(e.target.value);setPage(0);}}><option value="all">全部類型</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><select className={field} aria-label="狀態篩選" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="active">啟用中</option><option value="inactive">已停用</option><option value="all">全部狀態</option></select><select className={field} aria-label="清單排序" value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="name">名稱順序</option><option value="reverse">名稱倒序</option><option value="price">價格由低至高</option></select><button className={field} onClick={()=>{setSearch('');setType('all');setStatus('active');setSort('name');setPage(0);}}>清除篩選</button><span className="text-sm text-earth-500">共 {rows.length} 筆</span>{canEdit&&<button className={field+' ml-auto !bg-primary-700 !text-white'} onClick={create}>＋新增收費方式</button>}</RosterToolbar><DataTable rows={rows.slice(currentPage*20,currentPage*20+20)} rowKey={r=>r.id} columns={columns} empty={<p className="p-6 text-sm">沒有符合條件的資料</p>}/>{rows.length>20&&<nav aria-label="收費方式分頁" className="flex items-center justify-end gap-3 text-sm"><button className={field} disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>上一頁</button><span>{currentPage+1}／{Math.ceil(rows.length/20)}</span><button className={field} disabled={(currentPage+1)*20>=rows.length} onClick={()=>setPage(currentPage+1)}>下一頁</button></nav>}
 {creating&&<RightSheet open presentation="centered" fitContent width={560} labelledById="beauty-new-charge-title" onClose={()=>setCreating(false)}><form className="space-y-3 p-4" onSubmit={e=>{e.preventDefault();if(newType==='plan'){setCreating(false);onEdit('plan');}else{const service=data.services.find(s=>s.id===serviceId&&s.active);if(service){setCreating(false);onEdit('pricing',{...service,pricingType:newType});}}}}><h2 id="beauty-new-charge-title" className="font-semibold">新增收費方式</h2><label className="block">收費類型<select className={field+' mt-1 w-full'} required value={newType} onChange={e=>setNewType(e.target.value)}><option value="">請選擇</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>{newType&&newType!=='plan'&&<label className="block">服務項目<select className={field+' mt-1 w-full'} required value={serviceId} onChange={e=>setServiceId(e.target.value)}><option value="">請選擇</option>{data.services.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}<div className="flex justify-end gap-3"><button type="button" className={field} onClick={()=>setCreating(false)}>取消</button><button className={field+' !bg-primary-700 !text-white'} disabled={!newType||(newType!=='plan'&&!serviceId)}>繼續</button></div></form></RightSheet>}
 </section>;
}
