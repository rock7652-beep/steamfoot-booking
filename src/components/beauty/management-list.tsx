"use client";
import {useState} from 'react';
import {DataTable,type Column} from '@/components/desktop';
import {RosterToolbar} from '@/components/admin/roster-primitives';
import type {BeautyDashboardData} from '@/server/beauty/queries';
import type {EditorKind} from './catalog-editor';
type Row={id:string;name:string;active?:boolean;isActive?:boolean;duration?:number;buffer?:number;price?:number;trialPrice?:number|null;sessions?:number;validDays?:number;allowShared?:boolean;customerPurchasable?:boolean;gender?:string;serviceIds?:string[];userId?:string|null};
export function BeautyManagementList({tab,data,canEdit,onEdit}:{tab:string;data:BeautyDashboardData;canEdit:boolean;onEdit:(kind:EditorKind,draft?:Row)=>void}){
 const [search,setSearch]=useState(''),[status,setStatus]=useState('active'),[page,setPage]=useState(0);
 const kind:EditorKind=tab==='位置管理'?'location':tab==='服務項目'?'service':tab==='收費方式'?'plan':'technician';
 const source:Row[]=kind==='location'?data.locations:kind==='service'?data.services:kind==='plan'?data.plans:data.techs;
 const active=(r:Row)=>r.active??r.isActive??false;
 const rows=source.filter(r=>r.name.includes(search)&&(status==='all'||active(r)===(status==='active'))).sort((a,b)=>Number(active(b))-Number(active(a))||a.name.localeCompare(b.name,'zh-TW'));
 const columns:Column<Row>[]=[{key:'name',header:kind==='location'?'位置':kind==='service'?'服務項目':kind==='plan'?'收費方式':'技師',accessor:r=><button className="min-h-11 text-primary-800 hover:underline" onClick={()=>onEdit(kind,r)}>{r.name}</button>}];
 if(kind==='service')columns.push({key:'time',header:'服務／整理',accessor:r=>`${r.duration} 分鐘／${r.buffer??0} 分鐘`},{key:'price',header:'單次／體驗',accessor:r=>`NT$ ${r.price?.toLocaleString('zh-TW')}／${r.trialPrice===null?'未提供':r.trialPrice?.toLocaleString('zh-TW')}`});
 if(kind==='plan')columns.push({key:'sessions',header:'次數／期限',accessor:r=>`${r.sessions} 次／${r.validDays} 天`},{key:'price',header:'售價',accessor:r=>`NT$ ${r.price?.toLocaleString('zh-TW')}`},{key:'sharing',header:'家人共用／顧客購買',accessor:r=>`${r.allowShared?'可共用':'不共用'}／${r.customerPurchasable?'開放':'僅後台'}`});
 if(kind==='technician')columns.push({key:'gender',header:'性別',accessor:r=>r.gender==='FEMALE'?'女':'男'},{key:'work',header:'工作身分',accessor:r=>r.userId?'已連結會員':'尚未連結'});
 if(kind==='plan'||kind==='technician')columns.push({key:'services',header:'適用服務',accessor:r=>data.services.filter(s=>r.serviceIds?.includes(s.id)).map(s=>s.name).join('、')||'尚未設定'});
 columns.push({key:'status',header:'狀態',accessor:r=><span className={active(r)?'text-primary-800':'text-earth-400'}>{active(r)?'啟用中':'已停用'}</span>},{key:'actions',header:'操作',sticky:'right',accessor:r=><button className="min-h-11 px-3 text-primary-800" onClick={()=>onEdit(kind,r)}>{canEdit?'修改':'查看'}</button>});
 return <section className="space-y-3"><RosterToolbar label={tab+'搜尋與篩選'}><input className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-sm" aria-label={'搜尋'+tab} placeholder={'搜尋'+tab} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select aria-label="狀態篩選" value={status} className="min-h-11 rounded-lg border border-earth-200 bg-white px-3 text-sm" onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="active">啟用中</option><option value="inactive">已停用</option><option value="all">全部狀態</option></select><span className="text-sm text-earth-500">共 {rows.length} 筆</span>{canEdit&&<button className="ml-auto min-h-11 rounded-lg bg-primary-700 px-3 text-sm text-white" onClick={()=>onEdit(kind)}>＋新增{kind==='location'?'位置':kind==='service'?'服務項目':kind==='plan'?'收費方式':'技師'}</button>}</RosterToolbar><DataTable columns={columns} rows={rows.slice(page*20,page*20+20)} rowKey={r=>r.id} empty={<p className="p-6 text-sm">沒有符合條件的資料</p>}/>{rows.length>20&&<nav className="flex justify-end gap-3 text-sm" aria-label="清單分頁"><button disabled={!page} className="min-h-11 px-3" onClick={()=>setPage(page-1)}>上一頁</button><span className="py-3">{page+1}／{Math.ceil(rows.length/20)}</span><button disabled={(page+1)*20>=rows.length} className="min-h-11 px-3" onClick={()=>setPage(page+1)}>下一頁</button></nav>}</section>;
}
